
/**
 * Service to call Google Apps Script API via Vercel Proxy
 * This architecture bypasses CORS issues by using a server-side proxy.
 */

import { getCalendarName } from '../config/auth';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { auth } from '../config/firebase';

export interface CalendarEvent {
    title: string;
    start: string; // ISO 8601
    end: string; // ISO 8601
    location?: string;
    description?: string;
    guests?: string;
    signature?: string; 
}

export interface SyncPayload {
    idToken: string;
    calendarName: string;
    events: CalendarEvent[];
    userEmail?: string;
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

// ✅ Use local API route for both DEV and PROD
const PROXY_API_URL = '/api/readSheet';

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

        const fetchUrl = `${PROXY_API_URL}?${queryParams.toString()}`;
        logInfo(`Reading sheet via proxy: ${fetchUrl}`);

        const response = await fetch(fetchUrl);

        if (!response.ok) {
            throw new Error(`❌ Lỗi Proxy API ${response.status}: ${response.statusText}`);
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
        };

        logInfo('Syncing events via proxy...');

        const response = await fetch(PROXY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Proxy error! status: ${response.status}`);
        }

        const data = await response.json();

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
