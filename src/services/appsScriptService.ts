
/**
 * Service to call Google Apps Script API via Vercel Proxy
 * This architecture bypasses CORS issues by using a server-side proxy.
 */

import { getCalendarName } from '../config/auth';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { auth } from '../config/firebase';
import { rateLimiter } from '../utils/rateLimiter';
import { addCSRFTokenToHeaders } from '../utils/csrfToken';

export interface CalendarEvent {
    title: string;
    start: string; // ISO 8601
    end: string; // ISO 8601
    location?: string;
    description?: string;
    guests?: string;
    signature?: string; 
    resources?: string[]; 
    sheetType?: string; // 🚀 NEW: 'council' or 'review'
    subEvents?: any[]; // 📧 NEW: Danh sách các buổi chấm lẻ
}

export interface SyncPayload {
    idToken: string;
    calendarName: string;
    events: CalendarEvent[];
    userEmail?: string;
    secret?: string; // Required for direct GAS calls (local proxy)
    googleAccessToken?: string; 
    force?: boolean; 
    conflictMode?: 'insert' | 'keep_old' | 'replace'; 
    sheetType?: 'council' | 'review'; 
    skipCleanup?: boolean; // 🚀 NEW: For chunked sync
}

export interface ClearPayload {
    idToken?: string;
    action: 'clearCalendar' | 'getAppEventIds'; 
    calendarName: string;
    secret?: string;
    googleAccessToken?: string; 
    sheetType?: 'council' | 'review'; 
    sendUpdates?: boolean; 
    eventIds?: string[]; // 🚀 NEW: For chunked deletion
}

export interface SyncResponse {
    status: 'success' | 'error';
    message: string;
    data?: {
        total: number;
        success: number;
        failed: number;
        skipped: number;
        calendarName?: string;
        calendarId?: string;
        availableCalendars?: string[];
        deletedCount?: number; // 🚀 NEW: For chunked clear
        errors?: Array<{
            index: number;
            title: string;
            message: string;
        }>;
        conflicts?: Array<{
            newEvent: string;
            newStart: string;
            newEnd: string;
            oldEvent: string;
            oldStart: string;
            oldEnd: string;
            oldEventId: string;
        }>;
    };
    timestamp: string;
    executionTime: string;
}

// ✅ API Base URL handles different environments Correctly
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Read sheet data via Vercel Proxy
 */
export const readSheet = async (
    url: string,
    startRow: number,
    tabName?: string
): Promise<{ data: string[][]; tabName: string; allTabs?: string[] }> => {
    try {
        if (!url || !url.includes('spreadsheets')) {
            throw new Error('URL Google Sheet không hợp lệ');
        }

        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;

        const payload = {
            action: 'readSheet',
            url: url,
            tabName: tabName,
            startRow: startRow.toString(),
            idToken: idToken,
            t: Date.now(), // 🚀 Cache-buster: Force fresh data from proxy/GAS
            // 🔐 Tự động thêm secret ở môi trường Local để hỗ trợ Vite Proxy
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const fetchUrl = `${API_BASE_URL}/api/readSheet?t=${Date.now()}`;
        logInfo(`Reading sheet via proxy (POST): ${fetchUrl}`);

        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const bodyText = await response.text().catch(() => '');
            logError(`Proxy returned ${response.status}: ${bodyText.substring(0, 100)}`);
            throw new Error(`Lỗi Proxy API ${response.status}: ${response.statusText}`);
        }

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseErr) {
            if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
                throw new Error('Google Apps Script trả về trang HTML (có thể là yêu cầu đăng nhập hoặc lỗi 404). Vui lòng đảm bảo bạn đã triển khai (Deploy) script ở chế độ "Anyone" và dùng URL "exec".');
            }
            throw new Error(`Không thể parse JSON từ Apps Script. Nội dung: ${responseText.substring(0, 50)}...`);
        }

        if (data.status === 'error') {
            throw new Error(`${data.message || 'Lỗi không xác định từ Apps Script'}`);
        }

        if (!data.data || !Array.isArray(data.data)) {
            throw new Error('Dữ liệu trả về không hợp lệ');
        }

        logSuccess(`Đã tải ${data.data.length} dòng dữ liệu từ tab: ${data.tabName}`);
        return {
            data: data.data || [],
            tabName: data.tabName || tabName || 'Sheet1',
            allTabs: data.allTabs || []
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Không thể đọc dữ liệu';
        logError('Read sheet error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Sync events via Vercel Proxy
 */
export const syncEventsToCalendar = async (
    events: CalendarEvent[],
    calendarName?: string,
    force: boolean = false,
    googleAccessToken?: string,
    conflictMode?: 'insert' | 'keep_old' | 'replace',
    sheetType?: 'council' | 'review'
): Promise<SyncResponse> => {
    try {
        if (!Array.isArray(events) || events.length === 0) {
            throw new Error('Events array cannot be empty');
        }

        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('User not authenticated. Please login first.');

        const idToken = await currentUser.getIdToken();
        const targetCalendar = calendarName || getCalendarName();

        // 🚀 CHUNKING LOGIC: Chia thành các đợt 30 mục để tránh Vercel/Proxy Timeout (10s)
        const CHUNK_SIZE = 30;
        const totalChunks = Math.ceil(events.length / CHUNK_SIZE);
        
        let combinedResult: SyncResponse = {
            status: 'success',
            message: 'Đang xử lý...',
            data: { total: events.length, success: 0, failed: 0, skipped: 0, errors: [] },
            timestamp: new Date().toISOString(),
            executionTime: '0ms'
        };

        logInfo(`🚀 Bắt đầu đồng bộ ${events.length} mục (Chia làm ${totalChunks} đợt)`);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = events.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const isFirstChunk = i === 0;
            const isLastChunk = i === totalChunks - 1;
            
            // 💡 Quan trọng: Chỉ đợt ĐẦU TIÊN là được phép Cleanup (xóa lịch thừa).
            // Các đợt sau phải skipCleanup=true để không xóa dữ liệu của đợt trước.
            const skipCleanup = !isFirstChunk;

            logInfo(`📦 Gửi đợt ${i + 1}/${totalChunks} (${chunk.length} mục)...`);

            const payload: SyncPayload = {
                idToken,
                calendarName: targetCalendar,
                events: chunk,
                userEmail: currentUser.email || undefined,
                force: force,
                googleAccessToken: googleAccessToken,
                conflictMode: conflictMode,
                sheetType: sheetType,
                skipCleanup: skipCleanup,
                ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
            };

            const response = await fetch(`${API_BASE_URL}/api/sync`, {
                method: 'POST',
                headers: addCSRFTokenToHeaders({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }),
                body: JSON.stringify(payload),
            });

            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseErr) {
                if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
                    throw new Error('Google Apps Script trả về trang HTML (có thể do lỗi Deploy hoặc Script bị treo). Vui lòng kiểm tra Apps Script Dashboard.');
                }
                if (!responseText.trim()) {
                    throw new Error('Apps Script trả về phản hồi rỗng (Empty Response). Điều này có thể do Script bị Crash hoặc hết thời gian thực thi.');
                }
                throw new Error(`SyntaxError: Không thể parse JSON. Nội dung: ${responseText.substring(0, 100)}...`);
            }

            if (response.status === 409) return data; // Conflicts

            if (!response.ok || data.status === 'error') {
                throw new Error(data.message || data.error || `Lỗi ở đợt ${i+1}`);
            }

            // Cộng dồn kết quả
            const d = data.data || {};
            combinedResult.data!.success += (d.success || 0);
            combinedResult.data!.failed += (d.failed || 0);
            combinedResult.data!.skipped += (d.skipped || 0);
            if (d.errors) combinedResult.data!.errors = [...(combinedResult.data!.errors || []), ...d.errors];
            if (d.conflicts) combinedResult.data!.conflicts = [...(combinedResult.data!.conflicts || []), ...d.conflicts];
            
            if (isLastChunk) {
                combinedResult.message = `Đã đồng bộ xong ${events.length} mục. Thành công: ${combinedResult.data!.success}`;
                combinedResult.data!.calendarName = d.calendarName;
            }
        }

        logSuccess('Sync successful');
        return combinedResult;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to sync';
        logError('Sync error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Clear all events created by the app
 */
/**
 * Clear all events created by the app (Chunked version)
 */
export const clearCalendar = async (
    calendarName?: string,
    googleAccessToken?: string,
    sheetType?: 'council' | 'review',
    sendUpdates: boolean = false
): Promise<SyncResponse> => {
    try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;
        const targetCalendar = calendarName || getCalendarName();

        // 1️⃣ BƯỚC 1: Lấy danh sách ID cần xóa (Rất nhanh, không gây Timeout)
        logInfo('🔍 Đang liệt kê danh sách sự kiện cần xóa...');
        const eventIds = await getAppEventIds(calendarName, googleAccessToken, sheetType);
        
        if (eventIds.length === 0) {
            logSuccess('Không tìm thấy sự kiện nào để xóa.');
            return {
                status: 'success',
                message: 'Không có sự kiện nào cần xóa.',
                data: { total: 0, success: 0, failed: 0, skipped: 0 },
                timestamp: new Date().toISOString(),
                executionTime: '0ms'
            };
        }

        logInfo(`🗑️ Tìm thấy ${eventIds.length} sự kiện. Bắt đầu xóa đợt (25 mục/đợt)...`);

        // 2️⃣ BƯỚC 2: Xóa theo từng đợt (Chunks) để tránh Timeout Proxy (10s)
        const CHUNK_SIZE = 25; 
        const totalChunks = Math.ceil(eventIds.length / CHUNK_SIZE);
        let deletedCount = 0;

        for (let i = 0; i < totalChunks; i++) {
            const chunk = eventIds.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            logInfo(`📦 Đang xóa đợt ${i + 1}/${totalChunks} (${chunk.length} mục)...`);

            const payload: ClearPayload = {
                idToken,
                action: 'clearCalendar',
                calendarName: targetCalendar,
                googleAccessToken: googleAccessToken,
                sheetType: sheetType,
                sendUpdates: sendUpdates,
                eventIds: chunk,
                ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
            };

            const ctrl = new AbortController();
            const tid = setTimeout(() => {
                logError(`⏳ Đợt ${i + 1} mất quá nhiều thời gian (>60s). Đang hủy...`);
                ctrl.abort();
            }, 60000); // 60s timeout
            const response = await fetch(`${API_BASE_URL}/api/sync`, {
                method: 'POST',
                headers: addCSRFTokenToHeaders({
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
                }),
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            }).finally(() => clearTimeout(tid));

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || `Lỗi xóa ở đợt ${i + 1}`);
            }

            const resData = await response.json();
            
            // 🛡️ Bổ sung kiểm tra status từ Apps Script Proxy
            if (resData.status === 'error') {
                throw new Error(resData.message || resData.error || `Lỗi xóa ở đợt ${i + 1}`);
            }

            deletedCount += (resData.data?.deletedCount || chunk.length);
        }

        logSuccess(`Đã xóa sạch ${deletedCount} sự kiện.`);
        return {
            status: 'success',
            message: `Đã xóa sạch ${deletedCount} sự kiện.`,
            data: { 
                total: deletedCount, 
                success: deletedCount, 
                failed: 0, 
                skipped: 0,
                deletedCount: deletedCount 
            },
            timestamp: new Date().toISOString(),
            executionTime: '0ms'
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to clear calendar';
        logError('Clear error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * 💥 GLOBAL RECALL: Xóa triệt để Silent Sync & Proxy Invitations
 */
export const globalRecallAppEvents = async (
    sheetType?: 'council' | 'review'
): Promise<any> => {
    try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;

        const payload = {
            action: 'globalRecall',
            sheetType,
            sendUpdates: true, // Xóa triệt để
            idToken,
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const ctrl = new AbortController();
        const tid = setTimeout(() => {
            logError("⏳ Global Recall quá lâu (>120s). Đang hủy...");
            ctrl.abort();
        }, 120000); // Tác vụ này có thể mất thời gian do quét Firebase + nhiều Tokens
        
        const response = await fetch(`${API_BASE_URL}/api/sync`, {
            method: 'POST',
            headers: addCSRFTokenToHeaders({
                'Content-Type': 'application/json',
                ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
            }),
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        }).finally(() => clearTimeout(tid));

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || "Failed to execute global recall");
        }

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || data.error || "Global Recall Failed");
        }

        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Global recall failed';
        logError('Global recall error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * 🔍 Helper: Lấy danh sách ID các sự kiện do App tạo ra
 */
export const getAppEventIds = async (
    calendarName?: string,
    googleAccessToken?: string,
    sheetType?: 'council' | 'review'
): Promise<string[]> => {
    try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;
        const targetCalendar = calendarName || getCalendarName();

        const payload: ClearPayload = {
            idToken,
            action: 'getAppEventIds',
            calendarName: targetCalendar,
            googleAccessToken: googleAccessToken,
            sheetType: sheetType,
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            logError("⏳ Lấy danh sách ID mất quá nhiều thời gian (>60s). Đang hủy...");
            controller.abort();
        }, 60000); // 60s timeout
        const response = await fetch(`${API_BASE_URL}/api/sync`, {
            method: 'POST',
            headers: addCSRFTokenToHeaders({
                'Content-Type': 'application/json',
                ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
            }),
            body: JSON.stringify(payload),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || 'Không thể lấy danh sách ID');
        }

        const resData = await response.json();
        
        // 🛡️ Không được nuốt lỗi (No error swallowing)
        if (resData.status === 'error') {
            throw new Error(resData.message || resData.error || 'Lỗi không xác định từ Apps Script');
        }

        return resData.data || [];
    } catch (error) {
        logError('Get App Event IDs error:', error);
        throw error; // 🚀 Quan trọng: Phải ném lỗi để Hook xử lý Re-auth hoặc báo lỗi UI
    }
};

export const invalidateAdminCache = async (): Promise<void> => {
    try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;
        
        const payload = {
            action: 'clearWhitelistCache',
            idToken,
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        logSuccess('Admin cache invalidated on server');
    } catch (error) {
        logError('Failed to invalidate admin cache');
    }
};

export const setupNotifications = async (url: string, tabName?: string): Promise<{ status: string; message: string }> => {
    try {
        if (!url || !url.includes('spreadsheets')) {
            throw new Error('URL Google Sheet không hợp lệ');
        }

        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;

        const payload = {
            action: 'setupNotifications',
            url: url,
            tabName: tabName,
            idToken: idToken,
            // 🔐 Tự động thêm secret ở môi trường Local để hỗ trợ Vite Proxy
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        logInfo(`Setting up notifications via proxy: ${syncUrl}`);

        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Lỗi Proxy API ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Lỗi từ Backend');
        }

        logSuccess('Notification setup successful');
        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Không thể thiết lập thông báo';
        logError('Setup notifications error:', errorMessage);
        throw new Error(errorMessage);
    }
};

export const disableNotifications = async (url: string, tabName?: string): Promise<{ status: string; message: string }> => {
    try {
        if (!url || !url.includes('spreadsheets')) {
            throw new Error('URL Google Sheet không hợp lệ');
        }

        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;

        const payload = {
            action: 'disableNotifications',
            url: url,
            tabName: tabName,
            idToken: idToken,
            // 🔐 Tự động thêm secret ở môi trường Local để hỗ trợ Vite Proxy
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        logInfo(`Disabling notifications via proxy: ${syncUrl}`);

        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Lỗi Proxy API ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Lỗi từ Backend');
        }

        logSuccess('Notification disable successful');
        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Không thể tắt thông báo';
            throw new Error(errorMessage);
    }
};

export const notifyLecturers = async (
    lecturers: Array<{ email: string; name: string; events: any[] }>,
    sheetUrl?: string,
    tabName?: string,
    sheetType?: 'council' | 'review'
): Promise<any> => {
    try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;

        const payload = {
            action: 'notifyLecturers',
            lecturers,
            sheetUrl,
            tabName,
            sheetType,
            idToken,
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': idToken ? `Bearer ${idToken}` : ''
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Lỗi từ Backend');
        }

        logSuccess('Notification successful');
        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Không thể gửi thông báo';
        logError('Send notifications error:', errorMessage);
        throw new Error(errorMessage);
    }
};

export const respondToInvitations = async (
    email: string,
    action: 'accept' | 'decline' | 'maybe'
): Promise<any> => {
    try {
        const payload = {
            action: 'respondToInvitations',
            email,
            actionValue: action, // renamed to actionValue for safety if needed
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        logInfo(`Responding to invitations for ${email} with action ${action}`);

        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Lỗi phản hồi RSVP');
        }

        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Lỗi kết nối';
        logError('RespondToInvitations error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * 🔑 Exchange OAuth Authorization Code for Refresh Token (Option 2)
 */
export const exchangeOAuthCode = async (email: string, code: string): Promise<any> => {
    try {
        const payload = {
            action: 'exchangeOAuthCode',
            email,
            code,
            redirectUri: window.location.origin + '/', // 🔑 Pass actual URI to match what was sent to Google
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        logInfo(`Exchanging OAuth code for ${email}`);

        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Lỗi trao đổi mã OAuth');
        }

        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Lỗi kết nối OAuth';
        logError('exchangeOAuthCode error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * 📅 Check if lecturer has a valid Calendar Connection
 */
export const getLecturerTokenStatus = async (email: string): Promise<boolean> => {
    try {
        const payload = {
            action: 'getLecturerTokenStatus',
            email,
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        return data.connected === true;
    } catch (error) {
        logError('getLecturerTokenStatus error:', error);
        return false;
    }
};

export const getTabNames = async (url: string): Promise<string[]> => {
    try {
        if (!url || !url.includes('spreadsheets')) {
            throw new Error('URL Google Sheet không hợp lệ');
        }

        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;

        const payload = {
            action: 'getTabNames',
            url: url,
            idToken: idToken,
            ...(import.meta.env.DEV ? { secret: import.meta.env.VITE_GAS_SECRET } : {})
        };

        const fetchUrl = `${API_BASE_URL}/api/readSheet?t=${Date.now()}`;
        logInfo(`Fetching tab names via proxy: ${fetchUrl}`);

        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Lỗi Proxy API ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Lỗi từ Backend');
        }

        return data.tabs || [];
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Không thể lấy danh sách tab';
        logError('Get tabs error:', errorMessage);
        throw new Error(errorMessage);
    }
};

export const convertRowsToEvents = (rows: Array<{
    task: string;
    date: string;
    startTime: string;
    endTime: string;
    location?: string;
    resources?: string[];
}>): CalendarEvent[] => {
    return rows.map((row) => ({
        title: row.task,
        start: row.startTime,
        end: row.endTime,
        location: row.location || '',
        resources: row.resources || [],
    }));
};
