# Fix Summary: Review1 Tab Support

## Problem
Review1 tab không thể import vào calendar vì bị lỗi "Không tìm thấy dòng nào hợp lệ với ngày và thời gian".

## Root Cause
Review1 có **cấu trúc khác hoàn toàn** so với các Review tab khác:

### Review1 Structure (FLAT - Phẳng):
```
Row 1-3: Project information (không phải headers)
Row 4:   Code | Week Code | Day Code | Slot Code | Date | Room | Reviewer 1 | Reviewer 2 | Count
Row 5+:  Data (1 row = 1 event)
```

### Other Review Tabs Structure (GROUPED - Nhóm):
```
Row 2:   REVIEW 1 | REVIEW 1 | REVIEW 1 | REVIEW 2 | REVIEW 2 | REVIEW 2 | REVIEW 3 | ...
Row 3:   Code | Count | Date | Slot | Room | Reviewer 1 | Reviewer 2 | ...
Row 4+:  Data (1 row = 3 events, mỗi REVIEW 1 event)
```

Code cũ đang **dùng grouped logic cho cả Review1**, nên nó cố tìm Row 2 làm group headers → Sai → Không parse được date/time → Lỗi.

## Solution

Thêm **conditional logic** trong `loadSheetReview` (file `googleService.ts`):

### Before (Lines 368-424):
```typescript
// Luôn dùng grouped structure cho tất cả Review tabs
const row2 = this.fillForwardRow(values[1] || []);
const row3 = values[2] || [];
// ... filter DEFENSE/CONFLICT ...
const normalized = this.normalizeRowsWithGrouping({...});
```

### After (Lines 368-470):
```typescript
// ✅ Check if Review1 → use FLAT structure
if (isReview1Tab) {
  const headers = values[headerRowIndex] || []; // Row 4
  let rawData = values.slice(headerRowIndex + 1); // Row 5+
  
  const normalized = this.normalizeRows({ // ← FLAT structure
    sheetId,
    tab: finalTabName,
    headers,
    rawRows: rawData,
    mapping: schema.mapping,
    headerRowIndex: headerRowIndex,
    isDataMau: false
  });
  
  return { rows: normalized, ... };
}

// ✅ Other Review tabs → use GROUPED structure
const row2 = this.fillForwardRow(values[1] || []);
const row3 = values[2] || [];
// ... filter DEFENSE/CONFLICT ...
const normalized = this.normalizeRowsWithGrouping({...}); // ← GROUPED structure
```

## Key Changes

1. **Added conditional check** at line 368:
   ```typescript
   if (isReview1Tab) {
     // Use normalizeRows (FLAT)
   } else {
     // Use normalizeRowsWithGrouping (GROUPED)
   }
   ```

2. **Review1 logic**:
   - Uses `values[headerRowIndex]` (Row 4) as headers
   - Uses `values.slice(headerRowIndex + 1)` (Row 5+) as data
   - Calls `normalizeRows` (1 row = 1 event)
   - No grouping, no filtering DEFENSE/CONFLICT

3. **Other Review tabs logic** (unchanged):
   - Uses Row 2 as group headers
   - Uses Row 3 as detail headers
   - Filters out DEFENSE/CONFLICT columns
   - Calls `normalizeRowsWithGrouping` (1 row = multiple events)

## Testing

### Review1 Tab:
```
✅ Review1 mode (FLAT): Range 'Review1'!A1:BE1000
✅ Row 4 (headers): ['Code', 'Week Code', 'Day Code', 'Slot Code', 'Date', 'Room', 'Reviewer 1', 'Reviewer 2', 'Count']
✅ Data rows: 6
✅ Normalized: 6 rows → 6 events (FLAT structure)
```

### Other Review Tabs (Sheet1, Data Mẫu):
```
✅ Review mode (GROUPED): Range 'Sheet1'!J1:BE1000
✅ Row 2 (group headers): ['REVIEW 1', 'REVIEW 1', 'REVIEW 1', 'REVIEW 2', ...]
✅ Row 3 (detail headers): ['Code', 'Count', 'Date', 'Slot', 'Room', ...]
✅ Data rows: 4
✅ Filtered columns: 24 (removed DEFENSE/CONFLICT)
✅ Normalized: 4 rows → 12 events (grouped by REVIEW)
```

## Impact

✅ **Review1**: Giờ có thể import vào calendar (6 dòng → 6 events)
✅ **Other Review tabs**: Không bị ảnh hưởng (vẫn 4 dòng → 12 events)
✅ **No breaking changes**: Logic cũ vẫn hoạt động bình thường

## Files Modified

- `services/googleService.ts` (Lines 368-470): Added conditional logic for Review1
