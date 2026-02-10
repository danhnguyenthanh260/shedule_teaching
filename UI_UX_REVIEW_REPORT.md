# Đánh giá UI/UX: Quy trình Tạo Lịch Giảng Dạy

**Vai trò: Frontend Developer**
**Mục tiêu: Tối ưu hóa luồng tương tác và nâng cao tính thẩm mỹ chuyên nghiệp.**

## 1. Phân tích Luồng Người dùng (User Flow) Hiện tại
Quy trình hiện tại chia làm 3 bước chính:
1.  **Bước 1 (ExcelImport)**: Chọn học kỳ -> Hệ thống tự động tải dữ liệu từ Google Sheets.
2.  **Bước 2 (MappingTool)**: Người dùng kiểm tra các cột ánh xạ -> Nhấn "ÁP DỤNG".
3.  **Bước 3 (ScheduleTable)**: Xem danh sách đã normalize -> Chọn các mục -> Nhấn "ĐỒNG BỘ".

### Điểm nghẽn UX (Friction Points):
- **Thừa thao tác**: Sau khi Bước 1 tự động tải xong, người dùng vẫn phải di chuột xuống Bước 2 để nhấn "ÁP DỤNG". Với các sheet chuẩn, bước này nên được tự động hóa.
- **Thiếu phản hồi thị giác**: Khi nhấn "ÁP DỤNG", bảng dữ liệu hiện ra đột ngột, thiếu các hiệu ứng chuyển cảnh (transitions) giúp người dùng nhận biết sự thay đổi.
- **Mobile Experience**: Bảng dữ liệu quá rộng gây khó khăn khi thao tác trên điện thoại (phải cuộn ngang rất nhiều).

## 2. Đề xuất Cải tiến Giao diện (UI Improvements)

### A. Giao diện "Glassmorphism" Hiện đại
Thay vì sử dụng quá nhiều đường kẻ (borders), hãy sử dụng sự phân tách bằng đổ bóng (soft shadows) và độ mờ (opacity) để tạo cảm giác nhẹ nhàng, cao cấp.

### B. Smart Auto-Apply
- **Cải tiến**: Nếu `googleService` nhận diện được schema với độ tin cậy cao (`confidence > 0.8`), hệ thống sẽ tự động thực hiện lệnh "ÁP DỤNG" và cuộn người dùng xuống bảng dữ liệu.
- **Lợi ích**: Giảm 1 lần click chuột cho 90% trường hợp sử dụng.

### C. Responsive Card View cho Mobile
Trên màn hình nhỏ (width < 768px), thay vì dùng `<table>`, hãy chuyển sang dạng danh sách Card.
```markdown
[ Header: PRJ301 - Slot 1 ]
📍 Phòng: 101 | 📅 27/01/2026
👤 GV: Nguyễn Văn A
[ Checkbox ]
```

## 3. Danh sách các thay đổi kỹ thuật (Technical Checklist)

- [ ] **Framer Motion**: Thêm `AnimatePresence` để các dòng trong bảng xuất hiện mượt mà.
- [ ] **Skeleton Loaders**: Thay thế các spinner đơn giản bằng các khối màu chuyển động (Skeleton) trong lúc đợi tải Google Sheets.
- [ ] **Sticky Actions Bar**: Cố định nút "Đồng bộ" và bộ lọc ở chân trang (Bottom Bar) trên mobile để dễ dàng thao tác bằng một tay.
- [ ] **Batch Selection UI**: Thêm tính năng "Chọn tất cả sự kiện trong ngày" (Select by Date) để thao tác nhanh hơn.

## 4. Layout Mới (Phác thảo)
```
+-----------------------------------+
| [ Học kỳ: Spring 2026 ] [ Tải lại]| <-- Tinh gọn, hiện đại
+-----------------------------------+
| (i) Đã tự động nhận diện 5 cột    | <-- Thông báo thông minh
+-----------------------------------+
| [ Search... ] [ Lọc theo GV ]     | <-- Bộ lọc nổi bật
+-----------------------------------+
| [ Table / Card View ]             |
|                                   |
| [ Sticky Footer: Đã chọn 5 mục ]  | <-- Nút hành động chính
+-----------------------------------+
```

---
*Bản review này tập trung vào việc làm cho ứng dụng cảm thấy chuyên nghiệp và "thông minh" hơn đối với giảng viên.*
