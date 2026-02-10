# Báo cáo Debug: Ngày, Giờ & Xung đột Lịch

**Vai trò: Debugger**
**Đối tượng: Hệ thống Parsing & Sync**

Sau khi quét toàn bộ mã nguồn, tôi đã phát hiện các lỗi tiềm ẩn (Potential Bugs) và lỗ hổng logic sau đây:

## 1. Lỗi Logic "Năm mặc định" (Year Fallback Bug)
- **Vị trí**: `src/utils/dateTimeParser.ts` -> hàm `parseDate`.
- **Nguyên nhân**: Sử dụng `parse(strValue, fmt, new Date())` từ thư viện `date-fns`. 
- **Hệ quả**: Nếu một file Excel cũ chỉ ghi ngày "27/01" (không có năm), hệ thống sẽ tự động gán năm hiện tại (2026). Khi giảng viên xem lại dữ liệu năm ngoái (2025), lịch sẽ bị đẩy sai sang năm 2026.
- **Mức độ**: 🟠 Trung bình (Dễ gây nhầm lẫn).

## 2. Rủi ro Múi giờ cứng (Hardcoded Timezone Risk)
- **Vị trí**: `src/utils/dateTimeParser.ts` -> `toVNISOString` và `src/services/googleService.ts` -> `parseVNTime`.
- **Nguyên nhân**: Đang gán cứng `+07:00` vào sau chuỗi thời gian.
- **Hệ quả**: Nếu người dùng đang ở khu vực khác hoặc settings của Google Calendar không khớp với hệ thống, thời gian có thể bị lệch 1-2 tiếng khi đồng bộ. Ngoài ra, việc dùng `new Date()` trong Apps Script mà không ép múi giờ cũng là một rủi ro.
- **Mức độ**: 🟠 Trung bình (Rủi ro lệch múi giờ).

## 3. Lỗ hổng "Trùng tài nguyên" (Resource Overlap Vulnerability)
- **Vị trí**: `appsscript/src/CalendarService.js` -> hàm `createEvent`.
- **Nguyên nhân**: Hệ thống chỉ kiểm tra `signature` để chống trùng lặp (duplication) chứ KHÔNG kiểm tra xung đột (conflict).
- **Hệ quả**: 
    - Một giảng viên có thể bị gán dạy ở 2 phòng khác nhau cùng một giờ.
    - Một phòng học có thể có 2 lớp học cùng lúc mà hệ thống không cảnh báo.
- **Bằng chứng**: Logic hiện tại chỉ skip nếu `signature` khớp nhau hoàn toàn, ngược lại nó sẽ luôn tạo Event mới.
- **Mức độ**: 🔴 Nghiêm trọng (Gây xung đột lịch giảng dạy).

## 4. Rủi ro về "Dấu vân tay sự kiện" (Signature Collision)
- **Vị trí**: `src/utils/eventSignature.ts`.
- **Nguyên nhân**: Chỉ hash dựa trên `title`, `date`, `time`, `location`.
- **Hệ quả**: Nếu 2 sự kiện có cùng tiêu đề, giờ, phòng nhưng khác mô tả (Description) hoặc danh sách khách mời (Guests), hệ thống sẽ coi là trùng và bỏ qua sự kiện thứ 2.
- **Mức độ**: 🟡 Thấp (Tùy thuộc vào cách đặt tiêu đề).

## Khuyến nghị Fix ngắn hạn:
1.  **Year Fix**: Kiểm tra xem file gốc có năm không, nếu không có nên hỏi người dùng hoặc lấy năm từ `metadata` của Sheet thay vì mặc định `new Date()`.
2.  **Overlap Logic**: Cần tích hợp bước kiểm tra sự kiện trong khoảng thời gian `[Start, End]` cho từng `resource` trước khi insert.
3.  **Validation**: Thêm bước check `startTime < endTime` để tránh tạo các sự kiện có độ dài âm hoặc bằng 0.

---
*Báo cáo được tạo tự động bởi Agent Debugger.*
