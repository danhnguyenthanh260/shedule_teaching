
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
    const parsedDate = parseDateTime(dateStr);
    const parsedTime = parseDateTime(timeStr);
    
    // Fallback if basic parsing fails
    const today = new Date().toISOString().split('T')[0];
    const datePart = parsedDate.dateString || today;
    
    let startTime = "08:00";
    let endTime = "09:00";

    if (parsedTime.timeSlot) {
      startTime = parsedTime.timeSlot.startTime;
      endTime = parsedTime.timeSlot.endTime;
    }

    return { 
      start: `${datePart}T${startTime}:00+07:00`, 
      end: `${datePart}T${endTime}:00+07:00` 
    };
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
    // Ưu tiên GVHD/Người thực hiện/Hội đồng
    else if (head.includes("người") || head.includes("gvhd") || head.includes("giảng viên") || head.includes("reviewer") || head.includes("họ và tên") || head.includes("thành viên")) {
      if (!mapping.person) mapping.person = i;
    }
    // Ưu tiên Tên đề tài/Nhiệm vụ
    else if (head.includes("tên đề tài") || head.includes("nhiệm vụ") || head.includes("topic") || head.includes("project") || head.includes("đề tài")) {
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
    
    let isTest1 = rows.some(r => (r.includes("ngành") && r.includes("mã đề tài")) || r.includes("hội đồng"));
    let isReview = rows.some(r => r.includes("review") || r.includes("hội đồng") || r.includes("người đánh giá"));

    if (isReview) return { headerRowIndex: 1, isDataMau: true, confidence: 100, formatName: 'Review' };
    if (isTest1) return { headerRowIndex: 0, isDataMau: false, confidence: 90, formatName: 'test1' };
    
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
    // Bắt đầu từ dòng tiếp theo của header đã chọn
    const dataRows = rawRows.slice(headerRowIndex + 1);
    
    console.log(`[GoogleService] normalizeRows: processing ${dataRows.length} rows, headerRowIndex: ${headerRowIndex}`);

    return dataRows.map((row, idx) => {
      // Bỏ qua dòng nếu trông giống header (chứa các từ khóa tiêu đề)
      const joinedRow = row.join(" ").toLowerCase();
      if (joinedRow.includes("ngày") || joinedRow.includes("thời gian") || joinedRow.includes("phòng")) {
        return null;
      }

      const date = (mapping.date !== undefined ? (row[mapping.date] || "") : "").toString().trim();
      const time = (mapping.time !== undefined ? (row[mapping.time] || "") : "").toString().trim();
      
      // Chỉ bỏ qua nếu thiếu cả ngày và giờ
      if (!date && !time) return null;

      const { start, end } = parseVNTime(date, time);
      let person = (mapping.person !== undefined ? (row[mapping.person] || "") : "").toString().trim();
      
      // Cố gắng lấy person từ các cột lân cận nếu cột mapping đang trống
      if (!person || !isLikelyPersonName(person)) {
        // Thử lấy task name làm person
        const taskVal = (mapping.task !== undefined ? row[mapping.task] : "");
        person = (taskVal || person || "Cán bộ/GV").toString().trim();
      }

      return {
        id: generateRowId(sheetId, tab, idx + headerRowIndex + 1),
        date: date || "Chưa rõ",
        startTime: start,
        endTime: end,
        person: person,
        task: (mapping.task !== undefined ? (row[mapping.task] || "Nhiệm vụ") : "Nhiệm vụ").toString().trim(),
        location: (mapping.location !== undefined ? (row[mapping.location] || "Chưa xác định") : "Chưa xác định").toString().trim(),
        dateRaw: date,
        timeRaw: time,
        personRaw: (mapping.person !== undefined ? row[mapping.person] : "").toString().trim(),
        locationRaw: (mapping.location !== undefined ? row[mapping.location] : "").toString().trim(),
        status: 'pending',
        rawRow: row
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

    console.log(`[GoogleService] normalizeRowsWithGrouping: processing ${dataRows.length} rows`);

    let lastDate = "";
    let lastTime = "";
    let lastLocation = "";

    dataRows.forEach((row, rowIndex) => {
      // Skip rows that look like headers
      const joinedRow = row.join(" ").toLowerCase();
      if (joinedRow.includes("ngày") || joinedRow.includes("giờ") || joinedRow.includes("phòng")) return;

      const currentDate = (mapping.date !== undefined ? (row[mapping.date] || "") : "").toString().trim();
      const currentTime = (mapping.time !== undefined ? (row[mapping.time] || "") : "").toString().trim();
      const currentLocation = (mapping.location !== undefined ? (row[mapping.location] || "") : "").toString().trim();

      if (currentDate) lastDate = currentDate;
      if (currentTime) lastTime = currentTime;
      if (currentLocation) lastLocation = currentLocation;

      // Không có date/time thì không xử lý dòng này
      if (!lastDate && !lastTime) return;

      const { start, end } = parseVNTime(lastDate, lastTime);
      const baseTask = (mapping.task !== undefined ? (row[mapping.task] || "Review") : "Review").toString().trim();

      const groups = new Map<string, number[]>();
      if (groupHeaders && mapping.person !== undefined) {
        const targetGroupLabel = (groupHeaders[mapping.person] || "").trim();
        
        if (targetGroupLabel) {
          groupHeaders.forEach((gName, colIdx) => {
            const name = (gName || "").trim();
            if (name === targetGroupLabel) {
              const detail = (detailHeaders[colIdx] || "").toLowerCase();
              
              const isInfoCol = detail.includes('code') || detail.includes('mã') || detail.includes('id') || 
                              detail.includes('count') || detail.includes('stt') || detail.includes('số') ||
                              detail.includes('email');
              
              if (!isInfoCol) {
                if (!groups.has(name)) groups.set(name, []);
                groups.get(name)!.push(colIdx);
              }
            }
          });
        }
      }

      if (groups.size > 0) {
        groups.forEach((colIndices, gName) => {
          colIndices.forEach((colIdx) => {
            // ƯU TIÊN: Nếu người dùng đã mapping cột person cụ thể, hãy lấy giá trị từ đó
            const mappedPerson = (mapping.person !== undefined ? (row[mapping.person] || "") : "").toString().trim();
            const personValue = mappedPerson || (row[colIdx] || "").toString().trim();
            
            // CHẤP NHẬN dữ liệu kể cả khi personValue không giống tên người (để hiển thị thô)
            allEvents.push({
              id: `${sheetId}-${tab}-${rowIndex}-${colIdx}`,
              groupName: gName,
              person: personValue || (baseTask || gName),
              date: lastDate || "Chưa rõ",
              startTime: start,
              endTime: end,
              task: baseTask,
              location: lastLocation || "Chưa xác định",
              dateRaw: lastDate,
              timeRaw: lastTime,
              personRaw: personValue,
              locationRaw: lastLocation,
              status: 'pending',
              rawRow: row
            });
          });
        });
      } else {
        // Fallback về 1 dòng = 1 event
        const person = (mapping.person !== undefined ? (row[mapping.person] || "") : "").toString().trim();
        allEvents.push({
          id: `${sheetId}-${tab}-${rowIndex}`,
          person: person || (baseTask || "Chưa rõ"),
          date: lastDate || "Chưa rõ",
          startTime: start,
          endTime: end,
          task: baseTask,
          location: lastLocation || "Chưa xác định",
          dateRaw: lastDate,
          timeRaw: lastTime,
          personRaw: person || (baseTask || "Chưa rõ"),
          locationRaw: lastLocation,
          status: 'pending',
          rawRow: row
        });
      }
    });

    return allEvents;
  }
}

export const googleService = new GoogleSyncService();