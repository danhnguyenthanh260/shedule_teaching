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
    // ✅ Check row 1 OR row 2 for REVIEW keywords (flexible detection)
    if (row1Str.includes("review 1") || row1Str.includes("review 2") ||
        row2Str.includes("review 1") || row2Str.includes("review 2")) {
      dataMauScore += 40;
      console.log("✓ Data Mẫu signal: Found 'Review' at row 1 or 2 (+40)");
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

  /** Fill forward empty cells (merged cell behavior) for Row 2 group headers */
  private fillForwardRow(row: string[]): string[] {
    const filled: string[] = [];
    let last = '';
    for (let i = 0; i < row.length; i++) {
      const cell = (row[i] || '').toString().trim();
      if (cell) {
        last = cell;
        filled[i] = cell;
      } else {
        filled[i] = last || `Column_${i + 1}`;
      }
    }
    return filled;
  }

  /**
   * 1. LOAD SHEET: Tự động nhận diện cấu trúc phẳng (test1) hoặc phức tạp (Data mẫu)
   * Data Mẫu: Row 2 = groups (REVIEW 1, REVIEW 2, REVIEW 3), Row 3 = detail headers → 1 data row = 3 events (12 items cho 4 dòng)
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
    groupHeaders?: string[];
    detailHeaders?: string[];
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

    const headerRowIndex = detection.headerRowIndex;
    const isDataMau = detection.isDataMau;

    let headers: string[];
    let rawData: string[][];
    let normalized: RowNormalized[];
    let schema: InferredSchema;
    let groupHeaders: string[] | undefined;
    let detailHeaders: string[] | undefined;

    if (isDataMau && values.length >= 4) {
      // Data Mẫu: Row 1 = super headers (REVIEW 1, REVIEW 2, REVIEW 3), Row 2 = groups, Row 3 = detail → mỗi dòng data = 3 events
      const row1 = this.fillForwardRow(values[0] || []);  // ✅ NEW: Extract Row 1 (super headers)
      const row2 = this.fillForwardRow(values[1] || []);
      const row3 = values[2] || [];
      const columnsToKeep: number[] = [];
      row2.forEach((h, i) => {
        const header = (h || '').toString().toLowerCase();
        if (!header.includes('defense') && !header.includes('conflict')) {
          columnsToKeep.push(i);
        }
      });
      const superHeaders = columnsToKeep.map(i => row1[i]);  // ✅ NEW: Pass Row 1 for visual grouping
      groupHeaders = columnsToKeep.map(i => row2[i]);
      detailHeaders = columnsToKeep.map(i => row3[i] || `Column_${i + 1}`);
      rawData = values.slice(3).map(row => columnsToKeep.map(i => (row[i] || '').toString().trim()));
      rawData = rawData.filter(row => row.some(c => c !== ''));
      headers = detailHeaders;  // ✅ FIX: Use detail headers instead of group headers
      schema = inferSchema(detailHeaders, rawData.slice(0, 5));
      normalized = this.normalizeRowsWithGrouping({
        sheetId,
        tab: finalTabName,
        superHeaders,  // ✅ NEW: Pass Row 1 for proper grouping
        groupHeaders,
        detailHeaders,
        rawRows: rawData,
        mapping: schema.mapping,
        headerRowIndex
      });
      console.log(`✅ Data Mẫu: ${rawData.length} dòng → ${normalized.length} sự kiện (REVIEW 1/2/3)`);
    } else {
      headers = values[detection.headerRowIndex];
      rawData = values.slice(detection.headerRowIndex + 1);
      schema = inferSchema(headers, rawData.slice(0, 5));
      normalized = this.normalizeRows({
        sheetId,
        tab: finalTabName,
        headers,
        rawRows: rawData,
        mapping: schema.mapping,
        headerRowIndex,
        isDataMau
      });
    }

    console.log(`✅ Headers detected:`, (detailHeaders || headers).slice(0, 10));
    console.log(`✅ Raw data rows: ${rawData.length}`);

    return {
      rows: normalized,
      schema,
      headers: detailHeaders || headers,
      rawRows: rawData,
      allRows: values,
      sheetId,
      headerRowIndex,
      groupHeaders,
      detailHeaders
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
   * ✅ CRITICAL: Uses normalizeRowsWithGrouping to expand each data row into multiple events
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
    // - Other Review tabs: Uses J1:BE1000 (skip Project Info A-I), header at row 2 (index 1)
    const isReview1Tab = finalTabName.toLowerCase() === 'review1';
    const range = isReview1Tab
      ? `'${finalTabName}'!A1:BE1000`  // Review1: Full range
      : `'${finalTabName}'!J1:BE1000`; // Data Mẫu: Skip A-I

    const headerRowIndex = isReview1Tab ? 3 : 1; // Review1: row 4 (index 3), Data Mẫu: row 2 (index 1)

    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
      token
    );

    const values: string[][] = data.values;
    const minRows = isReview1Tab ? 5 : 3; // Review1: need 5 rows (header row 4 + data), Data Mẫu: need 3 rows (header row 2 + data)
    if (!values || values.length < minRows) {
      throw new Error(`Sheet không đủ dữ liệu (cần ít nhất ${minRows} hàng).`);
    }

    // ✅ CRITICAL: Review1 uses FLAT structure (no grouping), other tabs use GROUPED structure
    if (isReview1Tab) {
      // Review1: Simple flat structure
      // Row 4 (index 3): Headers (Code, Week Code, Day Code, Slot Code, Date, Room, Reviewer 1, Reviewer 2, Count)
      // Row 5+ (index 4+): Data
      let headers = values[headerRowIndex] || [];
      let rawData = values.slice(headerRowIndex + 1);

      // Remove empty rows
      rawData = rawData.filter(row => row.some(c => c && c.trim() !== ''));

      // ✅ FIX: Normalize headers to match data row length
      // Google Sheets API may truncate empty cells at the end of header row
      // But data rows may have values in those columns (e.g., Reviewer 1, Reviewer 2)
      const maxCols = Math.max(
        headers.length,
        ...rawData.map(row => row.length)
      );

      // Pad headers with default names if needed
      if (headers.length < maxCols) {
        console.warn(`⚠️ Headers truncated! Padding from ${headers.length} to ${maxCols} columns`);
        const paddedHeaders = [...headers];
        for (let i = headers.length; i < maxCols; i++) {
          paddedHeaders.push(`Column_${i + 1}`);
        }
        headers = paddedHeaders;
      }

      // Also pad data rows to match header length
      rawData = rawData.map(row => {
        if (row.length < maxCols) {
          const paddedRow = [...row];
          for (let i = row.length; i < maxCols; i++) {
            paddedRow.push('');
          }
          return paddedRow;
        }
        return row;
      });

      console.log(`✅ Review1 mode (FLAT): Range ${range}`);
      console.log(`✅ Row 4 (headers):`, headers.slice(0, 10));
      console.log(`✅ Data rows: ${rawData.length}`);

      const schema = inferSchema(headers, rawData.slice(0, 5));

      // ✅ DEBUG: Log mapping details
      console.log('📊 Review1 Schema Mapping:', {
        date: schema.mapping.date !== undefined ? `Column ${schema.mapping.date}: "${headers[schema.mapping.date]}"` : 'MISSING',
        time: schema.mapping.time !== undefined ? `Column ${schema.mapping.time}: "${headers[schema.mapping.time]}"` : 'MISSING',
        person: schema.mapping.person !== undefined ? `Column ${schema.mapping.person}: "${headers[schema.mapping.person]}"` : 'MISSING',
        task: schema.mapping.task !== undefined ? `Column ${schema.mapping.task}: "${headers[schema.mapping.task]}"` : 'MISSING',
        location: schema.mapping.location !== undefined ? `Column ${schema.mapping.location}: "${headers[schema.mapping.location]}"` : 'MISSING'
      });
      console.log('📋 Sample data (first row):', rawData[0]?.slice(0, 12));
      console.log('📋 Sample DATE value:', rawData[0]?.[schema.mapping.date || 0]);
      console.log('📋 Sample TIME value:', rawData[0]?.[schema.mapping.time || 0]);
      console.log('📋 Sample PERSON value:', rawData[0]?.[schema.mapping.person || 0]);

      // ✅ Use simple normalizeRows for Review1 (no grouping)
      const normalized = this.normalizeRows({
        sheetId,
        tab: finalTabName,
        headers,
        rawRows: rawData,
        mapping: schema.mapping,
        headerRowIndex: headerRowIndex,
        isDataMau: false
      });

      console.log(`✅ Normalized: ${rawData.length} rows → ${normalized.length} events (FLAT structure)`);

      return {
        rows: normalized,
        schema,
        headers,
        rawRows: rawData,
        allRows: values,
        sheetId,
        headerRowIndex: headerRowIndex
      };
    }

    // ✅ CRITICAL FIX: Extract Row 1 (super headers), Row 2 (group headers), and Row 3 (detail headers)
    // Row 1 (index 0): REVIEW 1, REVIEW 1, ..., REVIEW 2, REVIEW 2, ..., REVIEW 3, REVIEW 3, ...
    // Row 2 (index 1): REVIEWER 1, REVIEWER 2, ..., REVIEWER 1, REVIEWER 2, ...
    // Row 3 (index 2): Code, Count, Date, Slot, Room, Reviewer 1, Reviewer 2, ...
    const row1 = this.fillForwardRow(values[0] || []); // Super headers (REVIEW 1/2/3) with fill-forward
    const row2 = this.fillForwardRow(values[1] || []); // Group headers with fill-forward
    const row3 = values[2] || []; // Detail headers

    // Filter out DEFENSE and CONFLICT columns
    const columnsToKeep: number[] = [];
    row2.forEach((h, i) => {
      const header = (h || '').toString().toLowerCase();
      if (!header.includes('defense') && !header.includes('conflict')) {
        columnsToKeep.push(i);
      }
    });

    const superHeaders = columnsToKeep.map(i => row1[i]); // REVIEW 1/2/3
    const groupHeaders = columnsToKeep.map(i => row2[i]); // REVIEWER 1/2, etc
    const detailHeaders = columnsToKeep.map(i => row3[i] || `Column_${i + 1}`);

    // Extract data rows and apply column filter
    let rawData = values.slice(headerRowIndex + 1).map(row =>
      columnsToKeep.map(i => (row[i] || '').toString().trim())
    );

    // Remove empty rows
    rawData = rawData.filter(row => row.some(c => c !== ''));

    console.log(`✅ Review mode (GROUPED): Range ${range}`);
    console.log(`✅ Row 1 (super headers):`, superHeaders.slice(0, 10));
    console.log(`✅ Row 2 (group headers):`, groupHeaders.slice(0, 10));
    console.log(`✅ Row 3 (detail headers):`, detailHeaders.slice(0, 10));
    console.log(`✅ Data rows: ${rawData.length}`);
    console.log(`✅ Filtered columns: ${columnsToKeep.length} (removed DEFENSE/CONFLICT)`);

    const schema = inferSchema(detailHeaders, rawData.slice(0, 5));

    // ✅ CRITICAL: Use normalizeRowsWithGrouping to expand each row into multiple events
    // Pass superHeaders (REVIEW 1/2/3) so flattenRow can group by review
    // Example: 4 data rows × 3 review groups = 12 events
    const normalized = this.normalizeRowsWithGrouping({
      sheetId,
      tab: finalTabName,
      superHeaders,  // ✅ NEW: Pass Row 1 for visual grouping
      groupHeaders,
      detailHeaders,
      rawRows: rawData,
      mapping: schema.mapping,
      headerRowIndex: headerRowIndex
    });

    console.log(`✅ Normalized: ${rawData.length} rows → ${normalized.length} events (grouped by REVIEW)`);

    return {
      rows: normalized,
      schema,
      headers: detailHeaders, // Return detail headers for UI mapping
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
        h?.toLowerCase().includes("time") ||
        h?.toLowerCase().includes("tiết")
      );
      const pIdx = headers.findIndex(h =>
        h?.toLowerCase().includes("reviewer") ||
        h?.toLowerCase().includes("người") ||
        h?.toLowerCase().includes("tên") ||
        h?.toLowerCase().includes("giảng viên")
      );

      if (dIdx === -1 || tIdx === -1) {
        console.error('❌ Không tìm thấy cột Ngày/Giờ');
        return []; // ✅ Trả về mảng rỗng thay vì crash
      }

      // Tạo mapping thủ công
      const manualMapping: ColumnMapping = {
        date: dIdx,
        time: tIdx,
        person: pIdx !== -1 ? pIdx : headers.findIndex(h => h?.toLowerCase().includes("họ") || h?.toLowerCase().includes("tên")),
        task: headers.findIndex(h => h?.toLowerCase().includes("nhiệm vụ") || h?.toLowerCase().includes("môn") || h?.toLowerCase().includes("code")),
        location: headers.findIndex(h => h?.toLowerCase().includes("phòng") || h?.toLowerCase().includes("room"))
      };

      return this.normalizeRows({
        sheetId, tab, headers, rawRows,
        mapping: manualMapping,
        headerRowIndex,
        isDataMau
      });
    }

    // Có mapping hợp lệ, tiến hành normalize
    console.log('🔍 normalizeRows: Starting normalization...', {
      totalRows: rawRows.length,
      dateIndex: mapping.date,
      timeIndex: mapping.time,
      personIndex: mapping.person,
      sampleRow: rawRows[0]
    });

    const filteredRows = rawRows.filter((row: any) => {
      const dateVal = row[mapping.date!];
      const hasDate = dateVal && dateVal.toString().trim() !== "";
      if (!hasDate) {
        console.warn(`⚠️ Row filtered out - missing date at index ${mapping.date}:`, row.slice(0, 10));
      }
      return hasDate;
    });

    console.log(`🔍 After date filter: ${filteredRows.length}/${rawRows.length} rows remaining`);

    return filteredRows
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
   * Used for sheets with structure: Row 1 = Super headers (REVIEW 1, REVIEW 2), Row 2 = Groups (REVIEWER 1, REVIEWER 2), Row 3 = Details (Code, Date)
   */
  private flattenRow(params: {
    sheetId: string;
    tab: string;
    rowIndex: number;
    superHeaders?: string[]; // ✅ NEW: Row 1 - REVIEW 1, REVIEW 2, REVIEW 3 (main grouping)
    groupHeaders: string[]; // Row 2: [REVIEWER 1, REVIEWER 2, ..., REVIEWER 1, ...]
    detailHeaders: string[]; // Row 3: [Code, Count, Date, Slot, Room, Reviewer, ...]
    rawRow: string[];
    headerRowIndex: number;
  }): RowNormalized[] {
    const { sheetId, tab, rowIndex, superHeaders, groupHeaders, detailHeaders, rawRow, headerRowIndex } = params;
    const events: RowNormalized[] = [];

    // Group columns by super header name (REVIEW 1, REVIEW 2, REVIEW 3)
    // ✅ Use superHeaders if available (Row 1), else fall back to groupHeaders (Row 2)
    const headersToGroup = superHeaders && superHeaders.length > 0 ? superHeaders : groupHeaders;
    const groups = new Map<string, number[]>(); // 'REVIEW 1' => [0, 1, 2, 3, 4, 5]
    headersToGroup.forEach((group, colIndex) => {
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

        // Find value by header keywords; optional exclude to avoid wrong column (e.g. Date vs Day Of Week)
        const findValueInGroup = (
          data: Record<string, string>,
          keywords: string[],
          excludeKeywords: string[] = []
        ): string => {
          for (const [key, val] of Object.entries(data)) {
            const keyLower = key.toLowerCase();
            if (excludeKeywords.some(ex => keyLower.includes(ex.toLowerCase()))) continue;
            if (keywords.some(kw => keyLower.includes(kw.toLowerCase()))) {
              return val;
            }
          }
          return '';
        };

        // Date: chỉ lấy cột "Date" (30/01/2026), KHÔNG lấy "Day Of Week" (Thu)
        let date = findValueInGroup(
          groupData,
          ['date', 'ngày'],
          ['day of week', 'week', 'thứ'] // loại trừ cột ngày trong tuần
        );
        // Chỉ chấp nhận giá trị giống ngày (có / hoặc - và số), bỏ qua "Thu", "1", "NVH F.01"
        const looksLikeDate = (v: string) => /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test((v || '').trim());
        if (date && !looksLikeDate(date)) date = '';
        // Slot: số 1-5 (map tới 07:00-09:15, ...)
        const slot = findValueInGroup(groupData, ['slot', 'tiết', 'time', 'giờ']);
        // Room: NVH G.02, NVH F.01... (không lấy tên người)
        const room = findValueInGroup(groupData, ['room', 'phòng']);
        // ✅ Extract BOTH Reviewer 1 AND Reviewer 2 separately for this group
        const reviewer1 = findValueInGroup(groupData, ['reviewer 1', 'đánh giá viên 1'], ['reviewer 2', 'đánh giá viên 2']);
        const reviewer2 = findValueInGroup(groupData, ['reviewer 2', 'đánh giá viên 2'], ['reviewer 1', 'đánh giá viên 1']);
        const reviewers: string[] = [];
        if (reviewer1) reviewers.push(reviewer1);
        if (reviewer2) reviewers.push(reviewer2);
        // Use reviewer1 as primary person, or reviewer2 if reviewer1 is empty
        const reviewer = reviewer1 || reviewer2 || 'Chưa phân công';
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
            sourceRowIndex: rowIndex, // ✅ NEW: Store original row index for filtering fullRows
            person: reviewer, // Primary person (reviewer1 or reviewer2)
            date,
            startTime: start,
            endTime: end,
            task: code || count || groupName,
            location: room || 'Chưa xác định',
            raw: groupData,
            status: 'pending',
            // ✅ Mark as grouped event with separate reviewers array
            isGrouped: true,
            reviewers: reviewers.length > 0 ? reviewers : undefined
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
    superHeaders?: string[]; // ✅ NEW: Row 1 - super group headers (REVIEW 1, REVIEW 2, REVIEW 3)
    groupHeaders?: string[]; // Row 2: groups like 'REVIEWER 1', 'REVIEWER 2'
    detailHeaders: string[]; // Row 3: detail columns like 'Code', 'Date', 'Reviewer'
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
  }): RowNormalized[] {
    const { superHeaders, groupHeaders, detailHeaders, rawRows, headerRowIndex } = params;

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
        superHeaders: superHeaders || groupHeaders, // ✅ Use superHeaders (REVIEW 1/2/3) if available, else fall back to groupHeaders
        groupHeaders: groupHeaders || [],
        detailHeaders,
        rawRow,
        headerRowIndex
      });
      allEvents.push(...events);
    });

    return allEvents;
  }

  // syncToCalendar removed - use appsScriptService.ts instead
}

export const googleService = new GoogleSyncService();