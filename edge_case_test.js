
/**
 * SIMULATION: Edge Case Logic Analysis
 */

const { parse, format } = require('date-fns');

// Giả lập logic dự án hiện tại
function parseDateProjectLogic(value) {
    // Logic trong dateTimeParser.ts: parse(value, 'dd/MM', new Date())
    try {
        const referenceDate = new Date(); // 2026-02-06
        const parsed = parse(value, 'dd/MM', referenceDate);
        return format(parsed, 'yyyy-MM-dd');
    } catch (e) {
        return 'ERR';
    }
}

function processOvernightLogic(startStr, endStr) {
    // Logic thường gặp: Nếu end < start, giả định là qua ngày hôm sau
    let start = new Date(`2026-02-10T${startStr}:00`);
    let end = new Date(`2026-02-10T${endStr}:00`);
    
    let isOvernight = false;
    if (end <= start) {
        end.setDate(end.getDate() + 1);
        isOvernight = true;
    }
    return { start: start.toISOString(), end: end.toISOString(), isOvernight };
}

function checkInvalidTimeRange(startISO, endISO) {
    const s = new Date(startISO);
    const e = new Date(endISO);
    return s >= e; // TRUE nếu bị lỗi (bắt đầu sau khi kết thúc)
}

console.log('--- PHÂN TÍCH TRƯỜNG HỢP BIÊN ---\n');

// 1. Excel chỉ có "27/01"
const case1 = "27/01";
console.log(`1. Dữ liệu: "${case1}" (Mặc định current year)`);
console.log(`   Kết quả parse: ${parseDateProjectLogic(case1)}`);
console.log(`   Rủi ro: Nếu đang là tháng 12/2025 mà sync "27/01" (ý là 2026), nó sẽ gán thành 27/01/2025.\n`);

// 2. Slot 23:00 -> 01:00 hôm sau
const case2 = { s: "23:00", e: "01:00" };
const res2 = processOvernightLogic(case2.s, case2.e);
console.log(`2. Slot xuyên đêm: ${case2.s} -> ${case2.e}`);
console.log(`   Start: ${res2.start}`);
console.log(`   End:   ${res2.end}`);
console.log(`   Xử lý: ${res2.isOvernight ? 'Đã tự động cộng 1 ngày (OK)' : 'Chưa xử lý (LỖI)'}\n`);

// 3. Timezone khác +07 (User ở US -05:00)
console.log(`3. Timezone: User ở US (-05:00), Server +07:00`);
const userDate = "2026-02-10T08:00:00"; // Local user
const forcedSync = userDate + "+07:00"; // Logic useSheetLogic.ts đang dùng
console.log(`   Logic: Luôn ép đuôi +07:00 vào string.`);
console.log(`   Kết quả: ${forcedSync}`);
console.log(`   Phân tích: Nếu user nhập 08:00 (giờ Mỹ), hệ thống vẫn ép thành 08:00 (giờ VN). 
              -> Đảm bảo lịch Google luôn là giờ VN bất kể user ngồi đâu (OK cho business này).\n`);

// 4. startTime >= endTime
const case4 = { s: "10:00", e: "09:00" }; // Lỗi nhập
const res4 = processOvernightLogic(case4.s, case4.e); // Overnight logic sẽ biến nó thành 10:00 hôm nay -> 09:00 hôm sau
console.log(`4. startTime >= endTime: ${case4.s} -> ${case4.e}`);
if (checkInvalidTimeRange(res4.start, res4.end)) {
    console.log(`   Trạng thái: ❌ LỖI LOGIC (Start >= End)`);
} else {
    console.log(`   Trạng thái: ⚠️ CẢNH BÁO. Logic xuyên đêm đã biến nó thành 23 tiếng đồng hồ (từ ${case4.s} hôm nay đến ${case4.e} hôm sau).`);
}
console.log(`   Cần Block: Có, cần validate độ dài slot không quá N tiếng (ví dụ 5 tiếng).\n`);
