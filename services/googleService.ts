
import { RowNormalized, InferredSchema, SyncResult, ColumnMapping } from '../types';
import { inferSchema } from '../lib/inference';
import { parseVNTime, generateRowId } from '../lib/utils';
import { parseHeadersFromSheet, parseMergedCells, MergedCellGroup } from '../lib/headerParser';

export class GoogleSyncService {
  private async fetchWithAuth(url: string, token: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || 'Google API Error');
    }
    return res.json();
  }

  extractSheetId(url: string): string | null {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  async loadSheet(url: string, tab: string, token: string): Promise<{ rows: RowNormalized[], schema: InferredSchema, headers: string[], rawRows: string[][], allRows: string[][], sheetId: string, headerRowIndex: number, mergedCells: MergedCellGroup[] }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Google Sheet khong hop le.");

    // Fetch du lieu tu Google Sheets API v4
    const range = `${tab}!A1:BE500`;
    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      token
    );

    const values: string[][] = data.values;
    if (!values || values.length < 1) throw new Error("Sheet khong co du lieu.");

    // Parse headers theo cau truc co dinh: Row 2 + Row 3 (index 1 + 2)
    const headers = parseHeadersFromSheet(values);

    // Parse merged cells (cau truc co dinh)
    const mergedCells = parseMergedCells();

    // Du lieu bat dau tu row 4 (index 3)
    const headerRowIndex = 2; // Row 3 (0-based index 2) la header chi tiet cuoi cung
    const rawData = values.slice(3); // Data from row 4 (index 3) onwards

    // Chi lay 5 dong dau de suy luan schema (performance)
    const schema = inferSchema(headers, rawData.slice(0, 5));

    const normalized = this.normalizeRows({
      sheetId,
      tab,
      headers,
      rawRows: rawData,
      mapping: schema.mapping,
      headerRowIndex
    });

    return { rows: normalized, schema, headers, rawRows: rawData, allRows: values, sheetId, headerRowIndex, mergedCells };
  }

  normalizeRows(params: {
    sheetId: string;
    tab: string;
    headers: string[];
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
  }): RowNormalized[] {
    const { sheetId, tab, headers, rawRows, mapping, headerRowIndex } = params;

    if (mapping.date === undefined || mapping.time === undefined) {
      return [];
    }

    return rawRows
      .filter(row => {
        const dateVal = (row[mapping.date!] || "").toString().trim();
        const timeVal = (row[mapping.time!] || "").toString().trim();
        return dateVal && timeVal;
      })
      .map((row, idx): RowNormalized | null => {
        try {
          const dateStr = (row[mapping.date!] || "").toString().trim();
          const timeStr = (row[mapping.time!] || "").toString().trim();

          const { start, end } = parseVNTime(dateStr, timeStr);
          const person = mapping.person !== undefined ? ((row[mapping.person] || "").toString().trim() || "Unknown") : "Unknown";

          const rawMap: Record<string, string> = {};
          headers.forEach((h, i) => rawMap[h || `Column ${i + 1}`] = (row[i] || "").toString());

          const sheetRowNumber = headerRowIndex + 2 + idx;

          return {
            id: generateRowId(sheetId, tab, sheetRowNumber, person),
            date: dateStr,
            startTime: start,
            endTime: end,
            person: person,
            email: mapping.email !== undefined ? (row[mapping.email] || "").toString().trim() || undefined : undefined,
            task: mapping.task !== undefined ? ((row[mapping.task] || "").toString().trim() || "Nhiem vu khong ten") : "Nhiem vu khong ten",
            location: mapping.location !== undefined ? ((row[mapping.location] || "").toString().trim() || "Chua xac dinh") : "Chua xac dinh",
            raw: rawMap,
            status: 'pending'
          };
        } catch (e) {
          console.warn(`Bo qua dong ${headerRowIndex + 2 + idx} do loi parse:`, e);
          return null;
        }
      })
      .filter((r): r is RowNormalized => r !== null);
  }

  async syncToCalendar(rows: RowNormalized[], token: string): Promise<SyncResult> {
    const stats = { created: 0, updated: 0, failed: 0, logs: [] as string[] };

    for (const row of rows) {
      try {
        const newStart = new Date(row.startTime).getTime();
        const newEnd = new Date(row.endTime).getTime();
        const newSummary = `[${row.task}] - ${row.person}`;

        // Bước 1: Quét toàn bộ lịch trong ngày để tìm "Vùng va chạm"
        const eventDate = new Date(row.startTime);
        const timeMin = new Date(eventDate).setHours(0, 0, 0, 0);
        const timeMax = new Date(eventDate).setHours(23, 59, 59, 999);

        const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date(timeMin).toISOString()}&timeMax=${new Date(timeMax).toISOString()}&singleEvents=true`;
        const searchResult = await this.fetchWithAuth(searchUrl, token);
        const existingEvents = searchResult.items || [];

        // Bước 2: Tìm TẤT CẢ các ca bị xâm lấn (Overlap)
        // Thuật toán: (Start_A < End_B) AND (End_A > Start_B)
        const conflictingEvents = existingEvents.filter((event: any) => {
          const exStart = new Date(event.start.dateTime).getTime();
          const exEnd = new Date(event.end.dateTime).getTime();
          return newStart < exEnd && newEnd > exStart;
        });

        const eventPayload = {
          summary: newSummary,
          location: row.location,
          description: Object.entries(row.raw).map(([k, v]) => `${k}: ${v}`).join('\n'),
          start: { dateTime: row.startTime, timeZone: 'Asia/Ho_Chi_Minh' },
          end: { dateTime: row.endTime, timeZone: 'Asia/Ho_Chi_Minh' },
        };

        // Bước 3: Xử lý dựa trên kết quả va chạm
        if (conflictingEvents.length > 0) {
          const conflictNames = conflictingEvents.map((e: any) => e.summary).join(', ');

          // Cảnh báo chi tiết các ca bị ảnh hưởng
          const userConfirmed = window.confirm(
            `Phát hiện xung đột thời gian!\n\n` +
            `Ca mới: ${new Date(newStart).toLocaleTimeString()} - ${new Date(newEnd).toLocaleTimeString()}\n` +
            `Lịch bị đè: ${conflictNames}\n\n` +
            `Bạn có muốn xóa các lịch cũ này để cập nhật không?`
          );

          if (!userConfirmed) {
            stats.logs.push(`Hủy bỏ do xung đột: ${row.task}`);
            continue;
          }

          // Xóa tất cả các ca gây xung đột (xử lý được cả trường hợp 1 ca cũ bị xé thành 2 ca mới)
          for (const conflict of conflictingEvents) {
            await this.fetchWithAuth(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${conflict.id}`,
              token,
              { method: 'DELETE' }
            );
          }
        }

        // Bước 4: Thêm ca mới sau khi vùng ảnh hưởng đã sạch
        await this.fetchWithAuth(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          token,
          { method: 'POST', body: JSON.stringify(eventPayload) }
        );

        stats.created++;
        stats.logs.push(`Đồng bộ thành công: ${row.task}`);

      } catch (e: any) {
        console.error(e);
        stats.failed++;
        stats.logs.push(`Lỗi ${row.task}: ${e.message}`);
      }
    }
    return stats;
  }

  private hashRow(row: RowNormalized): string {
    // Create hash cho idempotency tracking
    const rowString = `${row.date}|${row.startTime}|${row.person}|${row.task}|${row.location}`;
    let hash = 0;
    for (let i = 0; i < rowString.length; i++) {
      const char = rowString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Handle synchronization of a calendar event with exact time validation
   * Prevents stacked events by only confirming on exact matches (same title + same start time)
   * @param newEvent - The new event to sync (must have summary, start.dateTime)
   * @param token - Google OAuth token
   * @returns Promise<{ success: boolean, message: string, eventId?: string }>
   */
  async handleSyncCalendarEvent(
    newEvent: {
      summary: string;
      start: { dateTime: string };
      end?: { dateTime: string };
      location?: string;
      description?: string;
    },
    token: string
  ): Promise<{ success: boolean; message: string; eventId?: string }> {
    try {
      // 1. Get the start and end of the current day from newEvent's dateTime
      const newEventDate = new Date(newEvent.start.dateTime);
      const startOfDay = new Date(newEventDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(newEventDate);
      endOfDay.setHours(23, 59, 59, 999);

      // 2. Fetch existing events for the current day
      const listUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&singleEvents=true&orderBy=startTime`;

      const listResponse = await this.fetchWithAuth(listUrl, token);
      const existingEvents = listResponse.items || [];

      // 3. Find an exact match: same summary AND same start.dateTime
      const newStartTime = new Date(newEvent.start.dateTime);

      const exactMatch = existingEvents.find(
        (event: any) =>
          event.summary === newEvent.summary &&
          new Date(event.start.dateTime).getTime() === newStartTime.getTime()
      );

      if (exactMatch) {
        // EXACT MATCH FOUND: Same Title + Same Start Time
        const userConfirmed = window.confirm(
          `An event at this exact time (${newStartTime.toLocaleTimeString()}) already exists.\n` +
          `Do you want to Replace/Overwrite it?`
        );

        if (!userConfirmed) {
          // User clicked Cancel - abort operation
          return {
            success: false,
            message: 'Operation aborted. The existing event was not modified.'
          };
        }

        // User clicked OK - Delete old event first, then insert new one
        // CRITICAL: Fully await delete before insert to prevent duplicates
        await this.fetchWithAuth(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${exactMatch.id}`,
          token,
          { method: 'DELETE' }
        );

        // Now insert the new event
        const insertResponse = await this.fetchWithAuth(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              ...newEvent,
              start: { ...newEvent.start, timeZone: 'Asia/Ho_Chi_Minh' },
              end: newEvent.end ? { ...newEvent.end, timeZone: 'Asia/Ho_Chi_Minh' } : undefined,
              reminders: { useDefault: true }
            })
          }
        );

        return {
          success: true,
          message: `Event replaced successfully at ${newStartTime.toLocaleTimeString()}.`,
          eventId: insertResponse.id
        };
      } else {
        // NO EXACT MATCH: Either different name, or different time
        // Proceed to insert normally (allows multiple sessions/slots for same task)
        const insertResponse = await this.fetchWithAuth(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              ...newEvent,
              start: { ...newEvent.start, timeZone: 'Asia/Ho_Chi_Minh' },
              end: newEvent.end ? { ...newEvent.end, timeZone: 'Asia/Ho_Chi_Minh' } : undefined,
              reminders: { useDefault: true }
            })
          }
        );

        return {
          success: true,
          message: `Event created successfully at ${newStartTime.toLocaleTimeString()}.`,
          eventId: insertResponse.id
        };
      }
    } catch (error: any) {
      // Handle specific error types
      console.error('Error in handleSyncCalendarEvent:', error);

      let errorMessage = 'Failed to sync calendar event';

      if (error.message?.includes('401') || error.message?.toLowerCase().includes('auth')) {
        errorMessage = 'Authentication error. Please sign in again.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Calendar event not found (404 error).';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return {
        success: false,
        message: errorMessage
      };
    }
  }
}

export const googleService = new GoogleSyncService();

