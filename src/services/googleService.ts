
import { RowNormalized, InferredSchema, SyncResult, ColumnMapping } from '../types';
import { parseDateTime } from '../utils/dateTimeParser';

/**
 * 🛠️ Local Helpers
 */

function generateRowId(sheetId: string, tab: string, rowIdx: number, prefix: string = 'row'): string {
  return `${prefix}-${sheetId.substring(0, 5)}-${tab}-${rowIdx}`;
}

function isLikelyPersonName(val: string): boolean {
  if (!val || val.length < 3) return false;
  // Loại bỏ nếu là số thuần túy (Mã số)
  if (/^\d+$/.test(val)) return false;
  // Loại bỏ nếu chứa quá nhiều số (Mã đề tài)
  const numbers = val.replace(/[^0-9]/g, "").length;
  if (numbers > val.length * 0.5) return false;
  return true;
}

function parseVNTime(dateStr: string, timeStr: string): { start: string; end: string } {
  try {
    // Xử lý ngày: hỗ trợ DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
    let date = dateStr.trim();
    if (date.includes('/')) {
      const parts = date.split('/');
      if (parts[0].length === 4) date = parts.join('-'); // YYYY/MM/DD
      else date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; // DD/MM/YYYY
    } else if (date.includes('-') && date.split('-')[0].length < 4) {
      const parts = date.split('-');
      date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    // Kiểm tra định dạng YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = new Date().toISOString().split('T')[0]; // Fallback to today
    }
    
    const timeParts = timeStr.split(/[-–—/]/);
    let startPart = (timeParts[0] || '').trim().replace('h', ':').replace('H', ':');
    let endPart = (timeParts[1] || '').trim().replace('h', ':').replace('H', ':');

    // Chỉnh sửa định dạng HH:mm
    const fixTime = (t: string) => {
      if (!t) return "00:00";
      if (t.includes(':')) {
        const [h, m] = t.split(':');
        return `${h.padStart(2, '0')}:${(m || '00').padEnd(2, '0')}`;
      }
      if (/^\d+$/.test(t)) return `${t.padStart(2, '0')}:00`;
      return "00:00";
    };

    const start = `${date}T${fixTime(startPart)}`;
    let end = '';
    if (endPart) {
      end = `${date}T${fixTime(endPart)}`;
    } else {
      const h = parseInt(fixTime(startPart).split(':')[0]);
      end = `${date}T${(h + 1).toString().padStart(2, '0')}:00`;
    }
    return { start, end };
  } catch (e) {
    const today = new Date().toISOString().split('T')[0];
    return { start: `${today}T08:00`, end: `${today}T09:00` };
  }
}

function inferSchema(headers: string[], sampleRows: string[][]): InferredSchema {
  const mapping: Record<string, number> = {};
  
  headers.forEach((h, i) => {
    const head = (h || "").toLowerCase();
    
    // Ưu tiên Ngày
    if (head === "ngày" || head === "date" || (head.includes("ngày") && !head.includes("ký"))) mapping.date = i;
    // Ưu tiên Giờ
    else if (head === "giờ" || head === "time" || head.includes("slot") || head.includes("tiết")) mapping.time = i;
    // Ưu tiên GVHD/Người thực hiện
    else if (head.includes("người") || head.includes("gvhd") || head.includes("giảng viên") || head.includes("reviewer")) {
      if (!mapping.person) mapping.person = i;
    }
    // Ưu tiên Tên đề tài/Nhiệm vụ
    else if (head.includes("tên đề tài") || head.includes("nhiệm vụ") || head.includes("topic") || head.includes("project")) {
       if (!mapping.task) mapping.task = i;
    }
    // Ưu tiên Phòng
    else if (head.includes("phòng") || head.includes("location") || head.includes("room")) mapping.location = i;
  });

  // Kiểm tra dữ liệu mẫu để cải thiện độ chính xác
  if (sampleRows && sampleRows.length > 0) {
    sampleRows[0].forEach((cell, i) => {
      const val = (cell || "").toString();
      if (!mapping.date && /^\d{1,2}[\/\-]\d{1,2}/.test(val)) mapping.date = i;
      if (!mapping.time && /\d{1,2}h/i.test(val)) mapping.time = i;
    });
  }

  return {
    mapping: mapping as any,
    confidence: Object.keys(mapping).length / 5,
    isReliable: mapping.date !== undefined && mapping.time !== undefined
  };
}

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

  private detectSheetFormat(values: string[][]): {
    headerRowIndex: number;
    isDataMau: boolean;
    confidence: number;
    formatName: string;
  } {
    const rows = values.slice(0, 5).map(r => r.join("").toLowerCase());
    
    let isTest1 = rows.some(r => r.includes("ngành") && r.includes("mã đề tài"));
    let isReview = rows.some(r => r.includes("review") || r.includes("hội đồng"));

    if (isTest1) return { headerRowIndex: 0, isDataMau: false, confidence: 100, formatName: 'test1' };
    if (isReview) return { headerRowIndex: 2, isDataMau: true, confidence: 100, formatName: 'Review' };
    
    return { headerRowIndex: 0, isDataMau: false, confidence: 50, formatName: 'Mặc định' };
  }

  private fillForwardRow(row: string[]): string[] {
    const filled: string[] = [];
    let last = '';
    for (let i = 0; i < row.length; i++) {
      const cell = (row[i] || '').toString().trim();
      if (cell) { last = cell; filled[i] = cell; }
      else { filled[i] = last; }
    }
    return filled;
  }

  async loadSheet(url: string, tab: string, token: string) {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error("URL Sheet không hợp lệ.");

    const metadata = await this.fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, token);
    const allSheetNames = metadata.sheets.map((s: any) => s.properties.title);
    const finalTabName = allSheetNames.includes(tab) ? tab : allSheetNames[0];

    const range = `'${finalTabName}'!A1:BE500`;
    const data = await this.fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`, token);

    const values: string[][] = data.values || [];
    if (values.length === 0) {
      throw new Error("Sheet này không có dữ liệu hoặc tab không tồn tại.");
    }

    const detection = this.detectSheetFormat(values);
    const headerRowIndex = detection.headerRowIndex;

    let headers = values[headerRowIndex] || [];
    let groupHeaders = headerRowIndex > 0 ? this.fillForwardRow(values[headerRowIndex - 1] || []) : undefined;
    let schema = inferSchema(headers, values.slice(headerRowIndex + 1, headerRowIndex + 6));

    return {
      rows: [], 
      schema,
      headers: headers,
      rawRows: values, // Trả về toàn bộ dữ liệu thô
      sheetId,
      headerRowIndex,
      groupHeaders,
      isDataMau: detection.isDataMau
    };
  }

  normalizeRows(params: {
    sheetId: string;
    tab: string;
    headers: string[];
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
  }): RowNormalized[] {
    const { sheetId, tab, mapping, rawRows, headerRowIndex } = params;
    const dataRows = rawRows.slice(headerRowIndex + 1);

    return dataRows.map((row, idx) => {
      const date = (row[mapping.date!] || "").toString().trim();
      const time = (row[mapping.time!] || "").toString().trim();
      if (!date || !time) return null;

      const { start, end } = parseVNTime(date, time);
      const person = (row[mapping.person!] || "").toString().trim();
      if (!isLikelyPersonName(person)) return null;

      return {
        id: generateRowId(sheetId, tab, idx + headerRowIndex + 1),
        date,
        startTime: start,
        endTime: end,
        person,
        task: (row[mapping.task!] || "Nhiệm vụ").toString().trim(),
        location: (row[mapping.location!] || "Chưa xác định").toString().trim(),
        status: 'pending'
      };
    }).filter(r => r !== null) as RowNormalized[];
  }

  normalizeRowsWithGrouping(params: {
    sheetId: string;
    tab: string;
    groupHeaders?: string[];
    detailHeaders: string[];
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
  }): RowNormalized[] {
    const { sheetId, tab, groupHeaders, detailHeaders, rawRows, mapping, headerRowIndex } = params;
    const allEvents: RowNormalized[] = [];
    const dataRows = rawRows.slice(headerRowIndex + 1);

    let lastDate = "";
    let lastTime = "";
    let lastLocation = "";

    dataRows.forEach((row, rowIndex) => {
      const currentDate = (row[mapping.date!] || "").toString().trim();
      const currentTime = (row[mapping.time!] || "").toString().trim();
      const currentLocation = (row[mapping.location!] || "").toString().trim();

      if (currentDate) lastDate = currentDate;
      if (currentTime) lastTime = currentTime;
      if (currentLocation) lastLocation = currentLocation;

      if (!lastDate || !lastTime) return;

      const { start, end } = parseVNTime(lastDate, lastTime);
      const baseTask = (row[mapping.task!] || "Review").toString().trim();

      const groups = new Map<string, number[]>();
      if (groupHeaders) {
        groupHeaders.forEach((gName, colIdx) => {
          const name = gName.trim();
          const detail = (detailHeaders[colIdx] || "").toLowerCase();
          
          // Chỉ lấy các cột trong nhóm Review/Hội đồng
          if (name.toLowerCase().includes('review') || name.toLowerCase().includes('hội đồng')) {
            // Loại bỏ các cột thông tin phụ như code, id, count, email
            if (!detail.includes('code') && !detail.includes('mã') && !detail.includes('id') && 
                !detail.includes('count') && !detail.includes('stt') && !detail.includes('số')) {
              if (!groups.has(name)) groups.set(name, []);
              groups.get(name)!.push(colIdx);
            }
          }
        });
      }

      if (groups.size > 0) {
        groups.forEach((colIndices, gName) => {
          colIndices.forEach((colIdx) => {
            const person = (row[colIdx] || "").toString().trim();
            if (isLikelyPersonName(person)) {
              allEvents.push({
                id: `${sheetId}-${tab}-${rowIndex}-${colIdx}`,
                groupName: gName,
                person,
                date: lastDate,
                startTime: start,
                endTime: end,
                task: baseTask,
                location: lastLocation || "Chưa xác định",
                status: 'pending'
              });
            }
          });
        });
      } else {
        const person = (row[mapping.person!] || "").toString().trim();
        if (isLikelyPersonName(person)) {
          allEvents.push({
            id: `${sheetId}-${tab}-${rowIndex}`,
            person,
            date: lastDate,
            startTime: start,
            endTime: end,
            task: baseTask,
            location: lastLocation || "Chưa xác định",
            status: 'pending'
          });
        }
      }
    });

    return allEvents;
  }
}

export const googleService = new GoogleSyncService();