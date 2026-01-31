/**
 * Service để gọi Google Apps Script API
 * Backend: Google Apps Script Web App
 */

export interface CalendarEvent {
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  location?: string;
  description?: string;
  guests?: string;
}

export interface SyncPayload {
  calendarName: string;
  events: CalendarEvent[];
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
 * @param calendarName - Target calendar name
 * @returns Sync result
 */
export const syncEventsToCalendar = async (
  events: CalendarEvent[],
  calendarName: string = 'Schedule Teaching'
): Promise<SyncResponse> => {
  try {
    if (!APPS_SCRIPT_URL) {
      throw new Error('VITE_BACKEND_URL is not configured');
    }

    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('Events array cannot be empty');
    }

    const payload: SyncPayload = {
      calendarName,
      events,
    };

    console.log('Syncing events to Apps Script:', payload);

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SyncResponse = await response.json();

    console.log('Sync response:', data);

    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync events';
    console.error('Sync error:', errorMessage);
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
