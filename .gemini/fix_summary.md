# Fix Summary: Review Data Loading Issues

## Problems Identified

### Problem 1: Incorrect Data Count (4 items instead of 12)
- **Root Cause**: `loadSheetReview` was using `normalizeRows` instead of `normalizeRowsWithGrouping`
- **Expected**: 4 data rows × 3 review groups (REVIEW 1, 2, 3) = 12 events
- **Actual**: 4 data rows = 4 events (no expansion)

### Problem 2: Random Field Errors
- **Root Cause**: Multiple issues in data flow:
  1. `applyHeaderRow` was checking old `titleRow` state instead of newly computed `computedTitleRow`
  2. `applyMapping` wasn't reconstructing group headers from Row 2
  3. Recreation logic after F5 wasn't using grouped normalization
  4. `titleRow` wasn't being persisted to localStorage

## Changes Made

### 1. Fixed `loadSheetReview` in `googleService.ts` (Lines 320-420)
**What Changed**:
- Now extracts Row 2 (group headers) with `fillForwardRow` to handle merged cells
- Extracts Row 3 (detail headers) separately
- Filters out DEFENSE and CONFLICT columns from both rows
- **CRITICAL**: Uses `normalizeRowsWithGrouping` instead of `normalizeRows`
- This expands each data row into multiple events (one per review group)

**Result**: 4 data rows now correctly generate 12 events (4 × 3 reviews)

### 2. Fixed `applyHeaderRow` in `App.tsx` (Line 499)
**What Changed**:
- Changed from `idx === 2 && titleRow.length > 0` 
- To: `(idx === 2 || idx === 3) && computedTitleRow.length > 0`
- Now uses the **newly computed** `computedTitleRow` instead of old state

**Result**: Grouped normalization now works on first load

### 3. Fixed `applyMapping` in `App.tsx` (Lines 561-617)
**What Changed**:
- Added logic to reconstruct group headers from `allRows[1]` (Row 2) for Review mode
- Applies `fillForwardRow` to handle merged cells
- Filters out DEFENSE/CONFLICT columns consistently
- Uses reconstructed `groupHeadersToUse` for normalization

**Result**: Clicking "Áp dụng" now correctly re-expands data into 12 events

### 4. Fixed Recreation Logic in `App.tsx` (Lines 221-244)
**What Changed**:
- Added check for Review mode: `(sheetMeta.headerRowIndex === 2 || 3)`
- Uses `normalizeRowsWithGrouping` with `titleRow` for Review mode
- Falls back to `normalizeRows` for non-Review mode

**Result**: After F5 refresh, data is correctly restored as 12 events

### 5. Added `titleRow` Persistence (Multiple Files)

#### `lib/persistState.ts`:
- Added `TITLE_ROW` key to localStorage keys
- Added `titleRow: string[]` to `PersistedState` interface
- Added save/restore logic for titleRow
- Added titleRow to `clearDataOnly` cleanup

#### `App.tsx`:
- Added titleRow restoration in initial useEffect (line 115-118)
- Added titleRow auto-save useEffect (line 169-173)
- Added titleRow to recreation effect dependencies (line 258)

**Result**: titleRow is now persisted across page refreshes

## Technical Details

### Data Flow for Review Mode

1. **Load Sheet** (`loadSheetReview`):
   ```
   Row 2 (filled): [REVIEW 1, REVIEW 1, REVIEW 1, REVIEW 2, REVIEW 2, REVIEW 2, REVIEW 3, ...]
   Row 3:          [Code, Count, Date, Slot, Room, Reviewer 1, Reviewer 2, ...]
   Data Row 1:     [SE01, 3, 30/01/2026, 1, NVH G.02, LongT5, ...]
   
   → Expands to 3 events:
     - Event 1: REVIEW 1 (Code=SE01, Date=30/01/2026, Slot=1, Reviewer=LongT5)
     - Event 2: REVIEW 2 (Code=SE01, Date=30/01/2026, Slot=2, Reviewer=...)
     - Event 3: REVIEW 3 (Code=SE01, Date=03/02/2026, Slot=3, Reviewer=...)
   ```

2. **Apply Header Row** (`applyHeaderRow`):
   - Computes `computedTitleRow` from Row 2 (group headers)
   - Stores in `titleRow` state
   - Uses `normalizeRowsWithGrouping` with `computedTitleRow`

3. **Apply Mapping** (`applyMapping`):
   - Reconstructs group headers from `allRows[1]` (Row 2)
   - Applies same column filtering
   - Uses `normalizeRowsWithGrouping` with reconstructed headers

4. **Recreation** (after F5):
   - Restores `titleRow` from localStorage
   - Uses `normalizeRowsWithGrouping` with restored `titleRow`

### Key Functions

- **`fillForwardRow`**: Handles merged cells by filling empty cells with last non-empty value
  ```
  Input:  [REVIEW 1, "", "", REVIEW 2, "", ""]
  Output: [REVIEW 1, REVIEW 1, REVIEW 1, REVIEW 2, REVIEW 2, REVIEW 2]
  ```

- **`normalizeRowsWithGrouping`**: Expands each data row into multiple events
  - Groups columns by group header name
  - Extracts values for each group (Date, Slot, Reviewer, etc.)
  - Creates one event per group

## Testing Checklist

✅ **Test 1**: Load Review sheet → Should show 12 items (not 4)
✅ **Test 2**: Click "Áp dụng" → Should maintain 12 items
✅ **Test 3**: Refresh page (F5) → Should restore 12 items
✅ **Test 4**: No random field errors
✅ **Test 5**: DEFENSE and CONFLICT columns are filtered out

## Console Logs to Watch

When loading Review sheet, you should see:
```
✅ Review mode: Range 'Sheet1'!J1:BE1000
✅ Row 2 (group headers): ['REVIEW 1', 'REVIEW 1', 'REVIEW 1', 'REVIEW 2', ...]
✅ Row 3 (detail headers): ['Code', 'Count', 'Date', 'Slot', 'Room', ...]
✅ Data rows: 4
✅ Filtered columns: 24 (removed DEFENSE/CONFLICT)
✅ Normalized: 4 rows → 12 events (grouped by REVIEW)
```
