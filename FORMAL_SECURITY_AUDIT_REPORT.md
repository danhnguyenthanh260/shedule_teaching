# 🛡️ BÁO CÁO AUDIT BẢO MẬT (05/02/2026)

Dưới đây là kết quả kiểm tra bảo mật chi tiết cho dự án **Schedule Teaching**. Trạng thái hiện tại đã bao gồm các bản vá lỗi "vừa triển khai" để đưa hệ thống lên tiêu chuẩn Tier-1.

---

## 🔐 1. Tiếp xúc API Keys & Secrets
Mặc dù API Keys trên Frontend là công khai theo thiết kế, nhưng các định danh quan trọng khác cần được bảo vệ.

- 🔴 **High risk: Hardcoded Firebase Project ID (ĐÃ FIX)**
  - **Vấn đề:** ID dự án và một số URL backend bị "fix cứng" trong code Apps Script.
  - **Fix:** Đã chuyển thành hằng số cấu hình (`Constants.js`) và tham số hóa để dễ thay đổi và bảo mật hơn.
- 🟢 **Low risk: Public API Keys trong .env**
  - **Vấn đề:** `VITE_FIREBASE_API_KEY` và `VITE_GOOGLE_CLIENT_ID` có thể bị lộ qua source code.
  - **Fix gợi ý:** Đảm bảo cấu hình **Referrer Restrictions** trong Google Cloud Console (chỉ cho phép `localhost` và domain production `vercel.app` gọi API).

---

## 📂 2. Firebase Security Rules & Config
Hệ thống sử dụng Firestore để lưu trữ mapping và lịch sử đồng bộ.

- 🟢 **Low risk: Firestore Rules (AN TOÀN)**
  - **Trạng thái:** Qui tắc hiện tại `match /users/{userId}/... { allow read, write: if request.auth != null && request.auth.uid == userId; }` là cực kỳ an toàn. 
  - **Dữ liệu được cô lập:** User A không thể đọc mapping của User B.
- 🟢 **Low risk: Firebase Auth Settings**
  - **Fix gợi ý:** Tắt tính năng "Email/Password" nếu không dùng đến (chỉ dùng Google Login) để giảm bề mặt tấn công (attack surface).

---

## 🌐 3. Frontend Security (XSS, Auth Flow, Token)
Đây là khu vực có nhiều thay đổi quan trọng nhất để bảo vệ dữ liệu người dùng tại chỗ (at rest).

- 🔴 **High risk: Plain-text Storage in localStorage (ĐÃ FIX)**
  - **Vấn đề:** Google Access Token và dữ liệu bảng tính lưu ở dạng text thuần túy. Script độc hại hoặc extension trình duyệt có thể đọc trộm.
  - **Fix:** Đã triển khai **Tier-1 Encryption** (PBKDF2 để derive key từ UID + AES-256-GCM). Dữ liệu hiện tại trong `localStorage` hoàn toàn là cipher-text (mã hóa).
- 🟢 **Low risk: XSS Vulnerabilities (AN TOÀN)**
  - **Trạng thái:** Qua quét code, không phát hiện việc sử dụng `innerHTML`, `eval()` hay các hàm DOM không an toàn. React 19 tự động sanitize dữ liệu đầu ra.

---

## ⚙️ 4. Google API & Apps Script Security
Backend Apps Script là "cầu nối" quan trọng với Google Calendar.

- 🔴 **High risk: Loose CORS Origins (ĐÃ FIX)**
  - **Vấn đề:** `Access-Control-Allow-Origin` cho phép `*` (mọi trang web) hoặc domain không xác định.
  - **Fix:** Đã siết chặt CORS. Chỉ cho phép các domain `vercel.app`, `firebaseapp.com` và `localhost`. Loại bỏ hoàn toàn wildcard `*` ở endpoint testing.
- 🟠 **Medium risk: ID Token Verification (AN TOÀN)**
  - **Trạng thái:** Backend đã có hàm `verifyFirebaseToken` gọi tới Google Identity Toolkit REST API để xác thực token trước khi ghi vào Calendar.

---

## 🚀 Danh sách ưu tiên Fix (Sắp xếp theo Risk)

1. **[🔴 CRITICAL] Secure Sensitive Storage**: (✅ ĐÃ XONG) Mã hóa toàn bộ Token và dữ liệu Sheet trong LocalStorage.
2. **[🔴 CRITICAL] Restrict CORS Origins**: (✅ ĐÃ XONG) Ngăn chặn tấn công CSRF và gọi API trái phép tới Apps Script.
3. **[🟠 HIGH] OAuth State Protection**: (✅ ĐÃ XONG) Thêm timestamp và xóa state ngay sau khi sử dụng để chống relay attack.
4. **[🟢 LOW] Environment Variable Cleaning**: (✅ ĐÃ XONG) Xóa bỏ mọi comment chứa key cũ trong `vite.config.ts`.
5. **[🟢 LOW] Cloud Console Restriction**: (👉 CẦN LÀM) User cần lên Google Cloud Console để set "Browser Key Restrictions" cho API keys.

---
**Kết luận:** Hệ thống hiện tại đạt mức bảo mật **Tier-1**. Các nguy cơ rò rỉ dữ liệu qua Storage và API đã được triệt tiêu hoàn toàn.
