
import { RowNormalized, InferredSchema, SyncResult, ColumnMapping, DateFormat } from '../types';
import { parseDateTime } from '../utils/dateTimeParser';

/**
 * 🛠️ Local Helpers
 */

function generateRowId(sheetId: string, tab: string, rowIdx: number, prefix: string = 'row'): string {
  const cleanTab = (tab || 'Sheet1').replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${sheetId.substring(0, 5)}-${cleanTab}-${rowIdx}`;
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

function parseVNTime(dateStr: string, timeStr: string, preferredFormat?: DateFormat): { start: string; end: string } {
  try {
    // 🚨 DEFENSIVE: Nếu nhận vào chuỗi rỗng, trả về fallback an toàn thay vì crash
    if (!dateStr || !timeStr) {
       console.warn(`⚠️ parseVNTime received empty input: date="${dateStr}", time="${timeStr}". Returning fallback.`);
       return { start: "1970-01-01T08:00:00+07:00", end: "1970-01-01T09:00:00+07:00" };
    }

    const parsedDate = parseDateTime(dateStr, preferredFormat);
    const parsedTime = parseDateTime(timeStr);

    console.log(`📅 Parsed Date:`, parsedDate);
    console.log(`⏰ Parsed Time:`, parsedTime);

    // ⚠️ KHÔNG dùng fallback ngày hiện tại - báo lỗi rõ ràng
    if (!parsedDate.dateString) {
      console.error(`❌ Cannot parse date: "${dateStr}" (Detected type: ${parsedDate.type})`);
      throw new Error(`Không thể phân tích ngày: "${dateStr}". Vui lòng kiểm tra định dạng (Hỗ trợ VN: dd/MM/yyyy hoặc US: M/d/yyyy).`);
    }

    const datePart = parsedDate.dateString;

    let startTime = "08:00";
    let endTime = "09:00";

    if (parsedTime.timeSlot) {
      startTime = parsedTime.timeSlot.startTime;
      endTime = parsedTime.timeSlot.endTime;
    } else {
      console.warn(`⚠️ Time slot not found for "${timeStr}", using default 08:00-09:00`);
    }

    const result = {
      start: `${datePart}T${startTime}:00+07:00`,
      end: `${datePart}T${endTime}:00+07:00`
    };

    console.log(`✅ parseVNTime Result:`, result);
    return result;
  } catch (e) {
    console.error(`❌ parseVNTime Error:`, e);
    throw e; // Re-throw để caller biết có lỗi
  }
}

export function inferSchema(headers: string[], sampleRows: string[][]): InferredSchema {
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

  private detectSheetFormat(values: string[][], tabName?: string): {
    headerRowIndex: number;
    isDataMau: boolean;
    confidence: number;
    formatName: string;
  } {
    const rows = values.slice(0, 5).map(r => r.join("").toLowerCase());
    const lowTab = (tabName || "").toLowerCase();

    // Nhận diện Review: Qua tên tab hoặc nội dung row đầu
    const isReview = lowTab.includes("review") || values.some((row, idx) =>
      idx < 3 && row.some(cell =>
        cell?.toString().toLowerCase().includes("review 1") ||
        cell?.toString().toLowerCase().includes("review 2")
      )
    );

    if (isReview) {
      // Tìm dòng chứa Review 1/2/3
      const reviewRowIdx = values.findIndex(row => row.some(c => c?.toString().toLowerCase().includes("review 1")));
      return {
        headerRowIndex: reviewRowIdx !== -1 ? reviewRowIdx + 1 : 1,
        isDataMau: true,
        confidence: 100,
        formatName: 'Review'
      };
    }

    const isTest1 = rows.some(r => (r.includes("ngành") && r.includes("mã đề tài")) || r.includes("hội đồng"));
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

  async loadSheet(url: string, tabName: string, accessToken: string) {
    const sheetId = this.extractSheetId(url);
    if (!sheetId) throw new Error('URL Google Sheet không hợp lệ');

    const metadata = await this.fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, accessToken);
    const allSheetNames = metadata.sheets.map((s: any) => s.properties.title);
    const finalTabName = allSheetNames.includes(tabName) ? tabName : allSheetNames[0];

    const range = `'${finalTabName}'!A1:BE500`;
    const data = await this.fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`, accessToken);

    const values: string[][] = data.values || [];
    if (values.length === 0) {
      throw new Error("Sheet này không có dữ liệu hoặc tab không tồn tại.");
    }

    const format = this.detectSheetFormat(values, finalTabName);

    return {
      rawRows: values,
      sheetId,
      tabName: finalTabName,
      headerRowIndex: format.headerRowIndex,
      isDataMau: format.isDataMau
    };
  }

  normalizeRows(params: {
    sheetId: string;
    tab: string;
    headers: string[];
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
    preferredFormat?: DateFormat;
  }): RowNormalized[] {
    const { sheetId, tab, mapping, rawRows, headerRowIndex, preferredFormat } = params;
    // Bắt đầu từ dòng tiếp theo của header đã chọn
    const dataRows = rawRows.slice(headerRowIndex + 1);
    console.log(`[GoogleService] normalizeRows START: ${dataRows.length} rows`);
    console.log(`[GoogleService] Target Date Col Index: ${mapping.date}, Time Col Index: ${mapping.time}`);

    if (mapping.date === undefined || mapping.time === undefined) {
      console.error(`[GoogleService] CRITICAL: Mapping is missing Date (${mapping.date}) or Time (${mapping.time})!`);
    }
    
    let lastDate = "";
    let lastLocation = "";
    let successCount = 0;
    let failCount = 0;

    const results = dataRows.map((row, idx) => {
      // 🚨 Bỏ qua dòng trống
      if (!row || row.length === 0 || row.join("").trim() === "") return null;

      const dateRaw = (mapping.date !== undefined && mapping.date < row.length ? (row[mapping.date] || "") : "").toString().trim();
      const timeRaw = (mapping.time !== undefined && mapping.time < row.length ? (row[mapping.time] || "") : "").toString().trim();
      const locationRaw = (mapping.location !== undefined && mapping.location < row.length ? (row[mapping.location] || "") : "").toString().trim();

      if (dateRaw) lastDate = dateRaw;
      if (locationRaw) lastLocation = locationRaw;

      // 🚨 KIỂM TRA QUAN TRỌNG: Cần có GIỜ mới coi là 1 sự kiện
      if (!timeRaw) {
        // Chỉ log nếu dòng có vẻ là dữ liệu (ví dụ có cột person ở đầu)
        const hasData = row.slice(0, 5).some(c => c && c.length > 2);
        if (hasData) console.warn(`[Normalized] Dòng ${idx} SKIP: Thiếu GIỜ (Col ${mapping.time}). Raw:`, row.slice(0, 8));
        failCount++;
        return null;
      }

      // 🚨 Cần có NGÀY (tự có hoặc lấy từ dòng trên)
      if (!lastDate) {
        console.warn(`[Normalized] Dòng ${idx} SKIP: Thiếu NGÀY (Col ${mapping.date}). Raw:`, row.slice(0, 8));
        failCount++;
        return null;
      }

      try {
        const { start, end } = parseVNTime(lastDate, timeRaw, preferredFormat);
        let person = (mapping.person !== undefined && mapping.person < row.length ? (row[mapping.person] || "") : "").toString().trim();

        if (!person || !isLikelyPersonName(person)) {
          const taskVal = (mapping.task !== undefined && mapping.task < row.length ? row[mapping.task] : "");
          person = (taskVal || person || "Cán bộ/GV").toString().trim();
        }

        successCount++;
        return {
          id: generateRowId(sheetId, tab, idx + headerRowIndex + 1),
          date: lastDate,
          startTime: start,
          endTime: end,
          person: person,
          task: (mapping.task !== undefined && mapping.task < row.length ? (row[mapping.task] || "Nhiệm vụ") : "Nhiệm vụ").toString().trim(),
          location: lastLocation || "Chưa xác định",
          resources: [
            person ? `teacher:${person}` : null,
            lastLocation ? `room:${lastLocation}` : null
          ].filter(Boolean) as string[],
          dateRaw: lastDate,
          timeRaw: timeRaw,
          personRaw: (mapping.person !== undefined && mapping.person < row.length ? row[mapping.person] : "").toString().trim(),
          locationRaw: lastLocation,
          status: 'pending',
          rawRow: row
        };
      } catch (err) {
        console.error(`[Normalized] Lỗi parse dòng ${idx}:`, err);
        failCount++;
        return null;
      }
    }).filter(r => r !== null) as RowNormalized[];

    console.log(`[GoogleService] normalizeRows DONE: Success=${successCount}, Skipped/Failed=${failCount}`);
    return results;
  }

  normalizeRowsWithGrouping(params: {
    sheetId: string;
    tab: string;
    groupHeaders?: string[];
    detailHeaders: string[];
    rawRows: string[][];
    mapping: ColumnMapping;
    headerRowIndex: number;
    isDataMau?: boolean;
    preferredFormat?: DateFormat;
  }): RowNormalized[] {
    const { sheetId, tab, groupHeaders, detailHeaders, rawRows, mapping, headerRowIndex, isDataMau, preferredFormat } = params;
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

      // 🚨 Bắt buộc có đủ ngày và giờ mới xử lý
      if (!lastDate || !lastTime) return;

      console.log(`[Grouping-Row] Check row ${rowIndex}: date="${lastDate}", time="${lastTime}"`);
      const { start, end } = parseVNTime(lastDate, lastTime, preferredFormat);
      const baseTask = (mapping.task !== undefined ? (row[mapping.task] || "Review") : "Review").toString().trim();

      // Tự động nhận diện tất cả các khối (Review 1, 2, 3...)
      let reviewGroups = new Map<string, number[]>();

      if (groupHeaders) {
        groupHeaders.forEach((gName, colIdx) => {
          const name = (gName || "").trim();
          if (name) {
            if (!reviewGroups.has(name)) reviewGroups.set(name, []);
            reviewGroups.get(name)!.push(colIdx);
          }
        });
      }

      // Fallback 1: Tìm dựa trên cột 'Reviewer' lặp lại ở Row 3 (nới lỏng từ khóa)
      if (reviewGroups.size < 2) {
        const blockIndices: number[] = [];
        detailHeaders.forEach((h, i) => {
          const lbl = (h || "").toLowerCase();
          // Tìm mọi cột có chứa reviewer, giảng viên, cb chấm, giám khảo... kèm số 1 hoặc đứng đầu khối
          if ((lbl.includes('reviewer') || lbl.includes('giảng viên') || lbl.includes('cb chấm') || lbl.includes('giám khảo')) &&
            (lbl.includes('1') || !lbl.match(/\d/))) {
            if (blockIndices.length === 0 || (i - blockIndices[blockIndices.length - 1] > 2)) {
              blockIndices.push(i);
            }
          }
        });

        if (blockIndices.length >= 2) {
          reviewGroups.clear(); // Reset để dùng fallback
          blockIndices.forEach((start, idx) => {
            const nextStart = blockIndices[idx + 1] || detailHeaders.length;
            const name = `Review ${idx + 1}`;
            const cols = [];
            for (let i = start; i < nextStart; i++) cols.push(i);
            reviewGroups.set(name, cols);
          });
        }
      }

      // Fallback 2: Nếu vẫn < 2 khối, ép chia đều sheet thành 3 phần nếu tab là Review hoặc isDataMau gạt tay
      if (reviewGroups.size < 2) {
        const isReviewSheet = tab.toLowerCase().includes('review') || isDataMau;
        if (isReviewSheet) {
          reviewGroups.clear();
          const totalCols = detailHeaders.length;
          const startCol = mapping.date !== undefined ? Math.min(mapping.date, mapping.time || 999) : 0;
          const usefulCols = totalCols - startCol;
          const blockSize = Math.max(3, Math.floor(usefulCols / 3));

          for (let i = 0; i < 3; i++) {
            const start = startCol + (i * blockSize);
            const end = i === 2 ? totalCols - 1 : startCol + ((i + 1) * blockSize) - 1;
            const cols = [];
            for (let c = start; c <= Math.min(end, totalCols - 1); c++) cols.push(c);
            reviewGroups.set(`Review ${i + 1}`, cols);
          }
        }
      }

      const isReviewMode = reviewGroups.size >= 1; // Chấp nhận cả 1 block nhưng thường sẽ là 3 do fallback trên

      if (isReviewMode) {
        const sortedGroupNames = Array.from(reviewGroups.keys()).sort((a, b) => {
          const aIdx = Math.min(...reviewGroups.get(a)!);
          const bIdx = Math.min(...reviewGroups.get(b)!);
          return aIdx - bIdx;
        });

        sortedGroupNames.forEach((gName) => {
          const colIndices = reviewGroups.get(gName)!;
          const groupStart = Math.min(...colIndices);
          const groupEnd = Math.max(...colIndices);

          const getMappedValue = (field: keyof ColumnMapping) => {
            const mappedIdx = mapping[field];
            if (mappedIdx === undefined) return "";

            const label = (detailHeaders[mappedIdx] || "").trim();
            const allMatchIndices = detailHeaders.reduce((acc, h, i) => {
              if (h.trim() === label) acc.push(i);
              return acc;
            }, [] as number[]);

            const localIdx = allMatchIndices.find(idx => idx >= groupStart && idx <= groupEnd);
            const finalIdx = localIdx !== undefined ? localIdx : mappedIdx;

            return (row[finalIdx] || "").toString().trim();
          };

          const reviewers = colIndices.filter(idx => {
            const h = (detailHeaders[idx] || "").toLowerCase();
            return h.includes('reviewer 1') || h.includes('reviewer 2') || h.includes('giảng viên');
          }).map(idx => (row[idx] || "").toString().trim()).filter(Boolean);

          const rDate = getMappedValue('date') || lastDate;
          const rTime = getMappedValue('time') || lastTime;
          const rLocation = getMappedValue('location') || lastLocation;

          // 🚨 Kiểm tra ngày trước khi parse
          if (!rDate) {
            console.warn(`[Grouping] Bỏ qua vì thiếu ngày: Review=${gName}, Row=${rowIndex}`);
            return;
          }
          if (!rTime) {
            return; // Không có giờ thì thôi
          }

          const { start, end } = parseVNTime(rDate, rTime, preferredFormat);
          const reviewerNames = reviewers.join(" & ");

          let personValue = "";
          if (baseTask && reviewerNames) {
            personValue = `${baseTask} - ${reviewerNames}`;
          } else {
            personValue = reviewerNames || baseTask || gName;
          }

          if (!reviewerNames && !baseTask) return;

          allEvents.push({
            id: `${sheetId}-${tab}-${rowIndex}-${gName}`,
            groupName: gName,
            person: personValue,
            date: rDate || "Chưa rõ",
            startTime: start,
            endTime: end,
            task: baseTask,
            location: rLocation || "Chưa xác định",
            resources: [
              reviewerNames ? `teacher:${reviewerNames}` : null,
              rLocation ? `room:${rLocation}` : null
            ].filter(Boolean) as string[],
            dateRaw: rDate,
            timeRaw: rTime,
            personRaw: reviewerNames,
            locationRaw: rLocation,
            status: 'pending',
            rawRow: row
          });
        });
      } else {
        // Chế độ bình thường: 1 dòng -> 1 sự kiện
        const personValue = (mapping.person !== undefined ? (row[mapping.person] || "") : "").toString().trim();
        if (!personValue && !baseTask) return;

        if (!lastDate || !lastTime) return;
        console.log(`[Grouping-Normal] date="${lastDate}", time="${lastTime}"`);
        const { start, end } = parseVNTime(lastDate, lastTime, preferredFormat);

        allEvents.push({
          id: `${sheetId}-${tab}-${rowIndex}`,
          person: personValue || baseTask,
          date: lastDate || "Chưa rõ",
          startTime: start,
          endTime: end,
          task: baseTask,
          location: lastLocation || "Chưa xác định",
          resources: [
            personValue ? `teacher:${personValue}` : null,
            lastLocation ? `room:${lastLocation}` : null
          ].filter(Boolean) as string[],
          dateRaw: lastDate,
          timeRaw: lastTime,
          personRaw: personValue || baseTask,
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