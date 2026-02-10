# Báo cáo Kiểm định Bảo mật: Schedule Teaching

**Vai trò: Security Auditor**
**Mức độ ưu tiên: Cao**

Tôi đã tiến hành kiểm tra mã nguồn về cơ chế xác thực (Auth), phân quyền (Authz) và các rủi ro lộ lọt dữ liệu. Dưới đây là các phát hiện quan trọng:

## 1. Các phát hiện quan trọng (Key Findings)

### 🔴 Lỗ hổng: Cơ chế CSRF bị "hỏng" (Broken CSRF Protection)
- **Mô tả**: File `csrfToken.ts` triển khai việc tạo và kiểm tra token hoàn toàn ở phía Client (localStorage).
- **Rủi ro**: Server (Vercel Proxy) hiện **KHÔNG** kiểm tra header `X-CSRF-Token`. Điều này khiến ứng dụng vẫn có nguy cơ bị tấn công Cross-Site Request Forgery nếu kẻ xấu lừa giảng viên nhấn vào một liên kết độc hại.
- **Severity**: **High**

### 🔴 Lỗ hổng: Proxy thiếu lớp xác thực đầu quy trình (Authentication Bypass at Proxy)
- **Mô tả**: Tệp `api/readSheet.ts` (Vercel Proxy) nhận mọi request và chuyển tiếp trực tiếp sang Apps Script mà không kiểm tra ID Token trước.
- **Rủi ro**: Kẻ tấn công có thể "spam" trực tiếp vào endpoint của Vercel để dò tìm hoặc làm cạn kiệt quota của Google Apps Script mà không cần đăng nhập vào hệ thống của bạn.
- **Severity**: **High**

### 🟠 Rủi ro: Điểm yếu trong Mã hóa Local (Encryption Key Weakness)
- **Mô tả**: Khóa mã hóa được dẫn xuất (derive) từ Firebase `user.uid`. 
- **Rủi ro**: Nếu ứng dụng bị tấn công XSS, kẻ xấu có thể lấy được cả `uid` và dữ liệu đã mã hóa trong `localStorage`, từ đó giải mã được Google Access Token để chiếm quyền điều khiển Lịch/Sheet của người dùng.
- **Severity**: **Medium**

### 🟢 Điểm sáng: Phân quyền Firestore & Apps Script (Authorization)
- **Nhận xét**: Quy tắc `firestore.rules` và logic trong `doPost.js` làm rất tốt việc cô lập dữ liệu theo từng User ID và kiểm tra danh sách `ALLOWED_EMAILS`. Đây là lớp phòng thủ cuối cùng rất vững chắc.

## 2. Danh sách kiểm tra bảo mật (Security Checklist)

- [x] Sử dụng HTTPS cho toàn bộ giao dịch.
- [x] Mã hóa dữ liệu nhạy cảm tại Client.
- [x] Kiểm tra danh sách Email được phép (Whitelist) tại Backend.
- [ ] Xác thực ID Token tại lớp Vercel Proxy (Chưa đạt).
- [ ] Kiểm tra CSRF tại Server-side (Chưa đạt).
- [ ] Chống tấn công Brute-force/Spam bằng Rate Limiting (Mới chỉ có ở Client - Cần thêm ở Proxy).

## 3. Khuyến nghị khắc phục (Recommended Fixes)

1.  **Vercel Proxy Auth**: Bổ sung thư viện `firebase-admin` vào API Route trên Vercel để verify `idToken` ngay khi request vừa chạm tới Proxy.
    ```typescript
    // Ví dụ tại api/readSheet.ts
    // 1. Verify Firebase ID Token
    // 2. Nếu OK -> Forward to Apps Script
    // 3. Nếu không -> 401 Unauthorized
    ```
2.  **Server-side CSRF**: Chuyển việc lưu trữ CSRF Secret sang Cookie `HttpOnly` và kiểm tra khớp nối tại Vercel Proxy.
3.  **Rate Limiting**: Triển khai Rate Limiting tại Vercel (ví dụ dùng Upstash hoặc middleware) để bảo vệ API khỏi các bot tự động.

---
*Bản kiểm định này nhấn mạnh vào việc củng cố lớp phòng thủ đầu tiên (Proxy Layer) để giảm tải và tăng cường độ tin cậy cho hệ thống.*
