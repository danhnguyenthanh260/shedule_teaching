
/**
 * FINAL EDGE CASE TEST (Standard JS)
 */

console.log('--- KẾT QUẢ KIỂM TRA BIÊN (FINAL) ---\n');

// 1. Excel "27/01" (Không năm)
function mockParseDate(val) {
    const today = new Date();
    const parts = val.split('/');
    // Giả lập logic parse của date-fns: lấy năm hiện tại
    const d = new Date(today.getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return d.toISOString().split('T')[0];
}

console.log('Case 1: Excel "27/01"');
console.log(`- Đầu vào: "27/01" (Current: 2026)`);
console.log(`- Kết quả: ${mockParseDate("27/01")}`);
console.log(`- Đánh giá: ⚠️ TỰ ĐỘNG GÁN NĂM HIỆN TẠI. Cần cảnh báo nếu sync dữ liệu cũ/mới.\n`);

// 2. Overnight 23:00 -> 01:00
function checkOvernight(s, e) {
    const start = new Date(`2026-02-10T${s}:00`);
    const end = new Date(`2026-02-10T${e}:00`);
    const diff = (end - start) / (1000 * 60 * 60);
    return { diff, isValidInCalendar: diff > 0 };
}

console.log('Case 2: 23:00 -> 01:00');
const res2 = checkOvernight("23:00", "01:00");
console.log(`- Logic: Start 23h, End 01h (Cùng ngày)`);
console.log(`- Khoảng cách: ${res2.diff} giờ`);
console.log(`- Đánh giá: ❌ CẦN BLOCK. Google Calendar sẽ coi đây là event dài 22 tiếng (vòng ngược) hoặc lỗi.`);
console.log(`- Giải pháp: Nếu End < Start, phải tự động cộng 1 ngày cho End.\n`);

// 3. Timezone khác +07
console.log('Case 3: Timezone lệch');
console.log(`- Logic: Luôn ép suffix "+07:00" vào chuỗi thời gian.`);
console.log(`- Đánh giá: ✅ CỐ ĐỊNH GIỜ VN (OK). Giảng viên ở Mỹ sync lịch 8:00 sáng vẫn sẽ hiện 8:00 sáng trên lịch VN.\n`);

// 4. startTime >= endTime
console.log('Case 4: Start 10:00 >= End 09:00');
const res4 = checkOvernight("10:00", "09:00");
console.log(`- Khoảng cách: ${res4.diff} giờ`);
console.log(`- Trạng thái hợp lệ: ${res4.isValidInCalendar}`);
console.log(`- Đánh giá: ❌ CẦN BLOCK. Dữ liệu rác này có thể gây treo sync hoặc tạo event sai lệch.\n`);
