/**
 * Parse headers từ Google Sheet theo cấu trúc thực tế:
 * - Row 0: Merged headers (PROJECTS INFORMATION, REVIEW 1-2-3, ...)
 * - Row 1: Sub-headers (STT, Mã nhóm, ..., REVIEW 1, REVIEW 2, ...)
 * - Row 2: Detail headers (Code, Count, Reviewer 1, ...)
 * - Row 3+: Data
 */

export function parseHeadersFromSheet(sheetData: string[][]): string[] {
  // Lấy detail headers từ row 2 (index 2) vì nó có chi tiết nhất
  const detailHeaders = sheetData[2] || [];
  // Lấy sub-headers từ row 1 (index 1) để backup khi detail header rỗng
  const subHeaders = sheetData[1] || [];

  const headers: string[] = [];

  for (let i = 0; i < 57; i++) {
    // Ưu tiên detail header (row 2), nếu rỗng thì lấy sub-header (row 1)
    const detailHeader = detailHeaders[i]?.trim();
    const subHeader = subHeaders[i]?.trim();

    if (detailHeader) {
      headers[i] = detailHeader;
    } else if (subHeader && subHeader !== 'REVIEW 1' && subHeader !== 'REVIEW 2' && subHeader !== 'REVIEW 3' && subHeader !== 'DEFENSE 1' && subHeader !== 'DEFENSE 2') {
      // Bỏ qua các section names
      headers[i] = subHeader;
    } else {
      headers[i] = `Column_${i}`;
    }
  }

  return headers;
}

/**
 * Parse merged cells từ sheet metadata
 */
export interface MergedCellGroup {
  name: string;
  startCol: number;
  endCol: number;
  colCount: number;
}

export function parseMergedCells(): MergedCellGroup[] {
  // Cấu trúc merged cells cố định
  return [
    { name: 'PROJECTS INFORMATION', startCol: 0, endCol: 8, colCount: 9 },      // A1:I1
    { name: 'Review 1', startCol: 9, endCol: 18, colCount: 10 },                // J2:S2
    { name: 'Review 2', startCol: 19, endCol: 27, colCount: 9 },                // T2:AB2
    { name: 'Review 3', startCol: 28, endCol: 37, colCount: 10 },               // AC2:AL2
    { name: 'Supervisor Result', startCol: 38, endCol: 38, colCount: 1 },       // AM2
    { name: 'Defense 1', startCol: 39, endCol: 48, colCount: 10 },              // AN2:AW2
    { name: 'Defense 2', startCol: 49, endCol: 56, colCount: 8 }                // AX2:BE2
  ];
}

/**
 * Lấy dữ liệu từ row 4 trở xuống
 */
export function parseSheetDataRows(sheetData: string[][], headers: string[]): Record<string, string>[] {
  // Bỏ qua 3 hàng đầu (row 1, 2, 3), lấy từ row 4 (index 3)
  const dataRows = sheetData.slice(3);

  return dataRows
    .filter(row => row.some(cell => cell?.trim())) // Bỏ hàng trống
    .map((row, idx) => {
      const obj: Record<string, string> = {
        _rowIndex: (idx + 4).toString() // Lưu số dòng gốc
      };
      headers.forEach((header, colIdx) => {
        obj[header] = row[colIdx] || '';
      });
      return obj;
    });
}

/**
 * Detect cấu trúc headers và trả về mapping
 */
export function detectHeaderSections(headers: string[]) {
  return {
    projectsInfo: headers.slice(0, 9),      // A-I
    review1: headers.slice(9, 19),          // J-S
    review2: headers.slice(19, 28),         // T-AB
    review3: headers.slice(28, 38),         // AC-AL
    supervisorResult: headers.slice(38, 39), // AM
    defense1: headers.slice(39, 49),        // AN-AW
    defense2: headers.slice(49, 57)         // AX-BE
  };
}

/**
 * 🆕 DYNAMIC DETECTION: Find sections based on keywords instead of fixed indices
 * Addresses edge case: Columns inserted/deleted shifting indices
 */
export function detectHeaderSectionsDynamic(headers: string[]) {
  // Helper to find start index of a keyword
  const findStart = (keyword: string, startFrom: number = 0): number => {
    const idx = headers.findIndex((h, i) =>
      i >= startFrom && h?.toLowerCase().includes(keyword.toLowerCase())
    );
    return idx === -1 ? -1 : idx;
  };

  // Find landmarks
  const review1Start = findStart('Review 1');
  const review2Start = findStart('Review 2', review1Start + 1);
  const defense1Start = findStart('Defense 1', review2Start + 1);

  // Fallback to defaults if not found
  if (review1Start === -1 || review2Start === -1) {
    console.warn('⚠️ Cannot detect dynamic sections, using defaults.');
    return detectHeaderSections(headers);
  }

  // Calculate generic ranges based on landmarks
  return {
    projectsInfo: headers.slice(0, review1Start),
    review1: headers.slice(review1Start, review2Start),
    review2: headers.slice(review2Start, defense1Start !== -1 ? defense1Start : undefined),
    // ... logic can be extended
  };
}
