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

  /**
   * Robust sheet format detection với multi-signal scoring
   */
  private detectSheetFormat(values: string[][]): {
    headerRowIndex: number;
    isDataMau: boolean;
    confidence: number;
    formatName: string;
  } {
    const row1 = values[0] || [];
    const row2 = values[1] || [];
    const row3 = values[2] || [];

    const row1Str = row1.join("").toLowerCase();
    const row2Str = row2.join("").toLowerCase();
    const row3Str = row3.join("").toLowerCase();

    let test1Score = 0;
    let dataMauScore = 0;

    // Signal 1: test1-specific keywords at row 1
    if (row1Str.includes("ngành") &&
      (row1Str.includes("mã đề tài") || row1Str.includes("project code"))) {
      test1Score += 50;
      console.log("✓ test1 signal: Found 'Ngành' + 'Mã đề tài' at row 1 (+50)");
    }

    // Signal 2: Data Mẫu-specific keywords
    if (row1Str.includes("hạng mục") || row1Str.includes("gvhd") || row1Str.includes("cvhd")) {
      dataMauScore += 30;
      console.log("✓ Data Mẫu signal: Found 'Hạng mục/GVHD/CVHD' at row 1 (+30)");
    }
    if (row2Str.includes("review 1") || row2Str.includes("review 2")) {
      dataMauScore += 40;
      console.log("✓ Data Mẫu signal: Found 'Review' at row 2 (+40)");
    }
    if (row3Str.includes("date") || row3Str.includes("day of week") || row3Str.includes("slot")) {
      dataMauScore += 30;
      console.log("✓ Data Mẫu signal: Found 'Date/Day/Slot' at row 3 (+30)");
    }

    // Signal 3: Column density (filled cells ratio)
    const row1Density = row1.filter(c => c && c.trim()).length / Math.max(row1.length, 1);
    const row3Density = row3.filter(c => c && c.trim()).length / Math.max(row3.length, 1);

    if (row1Density > 0.6) {
      test1Score += 20;
      console.log(`✓ test1 signal: Row 1 density ${(row1Density * 100).toFixed(0)}% > 60% (+20)`);
    }
    if (row3Density > row1Density + 0.2) {
      dataMauScore += 20;
      console.log(`✓ Data Mẫu signal: Row 3 density ${(row3Density * 100).toFixed(0)}% > Row 1 (+20)`);
    }

    // Signal 4: Data starts early (row 2 has actual data, not merged headers)
    const row2HasData = row2.some((cell, i) => {
      const header = row1[i];
      return cell && cell.trim() && header && header.trim() &&
        !header.toLowerCase().includes("review") &&
        !header.toLowerCase().includes("gvhd");
    });
    if (row2HasData) {
      test1Score += 15;
      console.log("✓ test1 signal: Row 2 has actual data (+15)");
    }

    // Decision
    console.log(`📊 Scores: test1=${test1Score}, Data Mẫu=${dataMauScore}`);

    if (test1Score > dataMauScore) {
      return {
        headerRowIndex: 0,
        isDataMau: false,
        confidence: test1Score,
        formatName: 'test1'
      };
    } else if (dataMauScore > test1Score) {
      return {
        headerRowIndex: 2,
        isDataMau: true,
        confidence: dataMauScore,
        formatName: 'Data Mẫu'
      };
    } else {
      // Tie → fallback to simple
      console.warn("⚠️ Tie score, using fallback (simple structure)");
      return {
        headerRowIndex: 0,
        isDataMau: false,
        confidence: 0,
        formatName: 'fallback'
      };
    }
  }

  /**
   * 1. LOAD SHEET: Tự động nhận diện cấu trúc phẳng (test1) hoặc phức tạp (Data mẫu)
   */
  async loadSheet(url: string, tab: string, token: string): Promise<{
    rows: RowNormalized[];
    schema: InferredSchema;
    headers: string[];
    rawRows: string[][];
    allRows: string[][];
    sheetId: string;
    headerRowIndex: number;
    mergedCells?: MergedCellGroup[];
  }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Sheet không hợp lệ.");

    const metadata = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
      token
    );
    const allSheetNames = metadata.sheets.map((s: any) => s.properties.title);
    const finalTabName = allSheetNames.includes(tab) ? tab : allSheetNames[0];

    // ✅ Lấy range A1:BE1000 để đảm bảo hốt đủ 57 cột dữ liệu
    const range = `'${finalTabName}'!A1:BE1000`;
    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
      token
    );

    const values: string[][] = data.values;
    if (!values || values.length < 1) {
      throw new Error("Sheet rỗng hoặc không có dữ liệu.");
    }

    // ✅ NEW: Robust detection với multi-signal scoring
    const detection = this.detectSheetFormat(values);
    console.log(`📋 Detection result:`, {
      format: detection.formatName,
      headerRow: detection.headerRowIndex + 1,
      confidence: detection.confidence,
      isDataMau: detection.isDataMau
    });

    const headers = values[detection.headerRowIndex];
    const rawData = values.slice(detection.headerRowIndex + 1);
    const headerRowIndex = detection.headerRowIndex;
    const isDataMau = detection.isDataMau;

    console.log(`✅ Headers detected:`, headers.slice(0, 10));
    console.log(`✅ Raw data rows: ${rawData.length}`);

    const schema = inferSchema(headers, rawData.slice(0, 5));
    const normalized = this.normalizeRows({
      sheetId,
      tab: finalTabName,
      headers,
      rawRows: rawData,
      mapping: schema.mapping,
      headerRowIndex,
      isDataMau
    });

    return {
      rows: normalized,
      schema,
      headers,
      rawRows: rawData,
      allRows: values,
      sheetId,
      headerRowIndex
    };
  }

  /**
   * 2. NORMALIZE: Xử lý dữ liệu an toàn, chống trắng trang
   */
  normalizeRows(params: {
    sheetId: string;
    tab: string;
    headers: string[];
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
    isDataMau?: boolean;
  }): RowNormalized[] {
    const { sheetId, tab, headers, rawRows, mapping, headerRowIndex, isDataMau } = params;

    // ✅ VALIDATION: Kiểm tra mapping tồn tại để tránh crash
    if (!mapping || mapping.date === undefined || mapping.time === undefined) {
      console.warn('⚠️ Mapping không đầy đủ, tìm index thủ công...');

      // Tự tìm index nếu mapping bị rỗng
      const dIdx = headers.findIndex(h =>
        h?.toLowerCase().includes("ngày") ||
        h?.toLowerCase().includes("date")
      );
      const tIdx = headers.findIndex(h =>
        h?.toLowerCase().includes("giờ") ||
        h?.toLowerCase().includes("slot") ||
        h?.toLowerCase().includes("time")
      );

      if (dIdx === -1 || tIdx === -1) {
        console.error('❌ Không tìm thấy cột Ngày/Giờ');
        return []; // ✅ Trả về mảng rỗng thay vì crash
      }

      // Tạo mapping thủ công
      const manualMapping: ColumnMapping = {
        date: dIdx,
        time: tIdx,
        person: headers.findIndex(h => h?.toLowerCase().includes("họ") || h?.toLowerCase().includes("tên")),
        task: headers.findIndex(h => h?.toLowerCase().includes("nhiệm vụ") || h?.toLowerCase().includes("môn")),
        location: headers.findIndex(h => h?.toLowerCase().includes("phòng"))
      };

      return this.normalizeRows({
        sheetId, tab, headers, rawRows,
        mapping: manualMapping,
        headerRowIndex,
        isDataMau
      });
    }

    // Có mapping hợp lệ, tiến hành normalize
    return rawRows
      .filter((row: any) => {
        const dateVal = row[mapping.date!];
        return dateVal && dateVal.toString().trim() !== "";
      })
      .map((row: any, idx: number): RowNormalized | null => {
        try {
          const dateStr = row[mapping.date!].toString().trim();
          const timeStr = row[mapping.time!].toString().trim();
          const { start, end } = parseVNTime(dateStr, timeStr);

          // Xử lý Task Name
          let taskName = mapping.task !== undefined ?
            (row[mapping.task] || "").toString().trim() :
            "";

          if (isDataMau && (!taskName || taskName.toLowerCase() === "unknown")) {
            taskName = (row[4] || "Nhiệm vụ").toString().trim();
          }
          if (!taskName) taskName = "Nhiệm vụ";

          // ✅ Thu thập tất cả 57 cột vào raw
          const rawMap: Record<string, string> = {};
          headers.forEach((h: string, i: number) => {
            rawMap[h || `Col_${i}`] = (row[i] || "").toString().trim();
          });

          return {
            id: generateRowId(sheetId, tab, headerRowIndex + 2 + idx, "Sync"),
            date: dateStr,
            startTime: start,
            endTime: end,
            person: mapping.person !== undefined ?
              (row[mapping.person] || "Unknown").toString().trim() :
              "Unknown",
            task: taskName,
            location: mapping.location !== undefined ?
              (row[mapping.location] || "Chưa xác định").toString().trim() :
              "Chưa xác định",
            raw: rawMap,
            status: 'pending'
          };
        } catch (e) {
          console.warn(`⚠️ Bỏ qua dòng ${idx + 1}:`, e);
          return null;
        }
      })
      .filter((r: any): r is RowNormalized => r !== null);
  }

  /**
   * 3. SYNC TO CALENDAR: Sửa lỗi TypeScript operator, check xung đột chính xác
   */
  async syncToCalendar(rows: RowNormalized[], token: string): Promise<SyncResult> {
    const stats = { created: 0, updated: 0, failed: 0, logs: [] as string[] };

    if (!rows || rows.length === 0) {
      return stats;
    }

    for (const row of rows) {
      try {
        // ✅ Tách biệt việc tính toán timestamp để tránh lỗi TypeScript
        const newStartTime = new Date(row.startTime);
        const newEndTime = new Date(row.endTime);
        const nStart = newStartTime.getTime();
        const nEnd = newEndTime.getTime();

        // Lấy ngày hiện tại để tìm events trong cùng ngày
        const eventDate = new Date(row.startTime);
        const dayStart = new Date(eventDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(eventDate);
        dayEnd.setHours(23, 59, 59, 999);

        const tMin = dayStart.toISOString();
        const tMax = dayEnd.toISOString();

        // Fetch existing events
        const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${tMin}&timeMax=${tMax}&singleEvents=true`;
        const searchRes = await this.fetchWithAuth(searchUrl, token);
        const existingEvents = searchRes.items || [];

        // ✅ Kiểm tra xung đột với logic rõ ràng
        const conflicts = existingEvents.filter((e: any) => {
          if (!e.start || !e.start.dateTime || !e.end || !e.end.dateTime) {
            return false;
          }

          const existingStart = new Date(e.start.dateTime).getTime();
          const existingEnd = new Date(e.end.dateTime).getTime();

          // Thuật toán overlap: A starts before B ends AND A ends after B starts
          const hasOverlap = nStart < existingEnd && nEnd > existingStart;
          return hasOverlap;
        });

        // Xử lý xung đột nếu có
        if (conflicts.length > 0) {
          const names = conflicts.map((e: any) => e.summary).join(', ');
          const userConfirmed = window.confirm(
            `Trùng lịch với: ${names}\n\nBạn có muốn ghi đè không?`
          );

          if (!userConfirmed) {
            stats.failed++;
            stats.logs.push(`❌ Người dùng hủy: ${row.task}`);
            continue;
          }

          // Xóa các events conflicting
          for (const c of conflicts) {
            try {
              await this.fetchWithAuth(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${c.id}`,
                token,
                { method: 'DELETE' }
              );
            } catch (deleteError) {
              console.warn('⚠️ Không thể xóa event:', deleteError);
            }
          }
        }

        // Tạo event mới
        const payload = {
          summary: `[${row.task}] - ${row.person}`,
          location: row.location,
          description: Object.entries(row.raw)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n'),
          start: { dateTime: row.startTime, timeZone: 'Asia/Ho_Chi_Minh' },
          end: { dateTime: row.endTime, timeZone: 'Asia/Ho_Chi_Minh' },
        };

        await this.fetchWithAuth(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          token,
          { method: 'POST', body: JSON.stringify(payload) }
        );

        stats.created++;
        stats.logs.push(`✅ ${row.task}`);

      } catch (e: any) {
        stats.failed++;
        stats.logs.push(`❌ ${row.task}: ${e.message}`);
      }
    }

    return stats;
  }
}

export const googleService = new GoogleSyncService();