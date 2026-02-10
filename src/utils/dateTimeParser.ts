import { format, parse, isValid } from 'date-fns';
import { DateFormat } from '../types';

export interface TimeSlot {
  slot: number;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  display: string;   // "7:00 - 9:15"
}

export interface ParsedDateTime {
  date?: Date;
  dateString?: string;  // "2026-01-27"
  timeSlot?: TimeSlot;
  rawValue: string;
  type: 'date' | 'time-slot' | 'time-range' | 'unknown';
}

/**
 * Định nghĩa các slot chuẩn
 */
const STANDARD_SLOTS: TimeSlot[] = [
  { slot: 1, startTime: '07:00', endTime: '09:15', display: '07:00 - 09:15' },
  { slot: 2, startTime: '09:30', endTime: '11:45', display: '09:30 - 11:45' },
  { slot: 3, startTime: '12:30', endTime: '14:45', display: '12:30 - 14:45' },
  { slot: 4, startTime: '15:00', endTime: '17:15', display: '15:00 - 17:15' }
];

/**
 * Parse ngày tháng với nhiều format khác nhau
 */
export function parseDate(value: any, preferredFormat?: DateFormat): Date | null {
  if (!value) return null;

  // Nếu đã là Date object
  if (value instanceof Date && isValid(value)) {
    console.log(`📅 parseDate: Received Date object: ${value.toISOString()} (Local: ${value.toLocaleString('vi-VN')})`);
    return value;
  }

  const strValue = String(value).trim();

  // Tránh parse các số đơn lẻ (thường là slot) thành ngày tháng
  if (strValue.length <= 2 && !isNaN(parseInt(strValue))) {
    return null;
  }

  // Excel serial date number (ví dụ: 44927 = 2023-01-01)
  // ⚠️ Excel dates are stored as days since 1900-01-01
  if (typeof value === 'number' && value > 40000 && value < 60000) {
    // Excel epoch: 1900-01-01 (but Excel incorrectly treats 1900 as a leap year)
    // Unix epoch offset: 25569 days (from 1900-01-01 to 1970-01-01)
    const unixTimestamp = (value - 25569) * 86400 * 1000;
    const date = new Date(unixTimestamp);

    // ✅ Use UTC methods to avoid timezone offset issues
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const correctedDate = new Date(year, month, day); // Create date in local timezone

    console.log(`📅 parseDate: Excel serial ${value} → ${correctedDate.toISOString()} (${correctedDate.toLocaleDateString('vi-VN')})`);
    if (isValid(correctedDate)) return correctedDate;
  }

  // ✅ Các format date thường gặp - ƯU TIÊN FORMAT VIỆT NAM
  let dateFormats: string[] = [
    'dd/MM/yyyy',    // 27/01/2026 (VN) - Ưu tiên cao nhất
    'd/M/yyyy',      // 27/1/2026 (VN) - Ưu tiên cao
    'dd-MM-yyyy',    // 27-01-2026 (VN)
    'd-M-yyyy',      // 27-1-2026 (VN)
    'MM/dd/yyyy',    // 01/27/2026 (US)
    'M/d/yyyy',      // 1/27/2026 (US)
    'yyyy-MM-dd',    // 2026-01-27 (ISO)
    'yyyy/MM/dd',    // 2026/01/27 (ISO)
    'M-d-yyyy',      // 1-27-2026 (US)
  ];

  // Nếu người dùng có format ưu tiên, đẩy lên đầu danh sách
  if (preferredFormat) {
    dateFormats = [preferredFormat, ...dateFormats.filter(f => f !== preferredFormat)];
    console.log(`📅 parseDate: Using preferred format "${preferredFormat}" first`);
  }

  for (const fmt of dateFormats) {
    try {
      // 🚨 QUAN TRỌNG: parse của date-fns có thể trả về ngày "hợp lệ" nhưng sai logic 
      // nếu format không khớp tuyệt đối (ví dụ parse 1/27/2026 với dd/MM/yyyy)
      const parsed = parse(strValue, fmt, new Date());
      
      if (isValid(parsed)) {
        // Kiểm tra xem chuỗi đã parse có format lại giống y hệt chuỗi gốc không
        // Điều này đảm bảo format khớp hoàn toàn chứ không phải parse "gượng ép"
        const formattedBack = format(parsed, fmt);
        
        // So sánh chuỗi (lược bỏ các số 0 ở đầu để linh hoạt 1/1 vs 01/01)
        const normalize = (s: string) => s.replace(/\/0/g, '/').replace(/-0/g, '-').replace(/^0/, '');
        
        if (normalize(formattedBack) === normalize(strValue)) {
          console.log(`📅 parseDate: "${strValue}" MATCHED format "${fmt}" → ${parsed.toISOString()}`);
          return parsed;
        }
      }
    } catch {
      continue;
    }
  }

  // Thử parse ISO string
  try {
    const isoDate = new Date(strValue);
    if (isValid(isoDate)) return isoDate;
  } catch { }

  return null;
}

/**
 * Parse slot number (1, 2, 3, 4 hoặc text "Slot 1", "slot1", etc.)
 */
export function parseSlotNumber(value: any): TimeSlot | null {
  if (!value) return null;

  const strValue = String(value).trim().toLowerCase();

  // Nếu là số thuần túy từ 1-6 (🚨 Chỉ chấp nhận nếu TOÀN BỘ chuỗi là 1 chữ số từ 1-6)
  if (/^[1-6]$/.test(strValue)) {
    const numValue = parseInt(strValue);
    return STANDARD_SLOTS[numValue - 1];
  }

  // Nếu có text "slot" kèm theo
  const slotMatch = strValue.match(/slot\s*(\d+)/i);
  if (slotMatch) {
    const slotNum = parseInt(slotMatch[1]);
    if (slotNum >= 1 && slotNum <= 6) {
      return STANDARD_SLOTS[slotNum - 1];
    }
  }

  // Kiểm tra các tên slot khác: "slot1", "s1", "slot_1"
  const altMatch = strValue.match(/s(?:lot)?[\s_-]*(\d+)/i);
  if (altMatch) {
    const slotNum = parseInt(altMatch[1]);
    if (slotNum >= 1 && slotNum <= 6) {
      return STANDARD_SLOTS[slotNum - 1];
    }
  }

  return null;
}

/**
 * Parse time range (13h00-14h30, 13:00-14:30, 1:00 PM - 2:30 PM, etc.)
 */
export function parseTimeRange(value: any): TimeSlot | null {
  if (!value) return null;

  const strValue = String(value).trim();

  // Các patterns cho time range
  const patterns = [
    // 13h00-14h30, 13h00 - 14h30
    /(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})/,
    // 13:00-14:30, 13:00 - 14:30
    /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
    // 1:00PM-2:30PM, 1:00 PM - 2:30 PM
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i,
    // 13h-14h30
    /(\d{1,2})h\s*-\s*(\d{1,2})h(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = strValue.match(pattern);
    if (match) {
      let startHour = parseInt(match[1]);
      let startMin = parseInt(match[2]) || 0;
      let endHour: number;
      let endMin: number;

      if (match.length === 5) {
        // Pattern 1 & 2
        endHour = parseInt(match[3]);
        endMin = parseInt(match[4]);
      } else if (match.length === 7) {
        // Pattern 3 (AM/PM)
        const startPeriod = match[3].toUpperCase();
        endHour = parseInt(match[4]);
        endMin = parseInt(match[5]);
        const endPeriod = match[6].toUpperCase();

        if (startPeriod === 'PM' && startHour !== 12) startHour += 12;
        if (startPeriod === 'AM' && startHour === 12) startHour = 0;
        if (endPeriod === 'PM' && endHour !== 12) endHour += 12;
        if (endPeriod === 'AM' && endHour === 12) endHour = 0;
      } else {
        // Pattern 4
        endHour = parseInt(match[2]);
        endMin = parseInt(match[3]);
      }

      const startTime = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

      // Kiểm tra xem có match với slot chuẩn không
      const matchedSlot = STANDARD_SLOTS.find(
        slot => slot.startTime === startTime && slot.endTime === endTime
      );

      if (matchedSlot) {
        return matchedSlot;
      }

      // Tạo custom slot
      return {
        slot: 0, // Custom slot
        startTime,
        endTime,
        display: `${startTime} - ${endTime}`
      };
    }
  }

  return null;
}

/**
 * Hàm chính để parse bất kỳ giá trị datetime nào
 */
export function parseDateTime(value: any, preferredFormat?: DateFormat): ParsedDateTime {
  if (!value || value === '') {
    return {
      rawValue: '',
      type: 'unknown'
    };
  }

  const rawValue = String(value).trim();

  // 1. Thử parse slot number trước (ưu tiên vì slot thường là số ngắn dễ bị parse nhầm)
  const slotNum = parseSlotNumber(value);
  if (slotNum) {
    return {
      timeSlot: slotNum,
      rawValue,
      type: 'time-slot'
    };
  }

  // 2. Thử parse time range
  const timeRange = parseTimeRange(value);
  if (timeRange) {
    return {
      timeSlot: timeRange,
      rawValue,
      type: 'time-range'
    };
  }

  // 3. Thử parse date
  const date = parseDate(value, preferredFormat);
  if (date) {
    return {
      date,
      dateString: format(date, 'yyyy-MM-dd'),
      rawValue,
      type: 'date'
    };
  }

  // Không nhận diện được
  return {
    rawValue,
    type: 'unknown'
  };
}

/**
 * Format lại datetime theo format chuẩn
 */
export function formatDateTime(parsed: ParsedDateTime): string {
  switch (parsed.type) {
    case 'date':
      return parsed.dateString || '';
    case 'time-slot':
      return parsed.timeSlot
        ? `Slot ${parsed.timeSlot.slot} (${parsed.timeSlot.display})`
        : '';
    case 'time-range':
      return parsed.timeSlot?.display || '';
    default:
      return parsed.rawValue;
  }
}

/**
 * Kiểm tra và chuẩn hóa toàn bộ data
 */
export function normalizeDataDateTime(
  data: Record<string, any>[],
  dateColumns: string[] = ['Date', 'date', 'Ngày'],
  timeColumns: string[] = ['Slot', 'Time', 'Giờ', 'Slot Code'],
  preferredFormat?: DateFormat
): Record<string, any>[] {
  return data.map(row => {
    const normalized: Record<string, any> = { ...row };

    // Normalize date columns
    dateColumns.forEach(col => {
      if (row[col]) {
        const parsed = parseDateTime(row[col], preferredFormat);
        if (parsed.type === 'date') {
          normalized[col] = parsed.dateString;
          normalized[`${col}_formatted`] = format(parsed.date!, 'dd/MM/yyyy');
        }
      }
    });

    // Normalize time columns
    timeColumns.forEach(col => {
      if (row[col]) {
        const parsed = parseDateTime(row[col]);
        if (parsed.type === 'time-slot' || parsed.type === 'time-range') {
          normalized[col] = parsed.timeSlot?.display;
          normalized[`${col}_start`] = parsed.timeSlot?.startTime;
          normalized[`${col}_end`] = parsed.timeSlot?.endTime;
          if (parsed.timeSlot?.slot) {
            normalized[`${col}_number`] = parsed.timeSlot.slot;
          }
        }
      }
    });

    return normalized;
  });
}

/**
 * Chuyển đổi Date object thành ISO string với múi giờ Việt Nam (+07:00)
 * Giữ nguyên giờ/phút/giây của Date object nhưng gán offset +07:00
 * @param date Date object
 * @returns ISO string with +07:00 offset (e.g., 2023-01-01T07:00:00+07:00)
 */
export function toVNISOString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
}
