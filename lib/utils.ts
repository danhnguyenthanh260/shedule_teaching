/**
 * Danh sách khung giờ Slot cố định của trường.
 */
const SLOT_TIME_RANGES: Record<number, string> = {
  1: '07:00-09:15',
  2: '09:30-11:45',
  3: '12:30-14:45',
  4: '15:00-17:15',
  5: '17:30-19:45'
};

/**
 * Hàm hỗ trợ parse các định dạng giờ như "13h30", "13:30", "7h", "7"
 */
const parseTimePart = (t: string) => {
  if (!t) return { h: 0, m: 0 };
  const cleanT = t.toLowerCase().trim();

  // Định dạng HH:mm
  if (cleanT.includes(':')) {
    const [hh, mm] = cleanT.split(':');
    return { h: parseInt(hh) || 0, m: parseInt(mm) || 0 };
  }

  // Định dạng HhMM (ví dụ 13h30, 7h)
  const hourMatch = cleanT.match(/(\d{1,2})h(\d{2})?/);
  if (hourMatch) {
    return {
      h: parseInt(hourMatch[1]) || 0,
      m: hourMatch[2] ? parseInt(hourMatch[2]) : 0
    };
  }

  // Định dạng chỉ có số giờ (ví dụ "7", "13")
  const pureHour = parseInt(cleanT);
  if (!isNaN(pureHour)) return { h: pureHour, m: 0 };

  return { h: 0, m: 0 };
};

/**
 * Parse chuỗi ngày và khung giờ thành định dạng ISO với múi giờ VN.
 * Ưu tiên giờ lẻ nếu người dùng nhập giờ, chỉ dùng SLOT_TIME_RANGES nếu nhập số Slot đơn thuần.
 */
export const parseVNTime = (dateStr: string, timeRange: string) => {
  // Chuẩn hóa dấu gạch ngang (xử lý các loại dấu gạch khác nhau từ Sheet)
  const normalizedRange = timeRange.replace(/\u2013|\u2014/g, '-').trim();

  // 1. Kiểm tra xem người dùng nhập số Slot (ví dụ "2") hay giờ lẻ ("10:30-11:30")
  const isPureSlot = /^\d+$/.test(normalizedRange);
  const mappedRange = isPureSlot ? SLOT_TIME_RANGES[parseInt(normalizedRange)] : undefined;

  // Nếu là Slot chuẩn thì lấy từ Record, nếu không thì lấy trực tiếp chuỗi từ Sheet
  const finalRange = mappedRange || normalizedRange;
  const [startStr, endStr] = finalRange.split('-').map(p => p.trim());

  const startTime = parseTimePart(startStr);
  const endTime = parseTimePart(endStr);

  // 2. Parse Ngày tháng (Hỗ trợ DD/MM/YYYY hoặc YYYY/MM/DD)
  const dateParts = dateStr.split(/[-/.]/).map(p => parseInt(p));
  let d: number, m: number, y: number;

  if (dateParts[0] > 1000) {
    [y, m, d] = dateParts; // YYYY/MM/DD
  } else {
    [d, m, y] = dateParts; // DD/MM/YYYY (Chuẩn VN)
  }

  // Tạo đối tượng Date (Tháng trong JS bắt đầu từ 0)
  const startDate = new Date(y, m - 1, d, startTime.h, startTime.m);
  const endDate = new Date(y, m - 1, d, endTime.h, endTime.m);

  // Hàm helper format ISO +07:00
  const toISOWithTimezone = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}:00+07:00`;
  };

  return {
    start: toISOWithTimezone(startDate),
    end: toISOWithTimezone(endDate),
    // Trả về thêm thông tin để logic bên ngoài biết đây có phải giờ tùy chỉnh không
    isCustomTime: !isPureSlot
  };
};

/**
 * Tạo ID duy nhất cho hàng để theo dõi trạng thái đồng bộ.
 */
export const generateRowId = (sheetId: string, tab: string, rowIdx: number, person: string): string => {
  const rawId = `${sheetId}-${tab}-${rowIdx}-${person.toLowerCase().trim()}`;
  // Sử dụng btoa an toàn cho môi trường browser
  try {
    return btoa(unescape(encodeURIComponent(rawId)));
  } catch (e) {
    return `id-${rowIdx}-${Date.now()}`;
  }
};