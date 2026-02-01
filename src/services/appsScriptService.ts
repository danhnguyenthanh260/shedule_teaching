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
 * Sync events to Google Calendar via Apps Script
 * @param events - Array of events to sync
 * @param calendarName - Target calendar name (optional, uses env default)
 * @returns Sync result
 */
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

    // ✅ Add CSRF token to headers for defense-in-depth
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    headers = addCSRFTokenToHeaders(headers);

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SyncResponse = await response.json();

    logSuccess('Sync response:', data);

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
