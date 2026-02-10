# Báo cáo Hiệu năng React: Schedule UI

**Vai trò: React Performance Specialist**
**Trạng thái: Cần Tối Ưu**

Sau khi phân tích quy trình render và quản lý state của `LecturerDashboard`, tôi đã xác định các rủi ro sau:

## 1. Rủi ro Re-render dây chuyền (Render Cascades)
- **Vấn đề**: `selectedIds` được quản lý tại component cha (`LecturerDashboard`). Mỗi khi người dùng tick chọn 1 dòng, toàn bộ Dashboard và tất cả các component con (`ExcelImport`, `MappingTool`, `ScheduleTable`) đều re-render.
- **Bằng chứng**: `ScheduleTable` hiện không được bao bọc trong `React.memo` và nhận các hàm inline (`onToggleSelect`).
- **Hệ quả**: Giật (lag) khi chọn nhiều mục liên tiếp trong một bảng dữ liệu lớn.

## 2. Nút thắt cổ chai tại Component Bảng (Table Bottlenecks)
- **Vấn đề**: `ScheduleTable.tsx` render trực tiếp `rows.map`. Với bảng lịch học thường có hàng trăm dòng, mỗi dòng chứa nhiều SVG và logic xử lý chuỗi, tổng số lượng DOM nodes tăng vọt.
- **Hệ quả**: Tăng thời gian "Commit" của React, gây trễ khi người dùng lọc (filter) hoặc cuộn trang.

## 3. Tính toán lặp lại trong Render (Expensive Calculations)
- **Vấn đề**: Hàm `khongDau` được gọi bên trong loop của `filteredRows` và `updateSelections`. Việc chuẩn hóa tiếng Việt là thao tác xử lý chuỗi tốn kém nếu thực hiện hàng nghìn lần mỗi giây khi người dùng gõ phím vào ô Filter.
- **Hệ quả**: CPU spiking khi gõ phím tìm kiếm.

## Giải pháp tối ưu hóa đề xuất

### 🟢 Mức độ Ưu tiên 1 (Nhanh & Hiệu quả)
1.  **Memoize Components**: Bao bọc `ScheduleTable`, `MappingTool` trong `React.memo`.
2.  **Stable Callbacks**: Sử dụng `useCallback` cho các hàm `onToggleSelect` và `onToggleAll` để tránh phá vỡ memoization của component con.
3.  **Key Optimization**: Đảm bảo `row.id` là duy nhất và ổn định (đã làm tốt, nên giữ nguyên).

### 🟡 Mức độ Ưu tiên 2 (Cải thiện trải nghiệm)
1.  **Computed Caching**: Lưu trữ kết quả `khongDau` ngay trong object `RowNormalized` khi dữ liệu vừa được load xong, thay vì tính toán lại mỗi lần filter.
2.  **Debounced Filtering**: Sử dụng `debounce` (300ms) cho ô nhập tên giảng viên để không thực hiện filter quá dày đặc khi người dùng đang gõ.

### 🔴 Mức độ Ưu tiên 3 (Dữ liệu cực lớn)
1.  **Virtualization**: Sử dụng thư viện như `@tanstack/react-virtual` cho `ScheduleTable`. Chỉ render những dòng đang hiển thị trong tầm mắt (viewport). Điều này sẽ giúp bảng chạy mượt mà kể cả với 1000+ dòng.

---
*Bản phân tích này giúp bạn chuẩn bị cho việc mở rộng hệ thống khi số lượng giảng viên và lớp học tăng lên trong tương lai.*
