
import { format } from 'date-fns';
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
    else if (head.includes("phòng") || head.includes("location") || head.includes("room") || head.includes("địa điểm")) mapping.location = i;
    // Ưu tiên Email
    else if (head.includes("email") || head.includes("thư điện tử") || head.includes("mail")) mapping.email = i;
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
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
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

      // 🕵️ FALLBACK: Nếu không có mapping, thử lấy các cột đầu tiên để người dùng thấy gì đó
      const dIdx = mapping.date !== undefined ? mapping.date : 0;
      const tIdx = mapping.time !== undefined ? mapping.time : 1;
      const pIdx = mapping.person !== undefined ? mapping.person : 2;
      const lIdx = mapping.location !== undefined ? mapping.location : 3;

      const dateRaw = (dIdx < row.length ? (row[dIdx] || "") : "").toString().trim();
      const timeRaw = (tIdx < row.length ? (row[tIdx] || "") : "").toString().trim();
      const locationRaw = (lIdx < row.length ? (row[lIdx] || "") : "").toString().trim();

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
      if (!lastDate && (mapping.date !== undefined || mapping.time !== undefined)) {
        console.warn(`[Normalized] Dòng ${idx} SKIP: Thiếu NGÀY.`, row.slice(0, 5));
        failCount++;
        return null;
      }

      try {
        const { start, end } = (lastDate && timeRaw) 
          ? parseVNTime(lastDate, timeRaw, preferredFormat)
          : { start: "", end: "" };

        let person = (pIdx < row.length ? (row[pIdx] || "") : "").toString().trim();

        if (!person || !isLikelyPersonName(person)) {
          const taskVal = (mapping.task !== undefined && mapping.task < row.length ? row[mapping.task] : (row[pIdx] || ""));
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
          email: (mapping.email !== undefined && mapping.email < row.length ? row[mapping.email] : "").toString().trim(),
          sheetType: 'council',
          resources: [
            person ? `teacher:${person}` : null,
            lastLocation ? `room:${lastLocation}` : null
          ].filter(Boolean) as string[],
          dateRaw: lastDate,
          timeRaw: timeRaw,
          personRaw: (mapping.person !== undefined && mapping.person < row.length ? row[mapping.person] : "").toString().trim(),
          locationRaw: lastLocation,
          status: 'pending',
          isGrouped: false, // 🎨 Explicitly set for color coding
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
    const { sheetId, tab, rawRows, mapping, headerRowIndex, isDataMau, preferredFormat, detailHeaders } = params;
    const allEvents: RowNormalized[] = [];
    const dataRows = rawRows.slice(headerRowIndex + 1);

    const findTripleAnchors = (headers: string[]) => {
      const labels: Record<string, number[]> = {};
      headers.forEach((h, i) => {
        const lbl = (h || "").trim().toLowerCase();
        if (!lbl || lbl.startsWith('column_')) return;
        if (!labels[lbl]) labels[lbl] = [];
        labels[lbl].push(i);
      });
      
      const J_INDEX = 9;

      // Strategy 1: Identical Sets (e.g., "Code" appearing 3+ times)
      const tripleLabels = Object.keys(labels).filter(l => labels[l].filter(idx => idx >= J_INDEX).length >= 3);
      if (tripleLabels.length > 0) {
        const bestLabel = tripleLabels.find(l => l.includes('code') || l.includes('reviewer') || l.includes('gv') || l.includes('slot')) || tripleLabels[0];
        return labels[bestLabel].filter(idx => idx >= J_INDEX).sort((a, b) => a - b);
      }

      // Strategy 2: Sequential Triplets (e.g., "Reviewer 1", "Reviewer 2", "Reviewer 3")
      const sequentialBases = ['reviewer', 'gv', 'reviewer ', 'gv ', 'giảng viên ', 'giang vien '];
      for (const base of sequentialBases) {
        const anchor1 = headers.findIndex((h, i) => i >= J_INDEX && String(h || "").toLowerCase().includes(`${base}1`));
        const anchor2 = headers.findIndex((h, i) => i >= J_INDEX && String(h || "").toLowerCase().includes(`${base}2`));
        const anchor3 = headers.findIndex((h, i) => i >= J_INDEX && String(h || "").toLowerCase().includes(`${base}3`));
        
        if (anchor1 !== -1 && anchor2 !== -1 && anchor3 !== -1) {
          return [anchor1, anchor2, anchor3].sort((a, b) => a - b);
        }
      }
      
      return [];
    };

    let blockStartIndices = findTripleAnchors(detailHeaders);

    // 🚀 UNIFIED REVIEW MODE DETECTION
    const hasReviewerHeaders = detailHeaders.some(h => {
      const low = String(h || "").toLowerCase();
      return low.includes('reviewer 1') || low.includes('gv 1') || (low.includes('reviewer') && low.includes('1'));
    });
    const suspectReview = !!isDataMau || ((tab || "").toLowerCase().includes("review") && hasReviewerHeaders);
    const isTripleMode = suspectReview && blockStartIndices.length >= 3;
    const finalBlockStarts = isTripleMode ? blockStartIndices : [0]; 

    // 🔍 SILENT CODE DETECTION: Find the column index for "Code/ID" automatically
    const codeKeywords = ['mã', 'code', 'id', 'id đề tài', 'mã đề tài', 'mã số'];
    const inferredCodeIdx = detailHeaders.findIndex(h => 
      codeKeywords.some(k => String(h || "").toLowerCase().includes(k))
    );

    if (suspectReview && inferredCodeIdx !== -1) {
       console.log(`[Grouping] Silent detection: Found Code column at index ${inferredCodeIdx} ("${detailHeaders[inferredCodeIdx]}")`);
    }

    const getMappedValue = (field: keyof ColumnMapping, currentRow: string[], blockStartIdx: number = 0, blockEndIdx: number = detailHeaders.length - 1) => {
      const originalIdx = (mapping as any)[field];
      if (originalIdx === undefined) return "";
      if (!isTripleMode) return (currentRow[originalIdx] || "").toString().trim();

      const J_INDEX = 9;
      const firstAnchor = Math.min(J_INDEX, blockStartIndices[0] || J_INDEX);
      const targetHeader = String(detailHeaders[originalIdx] || "").trim().toLowerCase();

      if (targetHeader && !targetHeader.startsWith('column_') && originalIdx >= firstAnchor) {
        let occurrenceIndex = 0;
        for (let i = firstAnchor; i < originalIdx; i++) {
          if (String(detailHeaders[i] || "").trim().toLowerCase() === targetHeader) {
            occurrenceIndex++;
          }
        }
        let currentOccurrence = 0;
        for (let i = blockStartIdx; i <= blockEndIdx; i++) {
          if (String(detailHeaders[i] || "").trim().toLowerCase() === targetHeader) {
            if (currentOccurrence === occurrenceIndex) return (currentRow[i] || "").toString().trim();
            currentOccurrence++;
          }
        }
      }

      if (originalIdx >= firstAnchor) {
         const offset = originalIdx - firstAnchor;
         const relativeIdx = blockStartIdx + offset;
         return (currentRow[relativeIdx] || "").toString().trim();
      }
      return (currentRow[originalIdx] || "").toString().trim();
    };

    let lastDate = "";
    let lastLocation = "";

    dataRows.forEach((row, rowIndex) => {
      const joined = row.join('').trim();
      if (!joined || joined.length < 3) return; 

      // 📝 STICKY LOGIC: Support merged cells
      const rowDate = getMappedValue('date', row);
      const rowLocation = getMappedValue('location', row);
      if (rowDate) lastDate = rowDate;
      if (rowLocation) lastLocation = rowLocation;

      const baseTask = (mapping.task !== undefined ? (row[mapping.task] || "Review") : "Review").toString().trim();
      const rCode = inferredCodeIdx !== -1 ? (row[inferredCodeIdx] || "").toString().trim() : "";

      finalBlockStarts.forEach((blockStart, blockIdx) => {
        const blockEnd = isTripleMode 
          ? (blockIdx < blockStartIndices.length - 1 ? blockStartIndices[blockIdx + 1] - 1 : detailHeaders.length - 1)
          : detailHeaders.length - 1;

        let rDate = getMappedValue('date', row, blockStart, blockEnd) || lastDate;
        let rTime = getMappedValue('time', row, blockStart, blockEnd);
        let rLocation = getMappedValue('location', row, blockStart, blockEnd) || lastLocation;
        let rPerson = getMappedValue('person', row, blockStart, blockEnd);
        let rTask = getMappedValue('task', row, blockStart, blockEnd);
        
        const fieldKeywords: Record<string, string[]> = {
          date: ['ngày', 'date'],
          time: ['slot', 'giờ', 'time'],
          location: ['phòng', 'room', 'location'],
          person: ['reviewer', 'giảng viên', 'cán bộ', 'họ tên'],
          task: ['nhiệm vụ', 'đề tài', 'task', 'tiêu đề'],
          email: ['email', 'thư điện tử', 'mail']
        };

        const autoInferList = (field: keyof ColumnMapping) => {
          const keywords = fieldKeywords[field] || [];
          const matches: string[] = [];
          detailHeaders.forEach((h, i) => {
             const inBlock = isTripleMode ? (i >= blockStart && i <= blockEnd) : true;
             if (inBlock && keywords.some(k => String(h || "").toLowerCase().includes(k))) {
                const val = (row[i] || "").toString().trim();
                if (val) matches.push(val);
             }
          });
          return matches;
        };

        if (!rDate) rDate = autoInferList('date')[0] || lastDate;
        if (!rTime) rTime = autoInferList('time')[0] || "";
        if (!rLocation) rLocation = autoInferList('location')[0] || lastLocation;
        if (!rTask) rTask = autoInferList('task')[0] || "";
        if (!rPerson) rPerson = autoInferList('person')[0] || "";

        // 🛡️ TRIPLE MODE FILTER: Chỉ tạo sự kiện nếu block có Giảng viên hoặc Giờ cụ thể
        const hasBlockContent = rPerson || rTime;
        const shouldCreate = isTripleMode ? hasBlockContent : (rPerson || rDate || rTime || rLocation);
        
        if (!shouldCreate) return;

        try {
          const parsedD = parseDateTime(rDate, preferredFormat);
          const finalDate = parsedD.date ? format(parsedD.date, 'dd/MM/yyyy') : (rDate || "Chưa chọn");
          const finalTime = rTime || "---";
          const { start, end } = (parsedD.date && rTime) ? parseVNTime(rDate, rTime, preferredFormat) : { start: "", end: "" };
          const finalReviewers = autoInferList('person').slice(0, 2);
          const eventId = `${generateRowId(sheetId, tab, rowIndex + headerRowIndex + 1)}-b${blockIdx}`;

          allEvents.push({
            id: eventId,
            groupName: `Review ${blockIdx + 1}`,
            person: finalReviewers[0] || rPerson || rTask || baseTask,
            reviewers: finalReviewers,
            date: finalDate,
            startTime: start,
            endTime: end,
            task: rTask || baseTask,
            location: rLocation || "Chưa xác định",
            email: getMappedValue('email', row, blockStart, blockEnd) || autoInferList('email')[0] || "",
            code: rCode,
            sheetType: 'review',
            resources: [
              ...finalReviewers.map(p => `teacher:${p}`),
              rLocation ? `room:${rLocation}` : null
            ].filter(Boolean) as string[],
            dateRaw: finalDate,
            timeRaw: finalTime,
            personRaw: rPerson,
            locationRaw: rLocation,
            blockStart,
            blockEnd,
            reviewAreaStart: blockStartIndices[0],
            status: 'pending',
            isGrouped: true, 
            rawRow: row
          });
        } catch (e) {
          console.error(`[Grouping] Error Row ${rowIndex} Block ${blockIdx}:`, e);
        }
      });
    });

    // 🚀 SMART DEDUPLICATION: Merge identical events (including Code)
    const uniqueMap = new Map<string, RowNormalized>();
    allEvents.forEach(ev => {
      // Key includes time, person, location, and code to be safe
      const key = `${ev.startTime}-${ev.endTime}-${ev.person}-${ev.location}-${ev.code || ''}`.toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, ev);
      }
    });

    const deduped = Array.from(uniqueMap.values());
    console.log(`[GoogleService] normalizeRowsWithGrouping DONE: ${allEvents.length} -> ${deduped.length}`);
    return deduped;
  }
}

export const googleService = new GoogleSyncService();
