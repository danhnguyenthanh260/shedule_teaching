
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
      
      const J_INDEX = 9;

      // Strategy 1: Identical Triplets (e.g., "Code", "Code", "Code")
      const tripleLabels = Object.keys(labels).filter(l => labels[l].filter(idx => idx >= J_INDEX).length === 3);
      if (tripleLabels.length > 0) {
        // Prioritize meaningful labels
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

    // 🚀 UNIFIED REVIEW MODE DETECTION:
    const hasReviewerHeaders = detailHeaders.some(h => {
      const low = String(h || "").toLowerCase();
      return low.includes('reviewer 1') || low.includes('gv 1') || (low.includes('reviewer') && low.includes('1'));
    });
    
    // It's Review Mode if: explicit flag OR (tab has "review" AND has specific headers).
    const suspectReview = !!isDataMau || ((tab || "").toLowerCase().includes("review") && hasReviewerHeaders);
    
    // 🚀 NEW LOGIC: Only use Triple Mode if we actually found 3 blocks on the CURRENT header row.
    // We REMOVED the "search first 10 rows" logic because it caused false positives on simple review sheets (like Review1).
    const isTripleMode = suspectReview && blockStartIndices.length === 3;
    const finalBlockStarts = isTripleMode ? blockStartIndices : [0]; 
    
    if (suspectReview) {
       console.log(`[Grouping] Sheet: ${tab}, TripleMode: ${isTripleMode}, Anchors:`, blockStartIndices);
    }

    dataRows.forEach((row, rowIndex) => {
      // 🚨 1. CHẶN DÒNG TRỐNG (Mềm mỏng hơn để không mất dòng cuối)
      const joined = row.join('').trim();
      if (!joined || joined.length < 3) return; 

      const baseTask = (mapping.task !== undefined ? (row[mapping.task] || "Review") : "Review").toString().trim();
      const basePerson = (mapping.person !== undefined ? (row[mapping.person] || "") : "").toString().trim();

      finalBlockStarts.forEach((blockStart, blockIdx) => {
        // Calculate block end dynamically based on next block start
        const blockEnd = isTripleMode 
          ? (blockIdx < 2 ? blockStartIndices[blockIdx + 1] - 1 : detailHeaders.length - 1)
          : detailHeaders.length - 1;

        const getMappedValueInBlock = (field: keyof ColumnMapping) => {
          const originalIdx = mapping[field];
          if (originalIdx === undefined) return "";
          
          if (!isTripleMode) {
            return (row[originalIdx] || "").toString().trim();
          }

          const J_INDEX = 9;
          const firstAnchor = Math.min(J_INDEX, blockStartIndices[0] || J_INDEX);
          const targetHeader = String(detailHeaders[originalIdx] || "").trim().toLowerCase();

          // 🎯 Strategy 1: Occurrence-Aware Header Label Matching
          if (targetHeader && !targetHeader.startsWith('column_') && originalIdx >= firstAnchor) {
            let occurrenceIndex = 0;
            for (let i = firstAnchor; i < originalIdx; i++) {
              if (String(detailHeaders[i] || "").trim().toLowerCase() === targetHeader) {
                occurrenceIndex++;
              }
            }

            let currentOccurrence = 0;
            for (let i = blockStart; i <= blockEnd; i++) {
              if (String(detailHeaders[i] || "").trim().toLowerCase() === targetHeader) {
                if (currentOccurrence === occurrenceIndex) {
                  return (row[i] || "").toString().trim();
                }
                currentOccurrence++;
              }
            }
          }

          // 🎯 Strategy 2: Relative Offset (Fallback)
          if (originalIdx >= firstAnchor) {
             const offset = originalIdx - firstAnchor;
             const relativeIdx = blockStart + offset;
             if (relativeIdx < row.length) {
               return (row[relativeIdx] || "").toString().trim();
             }
          } else {
             return (row[originalIdx] || "").toString().trim();
          }
          return "";
        };

        let rDate = getMappedValueInBlock('date');
        let rTime = getMappedValueInBlock('time');
        let rLocation = getMappedValueInBlock('location');
        let rPerson = getMappedValueInBlock('person');
        let rTask = getMappedValueInBlock('task');
        
        const fieldKeywords: Record<string, string[]> = {
          date: ['ngày', 'date'],
          time: ['slot', 'giờ', 'time'],
          location: ['phòng', 'room', 'location'],
          person: ['reviewer', 'giảng viên', 'cán bộ', 'họ tên'],
          task: ['nhiệm vụ', 'đề tài', 'task', 'code', 'tiêu đề']
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

          if (!rDate) rDate = autoInferList('date')[0] || "";
          if (!rTime) rTime = autoInferList('time')[0] || "";
          if (!rLocation) rLocation = autoInferList('location')[0] || "";
          if (!rTask) rTask = autoInferList('task')[0] || "";
          
          if (!rPerson) {
             const persons = autoInferList('person');
             rPerson = persons[0] || "";
          }

          // 🚀 2. ROBUSTNESS FIX: Strictly skip any block that is actually empty.
          // This now applies to ALL blocks (1, 2, and 3) to ensure total accuracy.
          const hasAnyDataInBlock = rPerson || rDate || rTime || rLocation || (row[blockStart] && row[blockStart].trim().length > 0);
          
          if (!hasAnyDataInBlock) {
             console.log(`[Grouping] Skipping Empty Block ${blockIdx} row ${rowIndex}`);
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
            
            const reviewersFromInference = autoInferList('person');
            const finalReviewers = reviewersFromInference.slice(0, 2); // 🎯 Only take Reviewer 1 & 2
            
            const eventId = `${generateRowId(sheetId, tab, rowIndex + headerRowIndex + 1)}-b${blockIdx}`;
            console.log(`[Grouping] Row ${rowIndex} Block ${blockIdx} -> ID: ${eventId}, Date: ${finalDate}, Reviewers: ${finalReviewers.join(', ')}`);

            allEvents.push({
              id: eventId,
              groupName: `Review ${blockIdx + 1}`,
              person: finalReviewers[0] || rPerson || rTask || baseTask,
              reviewers: finalReviewers, // 🚀 PRECISE NAMES
              date: finalDate,
              startTime: start,
              endTime: end,
              task: rTask || baseTask,
              location: rLocation || "Chưa xác định",
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

    return allEvents;
  }
}

export const googleService = new GoogleSyncService();