/// <reference types="vite/client" />
import * as XLSX from 'xlsx';
import { 
  getMergedCells, 
  expandMergedCells,
  expandMergedDataRows,
  getHeaderFromMergedCells,
  analyzeMergeStructure,
  detectMergedHeaderRows
} from './mergedCellsHandler';
import { parseDateTime, formatDateTime } from './dateTimeParser';

export interface NormalizedSheet {
  sheetName: string;
  headers: string[];
  data: Record<string, any>[];
  detectedType: 'review' | 'schedule' | 'simple' | 'unknown';
  mergeInfo?: any;
}

interface HeaderInfo {
  value: string;
  row: number;
  col: number;
}

/**
 * Phát hiện loại sheet dựa trên cấu trúc
 */
function detectSheetType(worksheet: XLSX.WorkSheet): 'review' | 'schedule' | 'simple' {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Kiểm tra các ô đầu tiên
  const A1 = worksheet['A1']?.v?.toString().toLowerCase() || '';
  const A3 = worksheet['A3']?.v?.toString().toLowerCase() || '';
  
  // Sheet Review: có "Review" ở A1, "Date" ở A3
  if (A1.includes('review') && A3.includes('date')) {
    return 'review';
  }
  
  // Sheet Schedule: có merged cells và headers phức tạp
  if (worksheet['!merges'] && worksheet['!merges'].length > 0) {
    return 'schedule';
  }
  
  // Sheet Simple: headers ở row 1, data từ row 2
  return 'simple';
}

/**
 * Tìm tất cả headers trong worksheet (bao gồm merged cells)
 */
function findAllHeaders(worksheet: XLSX.WorkSheet): HeaderInfo[] {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const headers: HeaderInfo[] = [];
  const merges = worksheet['!merges'] || [];
  const processedCells = new Set<string>();
  
  // Quét 10 dòng đầu để tìm headers
  for (let row = 0; row <= Math.min(10, range.e.r); row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
      
      if (processedCells.has(cellAddr)) continue;
      
      const cell = worksheet[cellAddr];
      if (!cell || !cell.v) continue;
      
      const value = String(cell.v).trim();
      
      // Bỏ qua các giá trị số thuần túy hoặc ngày tháng
      if (/^\d+$/.test(value) || value.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        continue;
      }
      
      // Kiểm tra xem có phải header không (chữ in đậm, hoặc có keyword)
      const isLikelyHeader = 
        value.length > 0 &&
        value.length < 50 &&
        (value.includes('Code') || 
         value.includes('Date') || 
         value.includes('Room') ||
         value.includes('Reviewer') ||
         value.includes('Week') ||
         value.includes('Slot') ||
         value.includes('Group') ||
         /^[A-Z\s]+$/.test(value) || // Toàn chữ hoa
         cell.s?.font?.bold); // In đậm
      
      if (isLikelyHeader) {
        headers.push({ value, row, col });
        
        // Đánh dấu merged cells
        const merge = merges.find(m => 
          m.s.r <= row && m.e.r >= row &&
          m.s.c <= col && m.e.c >= col
        );
        
        if (merge) {
          for (let r = merge.s.r; r <= merge.e.r; r++) {
            for (let c = merge.s.c; c <= merge.e.c; c++) {
              processedCells.add(XLSX.utils.encode_cell({ r, c }));
            }
          }
        }
      }
    }
  }
  
  return headers;
}

/**
 * Xác định dòng bắt đầu data
 */
function findDataStartRow(
  worksheet: XLSX.WorkSheet,
  headers: HeaderInfo[]
): number {
  if (headers.length === 0) return 1;
  
  const maxHeaderRow = Math.max(...headers.map(h => h.row));
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Tìm dòng đầu tiên có data sau headers
  for (let row = maxHeaderRow + 1; row <= range.e.r; row++) {
    let hasData = false;
    
    for (let col = 0; col <= range.e.c; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && cell.v && String(cell.v).trim() !== '') {
        hasData = true;
        break;
      }
    }
    
    if (hasData) return row;
  }
  
  return maxHeaderRow + 1;
}

/**
 * Normalize headers về một dòng
 * Giữ nguyên headers từ getHeaderFromMergedCells vì đã xử lý multi-row
 */
function normalizeHeaders(headers: HeaderInfo[]): string[] {
  // Sắp xếp theo cột
  const sortedHeaders = [...headers].sort((a, b) => {
    if (a.col !== b.col) return a.col - b.col;
    return a.row - b.row;
  });
  
  // Lấy headers theo thứ tự column, ưu tiên row cuối (row chi tiết nhất)
  const headerByCol: Map<number, string> = new Map();
  
  for (const header of sortedHeaders) {
    const existing = headerByCol.get(header.col);
    if (!existing || existing.length === 0) {
      headerByCol.set(header.col, header.value);
    }
  }
  
  // Convert map to array
  const uniqueHeaders: string[] = [];
  const maxCol = Math.max(...sortedHeaders.map(h => h.col));
  
  for (let col = 0; col <= maxCol; col++) {
    uniqueHeaders.push(headerByCol.get(col) || `COLUMN ${col + 1}`);
  }
  
  return uniqueHeaders;
}

/**
 * Parse Sheet với xử lý merged cells và datetime
 */
function parseSheetWithMergedCells(worksheet: XLSX.WorkSheet): NormalizedSheet {
  // 1. Phân tích cấu trúc merged cells
  const mergeAnalysis = analyzeMergeStructure(worksheet);
  
  console.log('Merge Analysis:', mergeAnalysis);
  
  // 2. Expand merged cells để lấy data đầy đủ
  const expandedWorksheet = expandMergedDataRows(worksheet, 5);
  
  // 3. Tìm header row
  const headerRows = detectMergedHeaderRows(worksheet);
  let headerRow = 0;
  
  if (headerRows.length > 0) {
    headerRow = Math.max(...headerRows);
  } else {
    // Nếu không có merged header rows, tìm row đầu tiên có header text
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let row = 0; row <= Math.min(5, range.e.r); row++) {
      let headerCount = 0;
      for (let col = 0; col <= range.e.c; col++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell?.v && String(cell.v).trim().length > 0) {
          headerCount++;
        }
      }
      if (headerCount > range.e.c * 0.5) {
        headerRow = row;
        break;
      }
    }
  }
  
  // 4. Lấy headers từ merged cells (đã xử lý multi-row bên trong)
  let headers = getHeaderFromMergedCells(expandedWorksheet, headerRow);
  
  // Nếu vẫn không có headers, fallback
  if (headers.filter(h => h.length > 0).length === 0) {
    const fallbackHeaders = findAllHeaders(worksheet);
    headers = normalizeHeaders(fallbackHeaders);
  }
  
  // Clean up headers - loại bỏ các COLUMN x nếu có header thật
  headers = headers.map((h, idx) => {
    if (!h || h.trim() === '' || h.startsWith('COLUMN')) {
      // Thử tìm header thật từ các rows khác
      const realHeader = findAllHeaders(worksheet).find(hdr => hdr.col === idx);
      return realHeader ? realHeader.value : h;
    }
    return h;
  });
  
  // 5. Xác định dòng bắt đầu data
  const dataStartRow = headerRow + 1;
  
  // 6. Extract data
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const data: Record<string, any>[] = [];
  
  // Xác định date/time columns
  const dateColumns = headers.filter(h => /date|ngày|日期/i.test(h));
  const timeColumns = headers.filter(h => /slot|time|giờ|時間|hour/i.test(h));
  
  for (let row = dataStartRow; row <= range.e.r; row++) {
    const rowData: Record<string, any> = {};
    let hasData = false;
    
    headers.forEach((header, colIndex) => {
      const cell = expandedWorksheet[XLSX.utils.encode_cell({ r: row, c: colIndex })];
      let value: any = '';
      
      if (cell) {
        value = cell.v;
        
        // Parse datetime cho date/time columns
        if (dateColumns.includes(header) || timeColumns.includes(header)) {
          const parsed = parseDateTime(value);
          value = formatDateTime(parsed);
          
          if (parsed.type === 'date' && parsed.dateString) {
            rowData[`${header}_iso`] = parsed.dateString;
          } else if (parsed.timeSlot) {
            rowData[`${header}_start`] = parsed.timeSlot.startTime;
            rowData[`${header}_end`] = parsed.timeSlot.endTime;
            if (parsed.timeSlot.slot > 0) {
              rowData[`${header}_slot`] = parsed.timeSlot.slot;
            }
          }
        }
        
        if (value !== '' && value !== null && value !== undefined) {
          hasData = true;
        }
      }
      
      rowData[header] = value;
    });
    
    if (hasData) {
      data.push(rowData);
    }
  }
  
  return {
    sheetName: 'Sheet',
    headers,
    data,
    detectedType: 'schedule',
    mergeInfo: mergeAnalysis
  };
}

/**
 * Parse Review Sheet
 */
function parseReviewSheet(worksheet: XLSX.WorkSheet): NormalizedSheet {
  return parseSheetWithMergedCells(worksheet);
}

/**
 * Parse Schedule Sheet
 */
function parseScheduleSheet(worksheet: XLSX.WorkSheet): NormalizedSheet {
  return parseSheetWithMergedCells(worksheet);
}

/**
 * Parse Simple Sheet
 */
function parseSimpleSheet(worksheet: XLSX.WorkSheet): NormalizedSheet {
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
  
  return {
    sheetName: 'Simple',
    headers,
    data: jsonData as Record<string, any>[],
    detectedType: 'simple'
  };
}

/**
 * Parse Excel file - TỰ ĐỘNG PHÁT HIỆN VÀ XỬ LÝ
 */
export function parseExcelFile(file: File): Promise<NormalizedSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellStyles: true,
          cellDates: true,
          raw: false
        });
        
        const results: NormalizedSheet[] = [];
        
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const sheetType = detectSheetType(worksheet);
          
          // Kiểm tra xem có merged cells không
          if (worksheet['!merges'] && worksheet['!merges'].length > 0) {
            console.log(`Sheet "${sheetName}" có ${worksheet['!merges'].length} merged cells`);
          }
          
          let parsed: NormalizedSheet;
          
          switch (sheetType) {
            case 'review':
              parsed = parseReviewSheet(worksheet);
              break;
            case 'schedule':
              parsed = parseScheduleSheet(worksheet);
              break;
            case 'simple':
              parsed = parseSimpleSheet(worksheet);
              break;
            default:
              parsed = parseScheduleSheet(worksheet);
          }
          
          parsed.sheetName = sheetName;
          parsed.detectedType = sheetType;
          results.push(parsed);
        });
        
        resolve(results);
        
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse từ Google Sheets URL
 */
export async function parseGoogleSheets(url: string): Promise<NormalizedSheet[]> {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL');
  
  const spreadsheetId = match[1];
  const backendUrl = import.meta.env.VITE_BACKEND_URL as string;
  
  const response = await fetch(
    `${backendUrl}/api/sheets/parse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId })
    }
  );
  
  if (!response.ok) throw new Error('Failed to fetch Google Sheets data');
  
  return response.json();
}
