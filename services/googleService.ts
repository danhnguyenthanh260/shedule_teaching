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

  async loadSheet(url: string, tab: string, token: string): Promise<{
    rows: RowNormalized[],
    schema: InferredSchema,
    headers: string[],
    rawRows: string[][],
    allRows: string[][],
    sheetId: string,
    headerRowIndex: number,
    mergedCells: MergedCellGroup[]
  }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Google Sheet không hợp lệ.");

    try {
      // BƯỚC 1: Lấy metadata để bypass tên sheet
      const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
      const metadata = await this.fetchWithAuth(metadataUrl, token);

      if (!metadata.sheets || metadata.sheets.length === 0) {
        throw new Error("File Google Sheet này không có trang tính nào.");
      }

      // Lấy danh sách tên tất cả các sheet hiện có
      const allSheetNames = metadata.sheets.map((s: any) => s.properties.title);

      // Ưu tiên tên tab người dùng nhập, nếu không khớp thì lấy tab đầu tiên
      const finalTabName = allSheetNames.includes(tab) ? tab : allSheetNames[0];
      console.log(`Đang sử dụng Sheet: ${finalTabName}`);

      // BƯỚC 2: Truy vấn dữ liệu (Dùng dấu nháy đơn bao quanh tên sheet để tránh lỗi dấu cách)
      const range = `'${finalTabName}'!A1:BE1000`;
      const data = await this.fetchWithAuth(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
        token
      );

      const values: string[][] = data.values;
      if (!values || values.length < 1) throw new Error("Sheet này không có dữ liệu.");

      // BƯỚC 3: Xử lý Headers và Schema
      const headers = parseHeadersFromSheet(values);
      const mergedCells = parseMergedCells();
      const headerRowIndex = 2; // Row 3 (index 2)
      const rawData = values.slice(3); // Dữ liệu từ dòng 4 trở đi

      const schema = inferSchema(headers, rawData.slice(0, 5));

      // BƯỚC 4: Normalize toàn bộ 57 cột (Dùng logic headers.forEach đã bàn)
      const normalized = this.normalizeRows({
        sheetId,
        tab: finalTabName,
        headers,
        rawRows: rawData,
        mapping: schema.mapping,
        headerRowIndex
      });

      // QUAN TRỌNG: Luôn return đầy đủ object để tránh lỗi "destructure undefined"
      return {
        rows: normalized,
        schema,
        headers,
        rawRows: rawData,
        allRows: values,
        sheetId,
        headerRowIndex,
        mergedCells
      };

    } catch (error: any) {
      console.error("Lỗi chi tiết tại loadSheet:", error);
      throw new Error(error.message || "Không thể tải dữ liệu từ Google Sheet.");
    }
  }

  /**
   * REFACTORED: Tự động nhận diện tất cả các cột từ A đến hết
   */
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

          headers.forEach((h, i) => {
            const headerName = h || `Column_${i + 1}`;
            rawMap[headerName] = (row[i] || "").toString().trim();
          });

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

  /**
   * REFACTORED: Xử lý xung đột khoảng thời gian (Overlap) và cho phép Ghi đè
   */
  async syncToCalendar(rows: RowNormalized[], token: string): Promise<SyncResult> {
    const stats = { created: 0, updated: 0, failed: 0, logs: [] as string[] };

    for (const row of rows) {
      try {
        const newStart = new Date(row.startTime).getTime();
        const newEnd = new Date(row.endTime).getTime();
        const newSummary = `[${row.task}] - ${row.person}`;

        const eventDate = new Date(row.startTime);
        const timeMin = new Date(eventDate).setHours(0, 0, 0, 0);
        const timeMax = new Date(eventDate).setHours(23, 59, 59, 999);

        const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date(timeMin).toISOString()}&timeMax=${new Date(timeMax).toISOString()}&singleEvents=true`;
        const searchResult = await this.fetchWithAuth(searchUrl, token);
        const existingEvents = searchResult.items || [];

        // THUẬT TOÁN KIỂM TRA XUNG ĐỘT (OVERLAP)
        const conflictingEvents = existingEvents.filter((event: any) => {
          const exStart = new Date(event.start.dateTime).getTime();
          const exEnd = new Date(event.end.dateTime).getTime();
          return newStart < exEnd && newEnd > exStart;
        });

        const eventPayload = {
          summary: newSummary,
          location: row.location,
          // Đưa toàn bộ 57+ cột vào phần mô tả lịch để tra cứu nhanh
          description: Object.entries(row.raw).map(([k, v]) => `${k}: ${v}`).join('\n'),
          start: { dateTime: row.startTime, timeZone: 'Asia/Ho_Chi_Minh' },
          end: { dateTime: row.endTime, timeZone: 'Asia/Ho_Chi_Minh' },
        };

        if (conflictingEvents.length > 0) {
          const conflictNames = conflictingEvents.map((e: any) => e.summary).join(', ');
          const userConfirmed = window.confirm(
            `Xung đột lịch trình!\n\nLịch mới: ${new Date(newStart).toLocaleTimeString()} - ${new Date(newEnd).toLocaleTimeString()}\n` +
            `Đang trùng với: ${conflictNames}\n\nBạn có muốn GHI ĐÈ để cập nhật không?`
          );

          if (!userConfirmed) {
            stats.logs.push(`Bỏ qua: ${row.task}`);
            continue;
          }

          // Xóa các lịch cũ gây xung đột
          for (const conflict of conflictingEvents) {
            await this.fetchWithAuth(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${conflict.id}`,
              token,
              { method: 'DELETE' }
            );
          }
        }

        // Tạo lịch mới
        await this.fetchWithAuth(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          token,
          { method: 'POST', body: JSON.stringify(eventPayload) }
        );

        stats.created++;
        stats.logs.push(`Thành công: ${row.task}`);

      } catch (e: any) {
        stats.failed++;
        stats.logs.push(`Lỗi ${row.task}: ${e.message}`);
      }
    }
    return stats;
  }
}

export const googleService = new GoogleSyncService();