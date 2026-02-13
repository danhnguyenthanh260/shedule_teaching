
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

    const findTripleAnchors = (headers: string[]) => {
      const labels: Record<string, number[]> = {};
      headers.forEach((h, i) => {
        const lbl = (h || "").trim().toLowerCase();
        if (!lbl || lbl.startsWith('column_')) return;
        if (!labels[lbl]) labels[lbl] = [];
        labels[lbl].push(i);
      });
      
      // Strategy 1: "Greedy" Code Search (Take the LAST 3 occurrences)
      // This skips "Code" that might be in the project info area (columns A-I)
      const codeIndices = (labels["code"] || []);
      if (codeIndices.length >= 3) {
        return codeIndices.slice(-3).sort((a, b) => a - b);
      }

      // Strategy 2: "Greedy" Reviewer Search
      const rev1Indices = (labels["reviewer 1"] || labels["gv 1"] || []);
      if (rev1Indices.length >= 3) {
        return rev1Indices.slice(-3).sort((a, b) => a - b);
      }

      // Strategy 3: Any triple label that repeats exactly 3 times in the J+ range
      const tripleLabels = Object.keys(labels).filter(l => labels[l].filter(idx => idx >= 9).length === 3);
      if (tripleLabels.length > 0) {
        const bestLabel = tripleLabels.find(l => l.includes('date') || l.includes('slot') || l.includes('room') || l.includes('reviewer')) || tripleLabels[0];
        return labels[bestLabel].filter(idx => idx >= 9).sort((a, b) => a - b);
      }
      
      return [];
    };

    let blockStartIndices = findTripleAnchors(detailHeaders);

    // 🚀 UNIFIED REVIEW MODE DETECTION:
    // It's Review Mode if: explicit flag OR tab name contains review.
    const suspectReview = !!isDataMau || (tab || "").toLowerCase().includes("review");
    
    // 🚀 Robustness: Search first 10 rows for anchors if needed
    if (suspectReview && blockStartIndices.length !== 3) {
      console.log("[Grouping] Searching first 10 rows for best triple anchors...");
      for (let i = 0; i < Math.min(10, rawRows.length); i++) {
        const potential = rawRows[i].map(h => String(h || ""));
        const found = findTripleAnchors(potential);
        if (found.length === 3) {
          console.log(`[Grouping] SUCCESS: Triple anchors found on row index ${i}:`, found);
          blockStartIndices = found;
          break;
        }
      }
    }

    // 🚨 FINAL FALLBACK: If we are in Review Mode but anchors still failed, 
    // we MUST FORCE 12 items by splitting from Column J.
    if (suspectReview && blockStartIndices.length !== 3) {
      const J_INDEX = 9;
      const total = detailHeaders.length;
      if (total >= J_INDEX + 3) {
        const blockSize = Math.floor((total - J_INDEX) / 3);
        blockStartIndices = [J_INDEX, J_INDEX + blockSize, J_INDEX + (2 * blockSize)];
        console.warn("[Grouping] Anchors not found. Falling back to heuristic split:", blockStartIndices);
      } else {
        // Absolute fallback for smaller sheets
        blockStartIndices = [0, Math.floor(total/3), Math.floor(2*total/3)];
        console.warn("[Grouping] Sheet too small. Using absolute split:", blockStartIndices);
      }
    }

    // In Review Mode, Triple Mode is MANDATORY
    const isTripleMode = suspectReview;
    console.log(`[Grouping] Expansion Mode: ${isTripleMode}, Block Starts:`, blockStartIndices);

    dataRows.forEach((row, rowIndex) => {
      // 🚨 1. CHẶN DÒNG TRỐNG (Mềm mỏng hơn để không mất dòng cuối)
      const joined = row.join('').trim();
      if (!joined || joined.length < 3) return; 

      const baseTask = (mapping.task !== undefined ? (row[mapping.task] || "Review") : "Review").toString().trim();
      const basePerson = (mapping.person !== undefined ? (row[mapping.person] || "") : "").toString().trim();

      if (isTripleMode) {
        // 🔄 Expand 1 row -> 3 events
        blockStartIndices.forEach((blockStart, blockIdx) => {
          const firstAnchor = blockStartIndices[0];
          // Calculate block end dynamically based on next block start
          const blockEnd = blockIdx < 2 ? blockStartIndices[blockIdx + 1] - 1 : detailHeaders.length - 1;

          const getMappedValueInBlock = (field: keyof ColumnMapping) => {
            const originalIdx = mapping[field];
            if (originalIdx === undefined) return "";
            
            const firstAnchor = blockStartIndices[0];
            const targetHeader = (detailHeaders[originalIdx] || "").trim().toLowerCase();

            // 🎯 Strategy 1: Header Label Matching (Best for irregular blocks)
            // Look for a column in the CURRENT block that has the same header name as the one mapped in block 1.
            if (targetHeader && !targetHeader.startsWith('column_')) {
              const matchingIdx = detailHeaders.findIndex((h, i) => 
                i >= blockStart && i <= blockEnd && (h || "").trim().toLowerCase() === targetHeader
              );
              if (matchingIdx !== -1) return (row[matchingIdx] || "").toString().trim();
            }

            // 🎯 Strategy 2: Relative Offset (Fallback for unlabelled columns)
            if (originalIdx >= firstAnchor) {
              const offset = originalIdx - firstAnchor;
              const relativeIdx = blockStart + offset;
              if (relativeIdx < row.length) {
                return (row[relativeIdx] || "").toString().trim();
              }
            } else {
              // Global area (A-I)
              return (row[originalIdx] || "").toString().trim();
            }

            return "";
          };

          let rDate = getMappedValueInBlock('date');
          let rTime = getMappedValueInBlock('time');
          let rLocation = getMappedValueInBlock('location');
          let rPerson = getMappedValueInBlock('person');
          
          // 👥 FALLBACK: If per-block extraction failed, use auto-infer logic
          // (Only for missing data, not to overwrite explicit mapping)
          const fieldKeywords: Record<string, string[]> = {
            date: ['ngày', 'date'],
            time: ['slot', 'giờ', 'time'],
            location: ['phòng', 'room', 'location'],
            person: ['reviewer', 'giảng viên', 'cán bộ'],
            task: ['nhiệm vụ', 'đề tài', 'task', 'code']
          };

          const autoInferList = (field: keyof ColumnMapping) => {
            const keywords = fieldKeywords[field] || [];
            const matches: string[] = [];
            detailHeaders.forEach((h, i) => {
               if (i >= blockStart && i <= blockEnd && keywords.some(k => (h || "").toLowerCase().includes(k))) {
                 const val = (row[i] || "").toString().trim();
                 if (val) matches.push(val);
               }
            });
            return matches;
          };

          if (!rDate) rDate = autoInferList('date')[0] || "";
          if (!rTime) rTime = autoInferList('time')[0] || "";
          if (!rLocation) rLocation = autoInferList('location')[0] || "";
          if (!rPerson) {
             const persons = autoInferList('person');
             rPerson = persons.length > 0 ? persons.join(" & ") : (basePerson || "");
          }

          // 🚀 2. ROBUSTNESS FIX: Chỉ skip nếu block này THỰC SỰ trống rỗng (không ngày, giờ, phòng, người)
          // Điều này giúp giữ lại các "slot" trống nhưng có lịch (11 -> 12 events)
          const hasAnyDataInBlock = rPerson || rDate || rTime || rLocation || (row[blockStart] && row[blockStart].trim().length > 0);
          
          if (!hasAnyDataInBlock) {
             console.log(`[Grouping] Skipping Block ${blockIdx} row ${rowIndex}: Absolute empty block.`);
             return;
          }

          try {
            // Default values if dates/times are missing (to ensure it shows in Step 3 table)
            const parsedD = parseDateTime(rDate, preferredFormat);
            const finalDate = parsedD.date ? format(parsedD.date, 'dd/MM/yyyy') : (rDate || "Chưa chọn");
            const finalTime = rTime || "---";
            
            const { start, end } = (parsedD.date && rTime) 
              ? parseVNTime(rDate, rTime, preferredFormat)
              : { start: "", end: "" };
            
            const eventId = `${generateRowId(sheetId, tab, rowIndex + headerRowIndex + 1)}-b${blockIdx}`;
            console.log(`[Grouping] Row ${rowIndex} Block ${blockIdx} -> ID: ${eventId}, Date: ${finalDate}, Person: ${rPerson}`);

            allEvents.push({
              id: eventId,
              groupName: `Review ${blockIdx + 1}`,
              person: rPerson || baseTask,
              date: finalDate,
              startTime: start,
              endTime: end,
              task: baseTask,
              location: rLocation || "Chưa xác định",
              resources: [
                rPerson ? `teacher:${rPerson}` : null,
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
              rawRow: row
            });
          } catch (e) {
            console.error(`[Grouping] Error Row ${rowIndex} Block ${blockIdx}:`, e);
          }
        });
      } else {
        // Fallback to 1 row -> 1 event (Normal Mode)
        // Auto-infer for normal mode too if it helps debugging
        const getNormalVal = (field: keyof ColumnMapping) => {
          if (mapping[field] !== undefined) return (row[mapping[field]!] || "").toString().trim();
          // Minimal auto-infer for preview
          const fieldKeywords: Record<string, string[]> = {
            date: ['ngày', 'date'],
            time: ['slot', 'giờ', 'time'],
            person: ['giảng viên', 'họ tên', 'name']
          };
          const keywords = fieldKeywords[field] || [];
          const idx = detailHeaders.findIndex(h => keywords.some(k => (h || "").toLowerCase().includes(k)));
          return idx !== -1 ? (row[idx] || "").toString().trim() : "";
        };

        const rDate = getNormalVal('date');
        const rTime = getNormalVal('time');
        const rPerson = getNormalVal('person') || basePerson;

        if (!rDate && !rTime && !rPerson) return;

        try {
          const { start, end } = (rDate && rTime) ? parseVNTime(rDate, rTime, preferredFormat) : { start: "", end: "" };
          allEvents.push({
            id: `${sheetId}-${tab}-${rowIndex}`,
            person: rPerson || baseTask,
            date: rDate || "Chưa chọn",
            startTime: start,
            endTime: end,
            task: baseTask,
            location: (mapping.location !== undefined ? (row[mapping.location] || "Chưa xác định") : "Chưa xác định").toString().trim(),
            status: 'pending',
            rawRow: row
          });
        } catch (e) {}
      }
    });

    return allEvents;
  }
}

export const googleService = new GoogleSyncService();