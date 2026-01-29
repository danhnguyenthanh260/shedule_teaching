# 📋 Hướng Dẫn Deploy Vercel - Bước 3 ✅ HOÀN THÀNH

## ✅ Đã Làm Gì

### 1. **Dynamic Redirect URI** 
   - File: `App.tsx`
   - Thêm function `getRedirectUri()` tự động chọn URL dựa trên environment:
     - **Development** (localhost): `http://localhost:3000/callback.html`
     - **Production** (Vercel): `https://sheduleteaching.vercel.app/callback.html`

### 2. **Callback Handler File**
   - File: `public/callback.html`
   - Xử lý callback từ Google OAuth2
   - Tự động close và return token về parent window

### 3. **Vercel Configuration**
   - File: `vercel.json`
   - Config build command và environment variables

---

## 🚀 Các Bước Tiếp Theo

### **Bước 1: Kiểm Tra Code Locally**
```bash
npm run dev
# Truy cập http://localhost:3000
# Test đăng nhập (nên work bình thường)
```

### **Bước 2: Build Thử Trước Khi Deploy**
```bash
npm run build
npm run preview
# Nó sẽ preview version production tại http://localhost:4173
```

### **Bước 3: Update Google Cloud Console**

Bạn cần update 2 chỗ trong Google Cloud Console:

#### **A. Authorized JavaScript Origins** (Thêm domain Vercel)
```
https://sheduleteaching.vercel.app
```

#### **B. Authorized redirect URIs** (Thêm callback URL)
```
https://sheduleteaching.vercel.app/callback.html
http://localhost:3000/callback.html
```

> ⚠️ **Quan Trọng**: Giữ `http://localhost:3000/callback.html` để có thể test locally

### **Bước 4: Deploy lên Vercel**

#### Option A: Dùng Vercel CLI
```bash
npm i -g vercel
vercel
# Nó sẽ hỏi project name, framework... chọn "Next.js" -> "Other"
```

#### Option B: Connect GitHub lên Vercel
1. Đẩy code lên GitHub
2. Login vào https://vercel.com
3. Click "New Project"
4. Import repository của bạn
5. Vercel sẽ auto build

### **Bước 5: Set Environment Variable trên Vercel**

Trên Vercel Dashboard:
1. Vào Project Settings
2. Environment Variables
3. Thêm:
   - **Name**: `VITE_GOOGLE_CLIENT_ID`
   - **Value**: `52666834832-cdqgn195iu40bp5hepulmanke59631ap.apps.googleusercontent.com`
4. Click Save & Redeploy

---

## 🧪 Test Sau Deploy

Sau khi deploy xong:
1. Truy cập: https://sheduleteaching.vercel.app
2. Click "Đăng nhập với Google"
3. Xác thực bằng tài khoản @fe.edu.vn
4. Nếu thành công → ✅ Bước 3 hoàn tất!

---

## 🐛 Troubleshoot

Nếu gặp lỗi "Redirect URI mismatch":
- Kiểm tra lại Google Cloud Console
- Đảm bảo URL callback chính xác
- Clear cache browser & thử lại

Nếu gặp lỗi CORS:
- Check console browser (F12)
- Xem error message để fix

---

## 📝 File Đã Thay Đổi

```
d:\CÔNG VIỆC\shedule_teaching\
├── App.tsx                    ✏️ (Thêm getRedirectUri())
├── public/
│   └── callback.html          ✨ (Tạo mới)
├── vercel.json                ✨ (Tạo mới)
└── package.json               (Không thay đổi)
```

---

## ✨ Kết Quả

Giờ app của bạn có thể:
- ✅ Chạy localhost mà không cần hardcode
- ✅ Chạy trên Vercel production
- ✅ Tự động switch redirect URI dựa trên environment
- ✅ Xử lý callback từ Google OAuth2 chính xác

🎉 **Bước 3 hoàn tất!**
