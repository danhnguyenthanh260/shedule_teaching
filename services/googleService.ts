
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
        // 1. Tim kiem event da ton tai dua tren sheetRowId (Idempotency)
        // CRITICAL: Chi search va update event da sync truoc day, ko delete
        const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=sheetRowId=${row.id}&maxResults=1`;
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
              person: row.person,
              rowHash: this.hashRow(row) // Add hash for tracking
            }
          },
          reminders: { useDefault: true }
        };

        if (existingEvent) {
          // Update event cu
          await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`,
            token,
            { method: 'PUT', body: JSON.stringify(eventPayload) }
          );
          stats.updated++;
          stats.logs.push(`Cap nhat: ${row.task}`);
        } else {
          // Tao moi
          await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
            token,
            { method: 'POST', body: JSON.stringify(eventPayload) }
          );
          stats.created++;
          stats.logs.push(`Tao moi: ${row.task}`);
        }
      } catch (e: any) {
        console.error(e);
        stats.failed++;
        stats.logs.push(`Loi dong ${row.task}: ${e.message}`);
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
}

export const googleService = new GoogleSyncService();

