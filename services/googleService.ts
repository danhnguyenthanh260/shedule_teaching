
import { RowNormalized, InferredSchema, SyncResult, ColumnMapping } from '../types';
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

  async loadSheet(url: string, tab: string, token: string): Promise<{ rows: RowNormalized[], schema: InferredSchema, headers: string[], rawRows: string[][], allRows: string[][], sheetId: string, headerRowIndex: number }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Google Sheet khÃ´ng há»£p lá»‡.");

    // Fetch dá»¯ liá»‡u tá»« Google Sheets API v4
    // Range máº·c Ä‘á»‹nh láº¥y tá»« dÃ²ng 1 Ä‘áº¿n 500 Ä‘á»ƒ Ä‘áº£m báº£o bao quÃ¡t Ä‘á»§ dá»¯ liá»‡u
    const range = `${tab}!A1:Z500`;
    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      token
    );

    const values: string[][] = data.values;
    if (!values || values.length < 1) throw new Error("Sheet khÃ´ng cÃ³ dá»¯ liá»‡u.");

    const pickHeaderRowIndex = (rows: string[][]) => {
      const scan = rows.slice(0, 10);
      let bestIdx = 0;
      let bestScore = -1;

      scan.forEach((row, idx) => {
        const filled = row.filter(c => (c || '').toString().trim() !== '').length;
        if (filled > bestScore) {
          bestScore = filled;
          bestIdx = idx;
        }
      });

      return bestIdx;
    };

    const headerRowIndex = pickHeaderRowIndex(values);
    const rawHeaders = values[headerRowIndex] || [];
    const rawData = values.slice(headerRowIndex + 1);
    
    // Chá»‰ láº¥y 5 dÃ²ng Ä‘áº§u Ä‘á»ƒ suy luáº­n schema (performance)
    const schema = inferSchema(rawHeaders, rawData.slice(0, 5));

    const normalized = this.normalizeRows({
      sheetId,
      tab,
      headers: rawHeaders,
      rawRows: rawData,
      mapping: schema.mapping,
      headerRowIndex
    });

    return { rows: normalized, schema, headers: rawHeaders, rawRows: rawData, allRows: values, sheetId, headerRowIndex };
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
      .filter(row => row[mapping.date!] && row[mapping.time!])
      .map((row, idx): RowNormalized | null => {
        try {
          const { start, end } = parseVNTime(row[mapping.date!], row[mapping.time!]);
          const person = mapping.person !== undefined ? (row[mapping.person] || "Unknown") : "Unknown";

          const rawMap: Record<string, string> = {};
          headers.forEach((h, i) => rawMap[h || `Column ${i + 1}`] = row[i] || "");

          const sheetRowNumber = headerRowIndex + 2 + idx;

          return {
            id: generateRowId(sheetId, tab, sheetRowNumber, person),
            date: row[mapping.date!],
            startTime: start,
            endTime: end,
            person: person,
            email: mapping.email !== undefined ? row[mapping.email] : undefined,
            task: mapping.task !== undefined ? (row[mapping.task] || "Nhiem vu khong ten") : "Nhiem vu khong ten",
            location: mapping.location !== undefined ? (row[mapping.location] || "Chua xac dinh") : "Chua xac dinh",
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
        // 1. TÃ¬m kiáº¿m event Ä‘Ã£ tá»“n táº¡i dá»±a trÃªn sheetRowId (Idempotency)
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
          // Update event cÅ©
          await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`,
            token,
            { method: 'PUT', body: JSON.stringify(eventPayload) }
          );
          stats.updated++;
          stats.logs.push(`Cáº­p nháº­t: ${row.task}`);
        } else {
          // Táº¡o má»›i
          await this.fetchWithAuth(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
            token,
            { method: 'POST', body: JSON.stringify(eventPayload) }
          );
          stats.created++;
          stats.logs.push(`Táº¡o má»›i: ${row.task}`);
        }
      } catch (e: any) {
        console.error(e);
        stats.failed++;
        stats.logs.push(`Lá»—i dÃ²ng ${row.task}: ${e.message}`);
      }
    }
    return stats;
  }
}

export const googleService = new GoogleSyncService();

