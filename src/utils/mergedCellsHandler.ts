import * as XLSX from 'xlsx';

export interface MergeInfo {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  value: any;
}

/**
 * Lấy tất cả merged cells từ worksheet
 */
export function getMergedCells(worksheet: XLSX.WorkSheet): MergeInfo[] {
  const merges = worksheet['!merges'] || [];
  
  return merges.map(merge => ({
    startRow: merge.s.r,
    endRow: merge.e.r,
    startCol: merge.s.c,
    endCol: merge.e.c,
    value: worksheet[XLSX.utils.encode_cell(merge.s)]?.v
  }));
}

/**
 * Kiểm tra xem cell có nằm trong merged cell không
 */
export function isInMergedCell(
  row: number,
  col: number,
  mergedCells: MergeInfo[]
): MergeInfo | null {
  return mergedCells.find(
    merge => 
      row >= merge.startRow && row <= merge.endRow &&
      col >= merge.startCol && col <= merge.endCol
  ) || null;
}

/**
 * Xử lý merged cells - điền giá trị từ cell gốc vào tất cả cells trong merge
 */
export function expandMergedCells(worksheet: XLSX.WorkSheet): void {
  const merges = worksheet['!merges'] || [];
  
  merges.forEach(merge => {
    const masterCell = XLSX.utils.encode_cell(merge.s);
    const masterValue = worksheet[masterCell];
    
    // Điền giá trị từ cell gốc vào tất cả cells khác trong merge
    for (let row = merge.s.r; row <= merge.e.r; row++) {
      for (let col = merge.s.c; col <= merge.e.c; col++) {
        if (row !== merge.s.r || col !== merge.s.c) {
          const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
          worksheet[cellAddr] = masterValue;
        }
      }
    }
  });
}

/**
 * Phát hiện merged header rows
 * Ví dụ: Row 1-2 gộp lại là header
 */
export function detectMergedHeaderRows(
  worksheet: XLSX.WorkSheet,
  maxRows: number = 5
): number[] {
  const merges = worksheet['!merges'] || [];
  const mergedRows = new Set<number>();
  
  // Tìm tất cả rows tham gia vào merged cells
  merges.forEach(merge => {
    if (merge.e.r - merge.s.r > 0) { // Có gộp dòng
      for (let r = merge.s.r; r <= merge.e.r && r < maxRows; r++) {
        mergedRows.add(r);
      }
    }
  });
  
  return Array.from(mergedRows).sort((a, b) => a - b);
}

/**
 * Phát hiện merged header columns
 * Ví dụ: Col A-I gộp lại là header
 */
export function detectMergedHeaderCols(
  worksheet: XLSX.WorkSheet,
  maxCols: number = 26
): number[] {
  const merges = worksheet['!merges'] || [];
  const mergedCols = new Set<number>();
  
  // Tìm tất cả cols tham gia vào merged cells ở header area (row 0-5)
  merges.forEach(merge => {
    const isInHeaderArea = merge.s.r < 5;
    if (isInHeaderArea && merge.e.c - merge.s.c > 0) { // Có gộp cột
      for (let c = merge.s.c; c <= merge.e.c && c < maxCols; c++) {
        mergedCols.add(c);
      }
    }
  });
  
  return Array.from(mergedCols).sort((a, b) => a - b);
}

/**
 * Tìm header text từ merged cells với hỗ trợ multi-row headers
 * Khi headers spanning nhiều rows, sẽ kết hợp các rows lại
 * VD: Row 1: "Project" (gộp A-C), Row 2: "Code | Name | Date" -> "Project - Code", "Project - Name", "Project - Date"
 */
export function getHeaderFromMergedCells(
  worksheet: XLSX.WorkSheet,
  headerRow: number
): string[] {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const merges = worksheet['!merges'] || [];
  const headers: string[] = [];
  
  console.log('[getHeaderFromMergedCells] Starting with headerRow:', headerRow);
  console.log('[getHeaderFromMergedCells] Range:', range);
  console.log('[getHeaderFromMergedCells] Merges:', merges);
  
  // Tìm tất cả rows có khả năng là header (quét 10 rows đầu)
  const headerRows: number[] = [];
  for (let r = 0; r <= Math.min(10, headerRow + 3); r++) {
    let hasHeader = false;
    let cellsInRow: string[] = [];
    
    for (let c = 0; c <= Math.min(15, range.e.c); c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      const value = String(cell?.v || '').trim();
      cellsInRow.push(value);
      
      // Kiểm tra xem có phải header text không (bỏ qua số và empty)
      if (value.length > 0 && value.length < 100 && !/^\d+$/.test(value)) {
        hasHeader = true;
      }
    }
    
    console.log(`[getHeaderFromMergedCells] Row ${r}:`, cellsInRow);
    
    if (hasHeader) {
      headerRows.push(r);
    }
  }
  
  console.log('[getHeaderFromMergedCells] Detected header rows:', headerRows);
  
  // Nếu không tìm thấy header rows, dùng headerRow làm default
  if (headerRows.length === 0) {
    headerRows.push(headerRow);
  }
  
  // Build hierarchical header structure
  const headerHierarchy: Map<number, string[]> = new Map();
  
  for (const row of headerRows) {
    const rowHeaders: string[] = [];
    const processedCols = new Set<number>();
    
    for (let col = 0; col <= range.e.c; col++) {
      if (processedCols.has(col)) {
        // Đã xử lý bởi merged cell, skip
        continue;
      }
      
      // Tìm merged cell chứa column này ở row hiện tại
      const merge = merges.find(m =>
        m.s.r <= row && m.e.r >= row &&
        m.s.c <= col && m.e.c >= col
      );
      
      if (merge) {
        // Lấy value từ cell gốc của merged cell
        const masterCell = XLSX.utils.encode_cell(merge.s);
        const value = String(worksheet[masterCell]?.v || '').trim();
        
        console.log(`[getHeaderFromMergedCells] Row ${row} Col ${col}: Merged cell "${value}" spanning cols ${merge.s.c}-${merge.e.c}`);
        
        // Nếu merged cell kéo dài nhiều columns, fill vào từng column
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          if (c >= rowHeaders.length) {
            // Pad array nếu cần
            while (rowHeaders.length <= c) {
              rowHeaders.push('');
            }
          }
          // Chỉ set nếu chưa có value
          if (!rowHeaders[c] || rowHeaders[c] === '') {
            rowHeaders[c] = value;
          }
          processedCols.add(c);
        }
      } else {
        // Cell bình thường
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
        const value = String(cell?.v || '').trim();
        
        console.log(`[getHeaderFromMergedCells] Row ${row} Col ${col}: Normal cell "${value}"`);
        
        // Pad array nếu cần
        while (rowHeaders.length <= col) {
          rowHeaders.push('');
        }
        rowHeaders[col] = value;
        processedCols.add(col);
      }
    }
    
    console.log(`[getHeaderFromMergedCells] Row ${row} headers:`, rowHeaders);
    headerHierarchy.set(row, rowHeaders);
  }
  
  // Combine multi-row headers
  const numCols = range.e.c + 1;
  for (let col = 0; col < numCols; col++) {
    const headerParts: string[] = [];
    
    for (const row of headerRows) {
      const rowHeaders = headerHierarchy.get(row) || [];
      const value = rowHeaders[col];
      
      if (value && value.length > 0) {
        // Chỉ add nếu khác với phần trước (tránh duplicate)
        if (headerParts.length === 0 || headerParts[headerParts.length - 1] !== value) {
          headerParts.push(value);
        }
      }
    }
    
    // Join các parts lại
    let finalHeader = headerParts.join(' - ');
    
    // Nếu không có header, dùng fallback
    if (!finalHeader || finalHeader.trim() === '') {
      finalHeader = `COLUMN ${col + 1}`;
    }
    
    console.log(`[getHeaderFromMergedCells] Final header for col ${col}:`, finalHeader);
    headers.push(finalHeader);
  }
  
  console.log('[getHeaderFromMergedCells] Final headers:', headers);
  return headers;
}

/**
 * Xử lý trường hợp gộp row (ví dụ: data row gộp để chỉ hiển thị 1 dòng)
 * Tách ra thành nhiều dòng riêng
 */
export function expandMergedDataRows(
  worksheet: XLSX.WorkSheet,
  dataStartRow: number
): XLSX.WorkSheet {
  const merges = worksheet['!merges'] || [];
  const newWorksheet = { ...worksheet };
  
  // Tìm merged cells trong data area
  const dataMerges = merges.filter(m => m.s.r >= dataStartRow);
  
  if (dataMerges.length === 0) return newWorksheet;
  
  // Xử lý từng merged cell
  dataMerges.forEach(merge => {
    if (merge.e.r - merge.s.r > 0) { // Có gộp row
      const masterCell = XLSX.utils.encode_cell(merge.s);
      const masterValue = worksheet[masterCell];
      
      // Điền giá trị từ cell chủ vào tất cả cells trong merged area
      for (let row = merge.s.r; row <= merge.e.r; row++) {
        for (let col = merge.s.c; col <= merge.e.c; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
          if (!newWorksheet[cellAddr]) {
            newWorksheet[cellAddr] = masterValue;
          }
        }
      }
    }
  });
  
  return newWorksheet;
}

/**
 * Phân tích cấu trúc merged cells để hiểu layout
 */
export function analyzeMergeStructure(worksheet: XLSX.WorkSheet) {
  const merges = worksheet['!merges'] || [];
  
  const analysis = {
    totalMerges: merges.length,
    mergedRows: [] as MergeInfo[],
    mergedCols: [] as MergeInfo[],
    mergedBoth: [] as MergeInfo[],
    headerMerges: [] as MergeInfo[],
    dataMerges: [] as MergeInfo[]
  };
  
  merges.forEach(merge => {
    const info: MergeInfo = {
      startRow: merge.s.r,
      endRow: merge.e.r,
      startCol: merge.s.c,
      endCol: merge.e.c,
      value: worksheet[XLSX.utils.encode_cell(merge.s)]?.v
    };
    
    if (merge.e.r === merge.s.r) {
      // Chỉ gộp cột
      analysis.mergedCols.push(info);
    } else if (merge.e.c === merge.s.c) {
      // Chỉ gộp row
      analysis.mergedRows.push(info);
    } else {
      // Gộp cả row và col
      analysis.mergedBoth.push(info);
    }
    
    // Phân loại header vs data
    if (merge.s.r < 5) {
      analysis.headerMerges.push(info);
    } else {
      analysis.dataMerges.push(info);
    }
  });
  
  return analysis;
}
