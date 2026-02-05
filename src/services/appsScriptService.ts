/**
 * Service để gọi Google Apps Script API
 * Backend: Google Apps Script Web App
 */

import { getCalendarName } from '../config/auth';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { auth } from '../config/firebase';
import { addCSRFTokenToHeaders } from '../utils/csrfToken';

export interface CalendarEvent {
    title: string;
    start: string; // ISO 8601
    end: string; // ISO 8601
    location?: string;
    description?: string;
    guests?: string;
    signature?: string; // Unique hash/ID for deduplication
}

export interface SyncPayload {
    idToken: string; // Firebase ID token for authentication
    calendarName: string;
    events: CalendarEvent[];
    userEmail?: string; // Optional: for additional verification
}

export interface SyncResponse {
    status: 'success' | 'error';
    message: string;
    data?: {
        total: number;
        success: number;
        failed: number;
        skipped: number;
        errors?: Array<{
            index: number;
            title: string;
            message: string;
        }>;
    };
    timestamp: string;
    executionTime: string;
}

const APPS_SCRIPT_URL = import.meta.env.VITE_BACKEND_URL;


/**
 * Read sheet data via Apps Script
 * @param url - Google Sheet URL
 * @param startRow - Start row index (1-based)
 * @returns Array of data rows (string[][])
 */
export const readSheet = async (
    url: string,
    startRow: number
): Promise<string[][]> => {
    try {
        if (!APPS_SCRIPT_URL) {
            throw new Error('❌ VITE_BACKEND_URL chưa được cấu hình. Vui lòng kiểm tra file .env');
        }

        if (!url || !url.includes('spreadsheets')) {
            throw new Error('❌ URL Google Sheet không hợp lệ');
        }

        const queryParams = new URLSearchParams({
            action: 'readSheet',
            url: url,
            startRow: startRow.toString()
        });

        const fetchUrl = `${APPS_SCRIPT_URL}?${queryParams.toString()}`;
        logInfo(`Reading sheet from: ${fetchUrl}`);

        const response = await fetch(fetchUrl);

        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                throw new Error('❌ Lỗi truy cập Sheet: Vui lòng kiểm tra lại quyền chia sẻ file. File phải được chia sẻ công khai hoặc với tài khoản của bạn.');
            }
            if (response.status === 404) {
                throw new Error('❌ Không tìm thấy Sheet. Vui lòng kiểm tra lại URL.');
            }
            throw new Error(`❌ Lỗi HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // ✅ TASK 2: Strict error checking - Never show success for errors
        if (data.status === 'error') {
            throw new Error(`❌ ${data.message || 'Lỗi không xác định từ Apps Script'}`);
        }

        if (!data.data || !Array.isArray(data.data)) {
            throw new Error('❌ Dữ liệu trả về không hợp lệ');
        }

        if (data.data.length === 0) {
            throw new Error('❌ Sheet không có dữ liệu hoặc dòng bắt đầu không đúng');
        }

        // Apps Script returns { status: 'success', data: [...] }
        logSuccess(`✅ Đã tải ${data.data.length} dòng dữ liệu`);
        return data.data || [];
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '❌ Không thể đọc dữ liệu từ Sheet';
        logError('Read sheet error:', errorMessage);
        throw new Error(errorMessage);
    }
};

export const syncEventsToCalendar = async (
    events: CalendarEvent[],
    calendarName?: string
): Promise<SyncResponse> => {
    try {
        if (!APPS_SCRIPT_URL) {
            throw new Error('VITE_BACKEND_URL is not configured');
        }

        if (!Array.isArray(events) || events.length === 0) {
            throw new Error('Events array cannot be empty');
        }

        // Get current user and ID token for authentication
        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error('User not authenticated. Please login first.');
        }

        // Get Firebase ID token for backend verification
        const idToken = await currentUser.getIdToken();
        if (!idToken) {
            throw new Error('Failed to get authentication token');
        }

        // Use provided calendar name or get from config
        const targetCalendar = calendarName || getCalendarName();

        const payload: SyncPayload = {
            idToken, // Send ID token for backend verification
            calendarName: targetCalendar,
            events,
            userEmail: currentUser.email || undefined,
        };

        logInfo('Syncing events to Apps Script:', {
            eventCount: events.length,
            calendarName: targetCalendar,
            userEmail: currentUser.email
        });

        // ✅ CORS FIX: Use text/plain and no custom headers to avoid Preflight (OPTIONS)
        // Google Apps Script handles POST requests better with text/plain or default content type
        // when called from browser to avoid strict CORS preflight checks.

        // Determine URL: Use Proxy in DEV needed for localhost to bypass CORS
        const isDev = import.meta.env.DEV;
        const url = isDev ? '/api/appscript' : APPS_SCRIPT_URL;

        logInfo(`Sending request to: ${url} (Dev mode: ${isDev})`);

        const response = await fetch(url, {
            method: 'POST',
            // ⚠️ CRITICAL: Do NOT set Content-Type to application/json, it triggers Preflight
            // ⚠️ CRITICAL: Do NOT add custom headers like X-CSRF-Token
            // Browser will auto-detect or default to text/plain which is a "Simple Request"
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Read text first to enable logging raw response even if JSON parsing fails
        const text = await response.text();

        let data: SyncResponse;
        try {
            data = JSON.parse(text);
        } catch (jsonError) {
            logError('Failed to parse JSON response. Raw text:', text);
            throw new Error(`Apps Script returned invalid JSON. Possible auth or config issue. Raw: ${text.substring(0, 200)}...`);
        }

        logSuccess('Sync response:', data);

        if (data.status === 'error') {
            throw new Error(data.message || 'Unknown error from Apps Script');
        }

        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to sync events';
        logError('Sync error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Convert normalized rows to calendar events
 * @param rows - Normalized data rows
 * @returns Calendar events
 */
export const convertRowsToEvents = (rows: Array<{
    task: string;
    date: string;
    startTime: string;
    endTime: string;
    location?: string;
}>): CalendarEvent[] => {
    return rows.map((row) => ({
        title: row.task,
        start: row.startTime,
        end: row.endTime,
        location: row.location || '',
    }));
};
