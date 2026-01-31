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
   * Load Test1 sheet: Simple structure (A1:BE1000)
   * - Headers at row 1 (index 0)
   * - Data starts from row 2 (index 1)
   */
  async loadSheetTest1(url: string, tab: string, token: string): Promise<{
    rows: RowNormalized[];
    schema: InferredSchema;
    headers: string[];
    rawRows: string[][];
    allRows: string[][];
    sheetId: string;
    headerRowIndex: number;
  }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Sheet không hợp lệ.");

    const metadata = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
      token
    );
    const allSheetNames = metadata.sheets.map((s: any) => s.properties.title);
    const finalTabName = allSheetNames.includes(tab) ? tab : allSheetNames[0];

    // ✅ Test1: Always use A1:BE1000 with header at row 1
    const range = `'${finalTabName}'!A1:BE1000`;
    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
      token
    );

    const values: string[][] = data.values;
    if (!values || values.length < 2) {
      throw new Error("Sheet không đủ dữ liệu (cần ít nhất 2 hàng).");
    }

    const headers = values[0];
    const rawData = values.slice(1);

    console.log(`✅ Test1 mode: Range ${range}`);
    console.log(`✅ Headers at row 1:`, headers.slice(0, 10));
    console.log(`✅ Data rows: ${rawData.length}`);

    const schema = inferSchema(headers, rawData.slice(0, 5));

    const normalized = this.normalizeRows({
      sheetId,
      tab: finalTabName,
      headers,
      rawRows: rawData,
      mapping: schema.mapping,
      headerRowIndex: 0,
      isDataMau: false
    });

    return {
      rows: normalized,
      schema,
      headers,
      rawRows: rawData,
      allRows: values,
      sheetId,
      headerRowIndex: 0
    };
  }

  /**
   * Load Review sheet: Complex structure (J1:BE1000)
   * - Skip columns A-I (Project Information section)
   * - Row 2: Merged headers (REVIEW 1, REVIEW 2, DEFENSE, CONFLICT)
   * - Row 3: Detail headers (Code, Count, Reviewer 1, Reviewer 2, Date, Slot...)
   * - Data starts from row 4 (index 3 in J1:BE range)
   */
  async loadSheetReview(url: string, tab: string, token: string): Promise<{
    rows: RowNormalized[];
    schema: InferredSchema;
    headers: string[];
    rawRows: string[][];
    allRows: string[][];
    sheetId: string;
    headerRowIndex: number;
  }> {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Sheet không hợp lệ.");

    const metadata = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
      token
    );
    const allSheetNames = metadata.sheets.map((s: any) => s.properties.title);
    const finalTabName = allSheetNames.includes(tab) ? tab : allSheetNames[0];

    // ✅ Detect tab type:
    // - "Review1" tab: Uses A1:BE1000, header at row 4 (index 3)
    // - Other Review tabs: Uses J1:BE1000 (skip Project Info A-I), header at row 3 (index 2)
    const isReview1Tab = finalTabName.toLowerCase() === 'review1';
    const range = isReview1Tab
      ? `'${finalTabName}'!A1:BE1000`  // Review1: Full range
      : `'${finalTabName}'!J1:BE1000`; // Data Mẫu: Skip A-I

    const headerRowIndex = isReview1Tab ? 3 : 2; // Review1: row 4, Others: row 3

    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
      token
    );

    const values: string[][] = data.values;
    const minRows = isReview1Tab ? 5 : 4;
    if (!values || values.length < minRows) {
      throw new Error(`Sheet không đủ dữ liệu (cần ít nhất ${minRows} hàng).`);
    }

    // Get headers based on tab type
    const headers = values[headerRowIndex];
    const rawData = values.slice(headerRowIndex + 1);

    console.log(`✅ ${isReview1Tab ? 'Review1' : 'Review'} mode: Range ${range}`);
    if (!isReview1Tab) {
      console.log(`✅ Row 2 (merged):`, values[1]?.slice(0, 5));
    }
    console.log(`✅ Row ${headerRowIndex + 1} (headers):`, headers.slice(0, 10));
    console.log(`✅ Data rows: ${rawData.length}`);

    const schema = inferSchema(headers, rawData.slice(0, 5));

    const normalized = this.normalizeRows({
      sheetId,
      tab: finalTabName,
      headers,
      rawRows: rawData,
      mapping: schema.mapping,
      headerRowIndex: headerRowIndex,
      isDataMau: !isReview1Tab  // Only Data Mẫu tabs need special handling
    });

    return {
      rows: normalized,
      schema,
      headers,
      rawRows: rawData,
      allRows: values,  // Return full rows including Row 1, 2, 3 for header selection
      sheetId,
      headerRowIndex: headerRowIndex  // Dynamic based on tab type
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
   * 2b. FLATTEN ROW: Decompose a row with grouped columns into multiple events
   * Used for sheets with structure: Row 2 = Groups ('REVIEW 1', 'REVIEW 2'), Row 3 = Details ('Code', 'Date', 'Reviewer')
   */
  private flattenRow(params: {
    sheetId: string;
    tab: string;
    rowIndex: number;
    groupHeaders: string[]; // Row 2: ['REVIEW 1', 'REVIEW 1', ..., 'REVIEW 2', ...]
    detailHeaders: string[]; // Row 3: ['Code', 'Count', 'Date', 'Slot', 'Room', 'Reviewer', ...]
    rawRow: string[];
    headerRowIndex: number;
  }): RowNormalized[] {
    const { sheetId, tab, rowIndex, groupHeaders, detailHeaders, rawRow, headerRowIndex } = params;
    const events: RowNormalized[] = [];

    // Group columns by group name
    const groups = new Map<string, number[]>(); // 'REVIEW 1' => [0, 1, 2, 3, 4, 5]
    groupHeaders.forEach((group, colIndex) => {
      const groupName = (group || '').trim();
      // Skip generic columns or empty groups
      if (!groupName || groupName.match(/^Column_?\d+$/i)) return;

      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName)!.push(colIndex);
    });

    // For each group, extract values and create event
    groups.forEach((colIndices, groupName) => {
      try {
        // Extract values for this group
        const groupData: Record<string, string> = {};
        colIndices.forEach(colIndex => {
          const header = detailHeaders[colIndex];
          const value = (rawRow[colIndex] || '').toString().trim();
          if (header && value) {
            groupData[header] = value;
          }
        });

        // Find reviewer, date, slot, room in this group using flexible matching
        const findValueInGroup = (data: Record<string, string>, keywords: string[]): string => {
          for (const [key, val] of Object.entries(data)) {
            const keyLower = key.toLowerCase();
            if (keywords.some(kw => keyLower.includes(kw.toLowerCase()))) {
              return val;
            }
          }
          return '';
        };

        const reviewer = findValueInGroup(groupData, ['reviewer', 'người đánh giá', 'đánh giá']);
        const date = findValueInGroup(groupData, ['date', 'ngày']);
        const slot = findValueInGroup(groupData, ['slot', 'tiết', 'time', 'giờ']);
        const room = findValueInGroup(groupData, ['room', 'phòng']);
        const code = findValueInGroup(groupData, ['code', 'mã']);
        const count = findValueInGroup(groupData, ['count', 'số lượng']);

        // ✅ FIX: Only require date (not reviewer) to create event
        // Reviewer can be empty - many review slots don't have reviewers assigned yet
        if (date && date.trim() !== '') {
          const { start, end } = parseVNTime(date, slot || '');

          events.push({
            id: `${sheetId}_${tab}_row${rowIndex + headerRowIndex + 1}_${groupName}`,
            groupName,
            sourceRowId: `${sheetId}_${tab}_row${rowIndex + headerRowIndex + 1}`,
            person: reviewer || 'Chưa phân công', // ✅ Default value if reviewer not assigned
            date,
            startTime: start,
            endTime: end,
            task: code || count || groupName,
            location: room || 'Chưa xác định',
            raw: groupData,
            status: 'pending'
          });
        }
      } catch (e) {
        console.warn(`⚠️ Bỏ qua ${groupName} trong dòng ${rowIndex + 1}:`, e);
      }
    });

    return events;
  }

  /**
   * 2c. NORMALIZE ROWS with optional nested mapping support
   */
  normalizeRowsWithGrouping(params: {
    sheetId: string;
    tab: string;
    groupHeaders?: string[]; // Row 2: groups like 'REVIEW 1', 'REVIEW 2'
    detailHeaders: string[]; // Row 3: detail columns like 'Code', 'Date', 'Reviewer'
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
  }): RowNormalized[] {
    const { groupHeaders, detailHeaders, rawRows, headerRowIndex } = params;

    // If no groupHeaders, use legacy normalization (1 row = 1 event)
    if (!groupHeaders || groupHeaders.length === 0) {
      return this.normalizeRows({
        ...params,
        headers: detailHeaders
      });
    }

    // Flatten: each row becomes multiple events (one per review group)
    const allEvents: RowNormalized[] = [];
    rawRows.forEach((rawRow, rowIndex) => {
      const events = this.flattenRow({
        sheetId: params.sheetId,
        tab: params.tab,
        rowIndex,
        groupHeaders,
        detailHeaders,
        rawRow,
        headerRowIndex
      });
      allEvents.push(...events);
    });

    return allEvents;
  }

  /**
   * 3. SYNC TO CALENDAR: Gửi dữ liệu đến Google Apps Script Web App
   * Apps Script tự động xử lý logic Mirroring (Xóa cũ - Đè mới)
   * 
   * ✅ CORS Bypass: Sử dụng hidden iframe để submit form thay vì fetch API
   */
  async syncToCalendar(
    rows: RowNormalized[],
    token: string
  ): Promise<SyncResult> {

    const stats = { created: 0, updated: 0, failed: 0, logs: [] as string[] };

    if (!rows || rows.length === 0) {
      stats.logs.push('⚠️ Không có dữ liệu để đồng bộ');
      return stats;
    }

    try {
      // 📦 Chuẩn bị payload gửi đến Apps Script
      const events = rows.map(row => ({
        title: `[${row.task}] - ${row.person}`,
        start: row.startTime,  // ISO 8601 format: "2026-01-31T08:00:00+07:00"
        end: row.endTime,      // ISO 8601 format: "2026-01-31T10:00:00+07:00"
        room: row.location || ''
      }));

      console.log(`🚀 Đang gửi ${events.length} sự kiện đến Apps Script...`);

      // 🔑 Gọi Apps Script qua Vite proxy để bypass CORS
      const webAppUrl = '/api/appscript';

      // 🌐 Gọi Apps Script với OAuth token trong header
      const response = await fetch(webAppUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Authorization': `Bearer ${token}`,  // ✅ CRITICAL: Gửi OAuth token để Apps Script xác thực user
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ events })
      });

      if (!response.ok) {
        throw new Error(`Apps Script lỗi ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // 📊 Xử lý kết quả từ Apps Script
      if (result.status === 'success' && result.data) {
        stats.created = result.data.added || 0;
        stats.updated = result.data.overwritten || 0;
        const kept = result.data.kept || 0;

        stats.logs.push(`✅ Đồng bộ hoàn tất!`);
        stats.logs.push(`   📌 Thêm mới: ${stats.created}`);
        stats.logs.push(`   🔄 Ghi đè: ${stats.updated}`);
        stats.logs.push(`   ⏭️ Giữ nguyên: ${kept}`);

        console.log('✅ Sync thành công:', result.data);
      } else {
        throw new Error(result.error || result.message || 'Lỗi không xác định từ Apps Script');
      }

      console.log('✅ Sync request completed');

    } catch (error: any) {
      console.error('❌ Đồng bộ thất bại:', error);
      stats.failed = rows.length;
      stats.logs.push(`❌ Lỗi: ${error.message}`);
    }

    return stats;
  }
}

export const googleService = new GoogleSyncService();