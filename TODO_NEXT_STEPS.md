# ✅ Checklist: Hoàn Thành Tích Hợp Firebase & Apps Script

## 🎯 Bạn Cần Làm GÌ Tiếp Theo?

### 📋 Bước 1: Deploy Apps Script Backend (QUAN TRỌNG!)

**Bạn PHẢI làm bước này để app hoạt động hoàn chỉnh:**

1. ✅ Đọc hướng dẫn chi tiết: [APPS_SCRIPT_DEPLOYMENT.md](./APPS_SCRIPT_DEPLOYMENT.md)
2. ✅ Vào https://script.google.com
3. ✅ Tạo project mới: "Schedule Teaching Backend"
4. ✅ Copy 4 files từ `appsscript/src/`:
   - `Constants.js`
   - `Logger.js`
   - `CalendarService.js`
   - `doPost.js`
5. ✅ Deploy as Web App (Execute as: Me, Access: Anyone)
6. ✅ Copy deployment URL
7. ✅ Update file `.env`:
   ```env
   VITE_BACKEND_URL=https://script.google.com/macros/s/{YOUR_ID}/exec
   ```
8. ✅ Restart dev server: `npm run dev`

---

### 🧪 Bước 2: Test Full Flow

**Sau khi deploy Apps Script, test từng bước:**

#### Test Firebase Login
```bash
# 1. Chạy app
npm run dev

# 2. Mở browser: http://localhost:3000
# 3. Click "Đăng nhập với Google"
# 4. Đăng nhập thành công → Header hiển thị tên user
```

✅ **Expected:** Tên user xuất hiện ở góc phải header

---

#### Test Auto-load Mapping
```bash
# 1. Đã login
# 2. Nhập Google Sheet URL + Tab name
# 3. Click "test1" hoặc "Review"
# 4. Chọn mapping columns (Ngày, Thời gian, Tên...)
# 5. Click "✓ Áp dụng"
# 6. F5 reload page
# 7. Load lại sheet → Mapping tự động fill vào dropdowns
```

✅ **Expected:** Toast notification: "✓ Đã tải mapping đã lưu từ lần trước"

---

#### Test Save Mapping
```bash
# 1. Load sheet mới (chưa có mapping)
# 2. Chọn mapping mới
# 3. Click "✓ Áp dụng"
```

✅ **Expected:** 
- Toast: "✓ Đã lưu mapping cho lần sau"
- Console log: "Saved mapping to Firebase: {...}"

---

#### Test Apps Script Sync
```bash
# 1. Load sheet + Apply mapping
# 2. Chọn rows cần sync
# 3. Click "Đồng bộ lên Calendar"
```

✅ **Expected:**
- Console log: "Using Apps Script backend: https://script.google.com/..."
- Toast: "✓ Đã đồng bộ X/Y sự kiện"
- Events xuất hiện trong Google Calendar: "Schedule Teaching"

---

#### Test Fallback Calendar API
```bash
# 1. Trong .env, set:
VITE_BACKEND_URL=http://localhost:5000

# 2. Restart dev server: npm run dev
# 3. Sync events
```

✅ **Expected:**
- Console log: "Using direct Calendar API (VITE_BACKEND_URL not configured)"
- Toast: "✓ Đã đồng bộ qua Calendar API"

---

### 🐛 Bước 3: Troubleshooting

#### Lỗi: "VITE_BACKEND_URL is not configured"
**Nguyên nhân:** Chưa set deployment URL trong `.env`

**Giải pháp:**
1. Check file `.env`:
   ```env
   VITE_BACKEND_URL=https://script.google.com/macros/s/{YOUR_ID}/exec
   ```
2. Restart dev server: `npm run dev`

---

#### Lỗi: "User not authenticated" khi save mapping
**Nguyên nhân:** Chưa đăng nhập hoặc Firebase context chưa ready

**Giải pháp:**
1. Logout và login lại
2. Check console: `firebaseUser` có value không?
3. Check Firebase console: User có tồn tại không?

---

#### Lỗi: Apps Script "Authorization required"
**Nguyên nhân:** Chưa authorize Apps Script với Calendar API

**Giải pháp:**
1. Vào https://script.google.com
2. Mở project
3. Deploy → Manage deployments
4. Click Edit → Re-deploy
5. Authorize access → Allow all permissions

---

#### Mapping không auto-load
**Nguyên nhân:** 
- Firestore chưa có data
- sheetMeta.sheetId không match với fileId đã lưu

**Giải pháp:**
1. Check Firestore console: 
   - Collection: `users/{userId}/mappings/{fileId}`
   - Document có tồn tại không?
2. Console log: `sheetMeta.sheetId` vs `savedMapping`
3. Clear Firestore và save lại mapping

---

### 📊 Bước 4: Monitoring

#### Check Firestore Data
1. Vào Firebase Console: https://console.firebase.google.com
2. Select project: `scheduleteaching`
3. Firestore Database → Data
4. Check collections:
   - `users/{userId}/mappings/...` - Column mappings
   - `users/{userId}/syncHistory/...` - Sync records

---

#### Check Apps Script Logs
1. Vào https://script.google.com
2. Mở project
3. Click **Executions** (⚡ icon)
4. Xem chi tiết từng request:
   - Status: Success/Failed
   - Duration
   - Logs

---

### 🎨 Bước 5: UI Polish (Optional)

#### Add Loading States
```typescript
// In App.tsx
{mappingLoading && <span>Loading mapping...</span>}
```

#### Add Clear Mapping Button
```tsx
<button onClick={() => clearMapping()}>
  🗑️ Clear Saved Mapping
</button>
```

#### Show Sync History
```tsx
<SyncHistoryPanel userId={firebaseUser?.uid} />
```

---

### 🔐 Bước 6: Production Readiness

#### Update Firestore Rules
**File:** `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

#### Disable Firebase Emulator
**File:** `.env`

```env
VITE_USE_FIREBASE_EMULATOR=false
```

---

#### Build for Production
```bash
npm run build
```

✅ **Check:** `dist/` folder created with optimized files

---

### 📚 Bước 7: Documentation

Đọc để hiểu rõ hơn:

1. [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md) - Tổng quan tích hợp
2. [APPS_SCRIPT_DEPLOYMENT.md](./APPS_SCRIPT_DEPLOYMENT.md) - Hướng dẫn deploy
3. [HOW_TO_START.md](./HOW_TO_START.md) - Quick start guide

---

## 🎉 Kết Luận

### ✅ ĐÃ HOÀN THÀNH:
- ✅ Firebase Authentication (Google OAuth)
- ✅ Firestore Integration (mapping storage)
- ✅ useFirebaseMapping hook (auto-load/save)
- ✅ Apps Script backend code (ready to deploy)
- ✅ Apps Script service integration (with fallback)
- ✅ Toast notifications
- ✅ Sync history tracking
- ✅ Build successful

### ⏳ CẦN BẠN LÀM:
- ⚠️ **Deploy Apps Script backend** (critical!)
- ⚠️ Update `.env` với deployment URL
- ⚠️ Test full flow
- ⚠️ Update Firestore rules cho production

---

## 💡 Tips

1. **Development:** Giữ `VITE_BACKEND_URL=http://localhost:5000` để dùng Calendar API (không cần Apps Script)
2. **Production:** Set deployment URL để dùng Apps Script (bảo mật + ổn định hơn)
3. **Debug:** Mở Console và check logs để hiểu flow
4. **Firestore:** Xem data trong Firebase Console để verify mapping saved

---

## 📞 Support

Nếu gặp vấn đề:
1. Check console logs (F12)
2. Check Firestore data trong Firebase Console
3. Check Apps Script execution logs
4. Review code trong các files đã tạo

**Chúc bạn thành công! 🚀**
