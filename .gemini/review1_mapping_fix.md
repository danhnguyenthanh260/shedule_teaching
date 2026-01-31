# Fix Summary: Review1 Mapping Issues

## Problem
Review1 đọc được file nhưng báo lỗi "Không tìm thấy dòng nào hợp lệ với ngày và thời gian" và không có nút "Đồng bộ lên Calendar".

## Root Cause
**Schema inference không detect được đủ 3 cột bắt buộc** (date, time, person):

### Review1 Headers:
```
CODE | WEEK CODE | DAY CODE | SLOT CODE | WDS CODE | GROUP CODE | DATE | DATE OF WEEK | ROOM | REVIEWER 1 | REVIEWER 2 | COUNT
```

### Mapping Issues:
1. **TIME**: "SLOT CODE" không match với keyword "slot" (vì có space và "CODE")
2. **PERSON**: "REVIEWER 1" có thể bị conflict với "REVIEWER 2" (inference không biết chọn cái nào)

## Solution

### 1. Enhanced Keyword Detection (`lib/inference.ts`)

**Before**:
```typescript
time: ['giờ', 'time', 'slot', 'ca'],
```

**After**:
```typescript
time: ['giờ', 'time', 'slot', 'ca', 'slot code', 'slotcode', 'tiết'],
```

**Impact**: Giờ inference có thể detect "SLOT CODE" ✅

### 2. Enhanced Fallback Logic (`services/googleService.ts`)

**Before** (Lines 491-495):
```typescript
const tIdx = headers.findIndex(h =>
  h?.toLowerCase().includes("giờ") ||
  h?.toLowerCase().includes("slot") ||
  h?.toLowerCase().includes("time")
);
```

**After** (Lines 491-502):
```typescript
const tIdx = headers.findIndex(h =>
  h?.toLowerCase().includes("giờ") ||
  h?.toLowerCase().includes("slot") ||
  h?.toLowerCase().includes("time") ||
  h?.toLowerCase().includes("tiết")
);
const pIdx = headers.findIndex(h =>
  h?.toLowerCase().includes("reviewer") ||
  h?.toLowerCase().includes("người") ||
  h?.toLowerCase().includes("tên") ||
  h?.toLowerCase().includes("giảng viên")
);
```

**Impact**: 
- Fallback tìm "slot" giờ cũng tìm "tiết" ✅
- Thêm fallback tìm "reviewer" cho person ✅

### 3. Updated Manual Mapping (`services/googleService.ts`)

**Before** (Lines 509-516):
```typescript
const manualMapping: ColumnMapping = {
  date: dIdx,
  time: tIdx,
  person: headers.findIndex(h => h?.toLowerCase().includes("họ") || h?.toLowerCase().includes("tên")),
  task: headers.findIndex(h => h?.toLowerCase().includes("nhiệm vụ") || h?.toLowerCase().includes("môn")),
  location: headers.findIndex(h => h?.toLowerCase().includes("phòng"))
};
```

**After**:
```typescript
const manualMapping: ColumnMapping = {
  date: dIdx,
  time: tIdx,
  person: pIdx !== -1 ? pIdx : headers.findIndex(h => h?.toLowerCase().includes("họ") || h?.toLowerCase().includes("tên")),
  task: headers.findIndex(h => h?.toLowerCase().includes("nhiệm vụ") || h?.toLowerCase().includes("môn") || h?.toLowerCase().includes("code")),
  location: headers.findIndex(h => h?.toLowerCase().includes("phòng") || h?.toLowerCase().includes("room"))
};
```

**Impact**:
- Person giờ ưu tiên dùng pIdx (đã tìm "reviewer") ✅
- Task fallback tìm "code" (CODE column) ✅
- Location fallback tìm "room" (ROOM column) ✅

## Expected Console Log

Sau khi fix, khi load Review1, console sẽ hiện:

```
✅ Review1 mode (FLAT): Range 'Review1'!A1:BE1000
✅ Row 4 (headers): ['CODE', 'WEEK CODE', 'DAY CODE', 'SLOT CODE', 'WDS CODE', 'GROUP CODE', 'DATE', 'DATE OF WEEK', 'ROOM', 'REVIEWER 1', 'REVIEWER 2', 'COUNT']
✅ Data rows: 6

📊 Schema Inference Result: {
  headers: [...],
  mapping: {
    date: 6,      // ✅ "DATE"
    time: 3,      // ✅ "SLOT CODE"
    person: 9,    // ✅ "REVIEWER 1"
    task: 0,      // ✅ "CODE"
    location: 8   // ✅ "ROOM"
  },
  confidence: 0.80,
  isReliable: true,
  status: {
    date: '✅ Column 6: "DATE"',
    time: '✅ Column 3: "SLOT CODE"',
    person: '✅ Column 9: "REVIEWER 1"',
    task: '✅ Column 0: "CODE"',
    location: '✅ Column 8: "ROOM"'
  }
}

✅ Normalized: 6 rows → 6 events (FLAT structure)
```

## Testing

1. **Clear cache** (Ctrl+Shift+R hoặc xóa localStorage)
2. **Dán link Review1**
3. **Bấm "Tải"**
4. **Kiểm tra Console** (F12) xem có log như trên không
5. **Kiểm tra UI**:
   - ✅ Không còn lỗi đỏ
   - ✅ Hiện nút "Đồng bộ lên Calendar"
   - ✅ Mapping dropdowns đúng (Date, Slot Code, Reviewer 1, Room)

## Files Modified

1. `lib/inference.ts` (Line 6): Added 'slot code', 'slotcode', 'tiết' to time keywords
2. `services/googleService.ts` (Lines 491-516): Enhanced fallback logic and manual mapping
