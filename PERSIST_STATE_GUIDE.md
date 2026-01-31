# Hướng dẫn Persist State & Sync History

## 📋 Tổng quan

Hệ thống đã được nâng cấp để giải quyết 2 vấn đề quan trọng về User Experience:

### ✅ Vấn đề đã sửa

1. **Mất dữ liệu khi F5 (Refresh page)**
   - ❌ **Trước**: Khi người dùng F5, tất cả dữ liệu (link, data, mapping, selections) đều mất
   - ✅ **Sau**: Dữ liệu được persist vào localStorage và tự động khôi phục sau F5

2. **Lịch sử đồng bộ bị mất khi re-login**
   - ❌ **Trước**: Lịch sử chỉ lưu trong memory, mất khi F5 hoặc logout
   - ✅ **Sau**: Lịch sử lưu vào Firebase Firestore, persist vĩnh viễn theo user

3. **Không có Auto-load settings**
   - ❌ **Trước**: Mỗi lần paste link phải setup lại column mapping, header row
   - ✅ **Sau**: Tự động load mapping đã lưu cho từng sheet ID

---

## 🛠️ Cải tiến chi tiết

### 1. Persist State Service ([lib/persistState.ts](lib/persistState.ts))

Service tập trung quản lý việc lưu/khôi phục state vào localStorage:

#### **Dữ liệu được persist:**
- ✅ Sheet URL & Tab Name
- ✅ Sheet Metadata (sheetId, tab, headerRowIndex)
- ✅ Header Row Index
- ✅ Column Mapping
- ✅ Person Filter
- ✅ All Rows (raw data từ API)
- ✅ Full Headers & Detail Headers
- ✅ Full Rows (processed data)
- ✅ Selected IDs

#### **API Methods:**

```typescript
// Lưu state
persistStateService.saveState({
  sheetUrl: 'https://...',
  columnMap: { date: 0, time: 1, ... }
});

// Khôi phục state
const restored = persistStateService.restoreState();
// => { sheetUrl, columnMap, allRows, ... }

// Xóa tất cả (khi logout)
persistStateService.clearState();

// Xóa chỉ data (giữ URL/tab)
persistStateService.clearDataOnly();
```

#### **Safety Features:**
- ✅ Giới hạn kích thước: Không lưu nếu data > 5MB
- ✅ Error handling: Try-catch để tránh crash
- ✅ Parse safety: Kiểm tra JSON parse errors

---

### 2. Auto-save State trong App.tsx

#### **Khi nào state được lưu?**
Sử dụng `useEffect` để tự động save mỗi khi state thay đổi:

```typescript
useEffect(() => {
  persistStateService.saveState({ sheetUrl });
}, [sheetUrl]);

useEffect(() => {
  persistStateService.saveState({ columnMap });
}, [columnMap]);

// ... tương tự cho các state khác
```

#### **Restore State on Mount:**
```typescript
useEffect(() => {
  const restored = persistStateService.restoreState();
  
  if (restored.sheetUrl) setSheetUrl(restored.sheetUrl);
  if (restored.columnMap) setColumnMap(restored.columnMap);
  if (restored.allRows) setAllRows(restored.allRows);
  // ... restore các state khác
}, []); // Chỉ chạy 1 lần khi mount
```

---

### 3. Recreate Rows từ Persisted Data

Sau khi restore state, cần tái tạo `rows` (normalized data):

```typescript
useEffect(() => {
  if (
    sheetMeta &&
    fullHeaders.length > 0 &&
    fullRows.length > 0 &&
    columnMap.date !== undefined &&
    columnMap.time !== undefined &&
    rows.length === 0 && // Chỉ tái tạo khi rows chưa có
    !loading
  ) {
    const recreatedRows = googleService.normalizeRows({
      sheetId: sheetMeta.sheetId,
      tab: sheetMeta.tab,
      headers: fullHeaders,
      rawRows: fullRows,
      mapping: columnMap,
      headerRowIndex: sheetMeta.headerRowIndex
    });
    
    setRows(recreatedRows);
    updateSelections(recreatedRows);
  }
}, [sheetMeta, fullHeaders, fullRows, columnMap, rows.length, loading]);
```

**Logic flow:**
1. Restore persisted state → `fullHeaders`, `fullRows`, `columnMap`, `sheetMeta`
2. Check đủ điều kiện → có data, có mapping, chưa có rows
3. Tái tạo rows từ raw data → `normalizeRows()`
4. Update selections theo person filter

---

### 4. Auto-load Smart Detection

```typescript
useEffect(() => {
  if (
    sheetUrl &&
    accessToken &&
    !loadingMode &&
    rows.length === 0 &&
    fullHeaders.length === 0 && // ← Chưa có persisted headers
    !sheetMeta                  // ← Chưa có persisted meta
  ) {
    // Chỉ load từ API nếu chưa có persisted data
    loadSheetFromAPI();
  }
}, [sheetUrl, accessToken, loadingMode, rows.length, fullHeaders.length, sheetMeta]);
```

**Behavior:**
- ✅ Có persisted data → Recreate từ localStorage (nhanh)
- ✅ Không có persisted data → Load từ API (chậm hơn)

---

### 5. Clear State on Logout

```typescript
onLogout={async () => {
  await logout();
  setUser(null);
  setAccessToken(null);
  
  // ✅ Clear persisted state
  persistStateService.clearState();
  console.log('✓ Cleared all persisted state on logout');
}}
```

**Tại sao cần clear?**
- Bảo mật: Không để data của user cũ còn trong localStorage
- Fresh start: User mới đăng nhập không thấy data của user cũ

---

### 6. Sync History với Firebase Firestore

#### **Lưu lịch sử:**
```typescript
// Trong handleSync() sau khi sync thành công
await firestoreSyncHistoryService.saveSyncResult(
  firebaseUser.uid,
  sheetMeta.sheetId,
  sheetMeta.tab,
  toSync.length,    // total rows
  res.created,      // created count
  res.updated,      // updated count
  res.failed        // failed count
);

// ✅ Trigger history modal refresh
setSyncHistoryRefresh(prev => prev + 1);
```

#### **Load lịch sử:**
```typescript
// Trong SyncHistoryModal
useEffect(() => {
  if (isOpen && userId) {
    loadHistory();
  }
}, [isOpen, userId, refreshTrigger]); // ← refreshTrigger từ App

const loadHistory = async () => {
  const records = await firestoreSyncHistoryService.getUserSyncHistory(userId);
  setHistory(records);
};
```

#### **Firestore Schema:**
```typescript
{
  userId: string,          // Firebase user ID
  sheetId: string,         // Google Sheet ID
  tabName: string,         // Tab name (Sheet1, Review1, etc.)
  rowCount: number,        // Total rows synced
  createdCount: number,    // Created events
  updatedCount: number,    // Updated events
  failedCount: number,     // Failed events
  syncedAt: Date           // Timestamp
}
```

---

## 🎯 User Flow Scenarios

### Scenario 1: F5 khi đang làm việc

**Before:**
1. User paste link → Load data → Setup mapping → Select rows
2. User F5 (lỡ tay)
3. ❌ Tất cả mất → Phải làm lại từ đầu

**After:**
1. User paste link → Load data → Setup mapping → Select rows
2. User F5
3. ✅ Page reload
4. ✅ Link tự động fill
5. ✅ Data tự động recreate
6. ✅ Mapping tự động restore
7. ✅ Selections tự động restore
8. ✅ Continue working ngay lập tức

---

### Scenario 2: Logout rồi login lại

**Before:**
1. User sync xong → Logout
2. User login lại
3. Click "Lịch sử" button
4. ❌ Lịch sử trống (mất hết)

**After:**
1. User sync xong → Lưu vào Firestore
2. User logout → Clear localStorage
3. User login lại
4. Click "Lịch sử" button
5. ✅ Load lịch sử từ Firestore
6. ✅ Thấy tất cả lần sync trước đó

---

### Scenario 3: Paste link đã dùng trước đó

**Before:**
1. User paste link Sheet A → Setup mapping (date col 0, time col 1, ...)
2. User sync xong
3. Next day: User paste link Sheet A lại
4. ❌ Phải setup mapping lại từ đầu

**After:**
1. User paste link Sheet A → Setup mapping
2. User apply mapping → Tự động lưu vào Firebase (`saveFirebaseMapping`)
3. Next day: User paste link Sheet A
4. ✅ Load data từ API
5. ✅ Auto-detect sheet ID
6. ✅ Auto-load mapping đã lưu (`useFirebaseMapping` hook)
7. ✅ Mapping tự động fill (date, time, location, ...)
8. ✅ Click "Apply Mapping" luôn

---

## 🔧 Firebase Setup Required

### 1. Firestore Collections

**Collection: `syncHistory`**
```
syncHistory/
  {docId}/
    userId: string
    sheetId: string
    tabName: string
    rowCount: number
    createdCount: number
    updatedCount: number
    failedCount: number
    syncedAt: timestamp
```

**Collection: `mappingPresets`**
```
mappingPresets/
  {userId}/
    sheets/
      {sheetId}/
        mapping: {
          date: number,
          time: number,
          person: number,
          task: number,
          location: number,
          email: number
        }
        updatedAt: timestamp
```

### 2. Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Sync History
    match /syncHistory/{docId} {
      allow read: if request.auth != null && 
                     request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    
    // Mapping Presets
    match /mappingPresets/{userId} {
      allow read, write: if request.auth != null && 
                            request.auth.uid == userId;
    }
  }
}
```

---

## 📊 Performance Considerations

### localStorage Size Limits
- Browser limit: ~5-10MB per domain
- Service tự động check: Chỉ lưu nếu < 5MB
- Large sheets: Có thể không persist được `allRows`/`fullRows`

### Solution:
```typescript
if (serialized.length < 5 * 1024 * 1024) {
  localStorage.setItem(KEYS.ALL_ROWS, serialized);
} else {
  console.warn('⚠️ Data too large, skipping persist');
}
```

### Firestore Reads
- Mỗi lần mở History Modal = 1 read
- Auto-load mapping = 1 read per sheet
- Optimize: Cache mapping trong memory

---

## 🐛 Debugging Tips

### Check localStorage:
```javascript
// Browser DevTools Console
console.log(localStorage);
console.log(localStorage.getItem('sheet_url'));
console.log(localStorage.getItem('column_map'));
```

### Check Firestore:
```javascript
// Firebase Console → Firestore Database
// Collections: syncHistory, mappingPresets
```

### Test Restore:
1. Load sheet → Apply mapping → Select rows
2. Open DevTools → Application → localStorage → Verify keys
3. F5
4. Check console logs: "✓ Restored sheet URL", "✓ Restored column map", ...
5. Verify rows recreated: "🔄 Recreating rows from persisted data..."

### Test History:
1. Sync events
2. Check console: "✓ Saved sync history and triggered refresh"
3. Open History Modal
4. Verify new record appears
5. F5 → Re-open modal → Verify history still there

---

## 🚀 Testing Checklist

- [ ] **F5 Restore**: Paste link → Load data → F5 → Verify data restored
- [ ] **Logout Clear**: Sync → Logout → Check localStorage empty
- [ ] **Re-login History**: Login user A → Sync → Logout → Login user A → Check history
- [ ] **Auto-load Mapping**: Paste Sheet A → Setup mapping → Next day paste Sheet A → Verify auto-fill
- [ ] **History Refresh**: Sync → Open history → Verify new record appears immediately
- [ ] **Large Sheet**: Load sheet > 1000 rows → F5 → Verify restore (or graceful fallback)
- [ ] **Multiple Tabs**: Open 2 tabs → Sync in tab 1 → Open history in tab 2 → Verify refresh trigger

---

## 📝 Notes

- **localStorage persistence**: Vĩnh viễn (cho đến khi clear hoặc logout)
- **Firestore persistence**: Vĩnh viễn (theo user ID)
- **Auto-refresh**: History modal tự động refresh khi có sync mới
- **Smart loading**: Chỉ load từ API khi không có persisted data
- **Safety first**: Tất cả operations đều có error handling

---

## 🎉 Benefits

✅ **Better UX**: Không mất data khi F5 lỡ tay  
✅ **Time saving**: Auto-load mapping cho sheets đã dùng  
✅ **Persistent history**: Lịch sử không bao giờ mất  
✅ **Fast restore**: Recreate từ localStorage nhanh hơn load từ API  
✅ **Professional**: Giống các web app hiện đại (Gmail, Notion, ...)
