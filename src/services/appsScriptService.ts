
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
    resources?: string[]; // ✅ ADDED: For conflict detection
}

export interface SyncPayload {
    idToken: string;
    calendarName: string;
    events: CalendarEvent[];
    userEmail?: string;
    secret?: string; // 🔐 Required for direct GAS calls (local proxy)
}

export interface ClearPayload {
    idToken?: string;
    action: 'clearCalendar';
    calendarName: string;
    secret?: string;
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

// ✅ API Base URL handles different environments Correctly
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Read sheet data via Vercel Proxy
 */
export const readSheet = async (
    url: string,
    startRow: number
): Promise<string[][]> => {
    try {
        if (!url || !url.includes('spreadsheets')) {
            throw new Error('❌ URL Google Sheet không hợp lệ');
        }

        const queryParams = new URLSearchParams({
            action: 'readSheet',
            url: url, // ✅ Uniform parameter name
            startRow: startRow.toString()
        });

        const fetchUrl = `${API_BASE_URL}/api/readSheet?${queryParams.toString()}`;
        logInfo(`Reading sheet via proxy: ${fetchUrl}`);

        const response = await fetch(fetchUrl);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const detail = errData.detail ? ` (${errData.detail})` : (errData.error ? ` (${errData.error})` : '');
            throw new Error(`❌ Lỗi Proxy API ${response.status}: ${response.statusText}${detail}`);
        }

        const data = await response.json();

        if (data.status === 'error') {
            throw new Error(`❌ ${data.message || 'Lỗi không xác định từ Apps Script'}`);
        }

        if (!data.data || !Array.isArray(data.data)) {
            throw new Error('❌ Dữ liệu trả về không hợp lệ');
        }

        logSuccess(`✅ Đã tải ${data.data.length} dòng dữ liệu`);
        return data.data || [];
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '❌ Không thể đọc dữ liệu';
        logError('Read sheet error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Sync events via Vercel Proxy
 */
export const syncEventsToCalendar = async (
    events: CalendarEvent[],
    calendarName?: string
): Promise<SyncResponse> => {
    try {
        if (!Array.isArray(events) || events.length === 0) {
            throw new Error('Events array cannot be empty');
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error('User not authenticated. Please login first.');
        }

        const idToken = await currentUser.getIdToken();
        if (!idToken) {
            throw new Error('Failed to get authentication token');
        }

        const targetCalendar = calendarName || getCalendarName();

        const payload: SyncPayload = {
            idToken,
            calendarName: targetCalendar,
            events,
            userEmail: currentUser.email || undefined,
            secret: import.meta.env.VITE_GAS_SECRET, // 🔐 Automatically include secret from env
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        logInfo(`Syncing events via proxy: ${syncUrl}`);
        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: addCSRFTokenToHeaders({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            }),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            logError(`Sync returned status ${response.status}: ${response.statusText}`);
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || data.error || `Proxy error! status: ${response.status}`);
        }

        const data = await response.json();

        // 🚨 HANDLE CONFLICTS (409)
        if (response.status === 409) {
            const conflictMsg = data.conflicts 
              ? `Xung đột lịch trình: ${data.conflicts.map((c: any) => c.message).join(' | ')}`
              : 'Phát hiện xung đột lịch trình với dữ liệu đã có trong hệ thống.';
            throw new Error(conflictMsg);
        }

        if (!response.ok) {
            throw new Error(data.message || data.error || `Proxy error! status: ${response.status}`);
        }

        if (data.status === 'error') {
            throw new Error(data.message || 'Unknown error from backend');
        }

        logSuccess('Sync successful');
        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to sync events';
        logError('Sync error:', errorMessage);
        throw new Error(errorMessage);
    }
};

/**
 * Clear all events created by the app
 */
export const clearCalendar = async (
    calendarName?: string
): Promise<SyncResponse> => {
    try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : undefined;
        
        const targetCalendar = calendarName || getCalendarName();

        const payload: ClearPayload = {
            idToken,
            action: 'clearCalendar',
            calendarName: targetCalendar,
            secret: import.meta.env.VITE_GAS_SECRET,
        };

        const syncUrl = `${API_BASE_URL}/api/sync`;
        logInfo(`Clearing calendar via proxy: ${syncUrl}`);
        
        const response = await fetch(syncUrl, {
            method: 'POST',
            headers: addCSRFTokenToHeaders({
                'Content-Type': 'application/json',
                ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
            }),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Proxy error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(data.message || 'Unknown error from backend during clear');
        }

        logSuccess('Calendar cleared successfully');
        return data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to clear calendar';
        logError('Clear error:', errorMessage);
        throw new Error(errorMessage);
    }
};

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
