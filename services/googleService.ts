
import { RowNormalized, InferredSchema, SyncResult } from '../types';
import { inferSchema } from '../lib/inference';
import { parseVNTime, generateRowId } from '../lib/utils';

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

  async loadSheet(url: string, tab: string, token: string): Promise<{ rows: RowNormalized[], schema: InferredSchema }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Google Sheet không hợp lệ.");

    // Fetch dữ liệu từ Google Sheets API v4
    // Range mặc định lấy từ dòng 1 đến 500 để đảm bảo bao quát đủ dữ liệu
    const range = `${tab}!A1:Z500`;
    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      token
    );

    const values: string[][] = data.values;
    if (!values || values.length < 1) throw new Error("Sheet không có dữ liệu.");

    const rawHeaders = values[0];
    const rawData = values.slice(1);
    
    // Chỉ lấy 5 dòng đầu để suy luận schema (performance)
    const schema = inferSchema(rawHeaders, rawData.slice(0, 5));

    // Fix: Explicitly type the map return as RowNormalized | null to satisfy RowNormalized[] constraint
    const normalized: RowNormalized[] = rawData
      .filter(row => row[schema.mapping.date] && row[schema.mapping.time]) // Lọc dòng trống
      .map((row, idx): RowNormalized | null => {
        try {
          const { start, end } = parseVNTime(row[schema.mapping.date], row[schema.mapping.time]);
          const person = row[schema.mapping.person] || "Unknown";
          
          const rawMap: Record<string, string> = {};
          rawHeaders.forEach((h, i) => rawMap[h] = row[i] || "");

          return {
            id: generateRowId(sheetId, tab, idx + 2, person),
            date: row[schema.mapping.date],
            startTime: start,
            endTime: end,
            person: person,
            email: row[schema.mapping.email],
            task: row[schema.mapping.task] || "Nhiệm vụ không tên",
            location: row[schema.mapping.location] || "Chưa xác định",
            raw: rawMap,
            status: 'pending'
          };
        } catch (e) {
          console.warn(`Bỏ qua dòng ${idx + 2} do lỗi parse:`, e);
          return null;
        }
      })
      .filter((r): r is RowNormalized => r !== null);

    return { rows: normalized, schema };
  }

  async syncToCalendar(rows: RowNormalized[], token: string): Promise<SyncResult> {
    const stats = { created: 0, updated: 0, failed: 0, logs: [] as string[] };
    
    for (const row of rows) {
      try {
        // 1. Tìm kiếm event đã tồn tại dựa trên sheetRowId (Idempotency)
        const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=sheetRowId=${row.id}`;
        const searchResult = await this.fetchWithAuth(searchUrl, token);
        const existingEvent = searchResult.items?.[0];

        const eventPayload = {
          summary: `[${row.task}] - ${row.person}`,
          location: row.location,
          description: Object.entries(row.raw).map(([k, v]) => `${k}: ${v}`).join('\n'),
          start: { dateTime: row.startTime, timeZone: 'Asia/Ho_Chi_Minh' },
          end: { dateTime: row.endTime, timeZone: 'Asia/Ho_Chi_Minh' },
          extendedProperties: {
            private: {
              sheetRowId: row.id,
              person: row.person
            }
          },
          reminders: { useDefault: true }
        };

        if (existingEvent) {
          // Update event cũ
          await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`,
            token,
            { method: 'PUT', body: JSON.stringify(eventPayload) }
          );
          stats.updated++;
          stats.logs.push(`Cập nhật: ${row.task}`);
        } else {
          // Tạo mới
          await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
            token,
            { method: 'POST', body: JSON.stringify(eventPayload) }
          );
          stats.created++;
          stats.logs.push(`Tạo mới: ${row.task}`);
        }
      } catch (e: any) {
        console.error(e);
        stats.failed++;
        stats.logs.push(`Lỗi dòng ${row.task}: ${e.message}`);
      }
    }
    return stats;
  }
}

export const googleService = new GoogleSyncService();