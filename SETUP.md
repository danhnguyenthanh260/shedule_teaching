
# Hướng dẫn thiết lập Google API cho FPTU Schedule Sync

Để ứng dụng có thể đọc Sheet và ghi Calendar, bạn cần thực hiện các bước sau trên Google Cloud Console:

## 1. Tạo dự án trên Google Cloud
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một dự án mới (ví dụ: `FPTU-Calendar-Sync`).

## 2. Bật các API cần thiết
Tìm kiếm và bật (Enable) các API sau:
- **Google Sheets API**: Để đọc dữ liệu từ file Excel/Sheet.
- **Google Calendar API**: Để tạo và sửa các sự kiện trên lịch.

## 3. Cấu hình Màn hình đồng ý OAuth (OAuth Consent Screen)
1. Chọn **External** (nếu dùng gmail cá nhân) hoặc **Internal** (nếu dùng tổ chức FPT).
2. Điền thông tin ứng dụng (App Name, User support email).
3. **Thêm Scopes**: Rất quan trọng, hãy thêm các scope sau:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
4. Thêm email test của bạn vào phần **Test users**.

## 4. Tạo Credentials (OAuth 2.0 Client ID)
1. Vào mục **Credentials** -> **Create Credentials** -> **OAuth client ID**.
2. Chọn **Web application**.
3. **Authorized JavaScript origins**: Thêm URL bạn đang chạy (ví dụ: `http://localhost:3000` hoặc URL deploy).
4. Lưu lại **Client ID** và dán vào file `.env`.

## 5. Lưu ý về Quyền truy cập Sheet
- File Google Sheet bạn muốn import phải được chia sẻ quyền "Xem" (Viewer) cho tài khoản bạn dùng để đăng nhập, hoặc bạn là chủ sở hữu file đó.
