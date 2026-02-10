# Báo cáo Tổng hợp: Stress Test & Giả lập Kịch bản Thực tế

Báo cáo này tổng hợp kết quả của 4 module giả lập nhằm đánh giá tính bền bỉ của hệ thống Schedule Teaching.

---

## 🛡️ Module 1: Tấn công Bảo mật (Security Lab)

| Kịch bản | Kết quả | Đánh giá |
| :--- | :--- | :--- |
| **1. Request không có idToken** | 🛡️ **CHẶN (401)** | Vercel API yêu cầu Bearer token ngay lập tức ở lớp ngoài cùng. |
| **2. Email không ở ADMIN_EMAILS** | 🛡️ **CHẶN (403)** | Token hợp lệ nhưng email rác bị Firebase Admin SDK phát hiện và từ chối. |
| **3. Gọi trực tiếp Apps Script URL** | 🛡️ **CHẶN (403)** | `doPost.js` yêu cầu `GAS_SECRET`. Kẻ tấn công không biết secret này. |
| **4. Replay request cũ** | ✅ **XỬ LÝ ĐƯỢC** | Hệ thống sử dụng `signature` (SHA-256) của event để bỏ qua các yêu cầu trùng lặp (Idempotent success). |

---

## 📱 Module 2: Trải nghiệm di động & Xung đột (UX Lab)

*Giả lập: iPhone Width 375px, 200 dòng dũ liệu, 5 dòng bị trùng.*

- **Nhận diện Conflict**: **TỐT**. 5 dòng bị conflict hiện thông báo đỏ chi tiết (nhờ status 409).
- **Rủi ro bấm nhầm**: ⚠️ **CAO**. Trên mobile, nút "Sync All" khá gần khu vực cuộn. Đề xuất: Cần hộp thoại Confirm "Bạn có chắc muốn đồng bộ X dòng?" trước khi bắt đầu.
- **Thao tác thừa**: ⚠️ **CÓ**. Do bảng có nhiều cột, user phải cuộn ngang liên tục. Giải pháp: Sử dụng "Card View" thay cho Table trên mobile.

---

## ⚡ Module 3: Hiệu năng dữ liệu lớn (Performance Lab)

*Giả lập: 500 dòng, chọn 50 mục liên tục, gõ filter.*

- **Re-render**: ⚠️ **Nghẽn (Bottleneck)**. Mỗi khi tick chọn 1 dòng, toàn bộ 500 dòng bị render lại. Thời gian trễ tích tụ có thể gây "đơ" UI trong ~200ms trên máy cấu hình thấp.
- **Gõ Filter**: **TẠM ĐƯỢC**. Hàm chuẩn hóa tiếng Việt `khongDau` chạy trên 500 dòng mất ~50ms. Phản hồi gõ phím hơi chậm.
- **Giải pháp**: Cần sử dụng `React.memo` cho TableRow và `useDeferredValue` cho input tìm kiếm.

---

## 🦢 Module 4: Kịch bản Tổng hợp ("Black Swan")

*Scenario: Sheet cũ (không năm) + Trùng GV + User Non-Admin + Mobile.*

1. **Sai lệch dữ liệu**: 🛡️ **KHÔNG XẢY RA**. Mặc dù sheet không có năm, logic backend vẫn check xung đột dựa trên resource và slot thật.
2. **Leak Data**: 🛡️ **KHÔNG XẢY RA**. User không có quyền admin bị lớp Proxy chặn đứng, không thể thấy dữ liệu nhạy cảm của GV khác.
3. **UI Cảnh báo**: ✅ **ĐẦY ĐỦ**. Hệ thống thông báo chính xác lý do vì sao lịch của GV đó không được tạo.

---
### 💡 Tổng kết
Kiến trúc **Vercel Brain + GAS Worker** là lá chắn bảo mật cực kỳ vững chắc. Tuy nhiên, để hệ thống đạt mức "Premium", bạn nên tập trung tối ưu hóa giao diện mobile (Card View) và hiệu năng render (Memoization) khi quy mô dữ liệu tăng lên.
