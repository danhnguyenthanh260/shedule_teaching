# 🎯 HOW TO START - Excel Parser System

## 🚀 Step 1: Verify Installation

```bash
# Dev server is already running at http://localhost:3001
npm run dev
```

**Expected output:**
```
✓ Vite ready in xxx ms
✓ Local: http://localhost:3001
```

## 🎨 Step 2: Choose Your Integration Method

### Option A: Full Page (Recommended for Quick Start)
Perfect if you want the complete experience with all features.

```typescript
// App.tsx
import ExcelParserPage from './pages/ExcelParserPage';
import './styles/excelParserPage.css';

function App() {
  return <ExcelParserPage />;
}

export default App;
```

### Option B: Custom Components
Perfect if you want to build your own layout.

```typescript
// MyExcelApp.tsx
import { ExcelImport, DataTable, DateTimeTest } from './components';
import { NormalizedSheet } from './utils';
import './styles/excelParser.css';
import { useState } from 'react';

export function MyExcelApp() {
  const [sheets, setSheets] = useState<NormalizedSheet[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  return (
    <div>
      <h1>My Excel Parser</h1>
      <ExcelImport onDataParsed={setSheets} />
      
      {sheets.length > 0 && (
        <>
          <select onChange={(e) => setSelectedIdx(parseInt(e.target.value))}>
            {sheets.map((s, i) => (
              <option key={i} value={i}>{s.sheetName}</option>
            ))}
          </select>
          <DataTable data={sheets[selectedIdx]} />
        </>
      )}
      
      <DateTimeTest />
    </div>
  );
}
```

### Option C: Direct Utility Usage
Perfect if you want full control.

```typescript
import { parseExcelFile, parseDateTime } from './utils';

async function handleFile(file: File) {
  const sheets = await parseExcelFile(file);
  console.log('Parsed sheets:', sheets);
  
  sheets.forEach(sheet => {
    console.log(`${sheet.sheetName}: ${sheet.data.length} rows`);
  });
}
```

## 📝 Step 3: Test Your Setup

### Test with Sample Excel File
1. Prepare a test Excel file with:
   - Sheet 1: Simple headers + data
   - Sheet 2: Merged headers
   - Date columns with mixed formats
   - Slot/Time columns

2. Go to http://localhost:3001

3. Upload your test file

4. Verify:
   - [x] Data loads correctly
   - [x] Headers are identified
   - [x] Dates are parsed (check Date_iso metadata)
   - [x] Slots are recognized (check Slot_start, Slot_end)
   - [x] Merged cells are shown in analysis

### Test DateTime Parsing
1. Click "Test DateTime" tab
2. Try these test cases:
   - `1/27/2026` → Should parse as 2026-01-27
   - `slot 1` → Should show "Slot 1 (7:00 - 9:15)"
   - `13h00-14h30` → Should show start/end times

## 🔍 Step 4: Understand the Data Flow

```
Upload File
    ↓
parseExcelFile()
    ├─ Read workbook
    ├─ Detect sheet type (review/schedule/simple)
    ├─ Handle merged cells
    ├─ Extract headers
    ├─ Parse datetime fields
    └─ Return NormalizedSheet[]
    ↓
Display in UI
    ├─ DataTable shows clean data
    ├─ MergeAnalysisViewer shows merge info
    └─ DateTimeTest shows parsing results
```

## 💡 Step 5: Key Files to Know

### For Adding Features
- **DateTime formats**: `src/utils/dateTimeParser.ts` (line 18-30)
- **Time slots**: `src/utils/dateTimeParser.ts` (line 33-38)
- **Column detection**: `src/utils/excelParser.ts` (line 220-225)

### For Styling
- **Component styles**: `src/styles/excelParser.css`
- **Page styles**: `src/styles/excelParserPage.css`

### For Components
- **All exports**: `src/components/index.ts`
- **Pick and use**: Any component from `src/components/`

## 📊 Step 6: Understanding Output Data

When you parse an Excel file, you get:

```typescript
NormalizedSheet {
  sheetName: "Review 1"
  headers: ["Code", "Date", "Slot", "Room", "Reviewer 1", "Reviewer 2"]
  data: [
    {
      Code: "3411",
      Date: "2026-01-27",
      Date_iso: "2026-01-27",          // ← Auto-added
      Slot: "Slot 1 (7:00 - 9:15)",
      Slot_start: "07:00",             // ← Auto-added
      Slot_end: "09:15",               // ← Auto-added
      Slot_number: 1,                  // ← Auto-added
      Room: "NVH G.02",
      "Reviewer 1": "LongT5",
      "Reviewer 2": "LongT5"
    },
    // ... more rows
  ]
  mergeInfo: {
    totalMerges: 2,
    mergedRows: [...],
    mergedCols: [...],
    // ... detailed merge analysis
  }
}
```

## 🔧 Step 7: Common Customizations

### Add a New Time Slot
```typescript
// src/utils/dateTimeParser.ts - line 36-38
const STANDARD_SLOTS: TimeSlot[] = [
  { slot: 1, startTime: '07:00', endTime: '09:15', display: '7:00 - 9:15' },
  { slot: 2, startTime: '09:30', endTime: '11:45', display: '9:30 - 11:45' },
  { slot: 3, startTime: '12:30', endTime: '14:45', display: '12:30 - 14:45' },
  { slot: 4, startTime: '15:00', endTime: '17:15', display: '15:00 - 17:15' },
  // Add here:
  { slot: 5, startTime: '18:00', endTime: '20:15', display: '18:00 - 20:15' }
];
```

### Add a New Date Format
```typescript
// src/utils/dateTimeParser.ts - line 47-56
const dateFormats = [
  'M/d/yyyy',
  'd/M/yyyy',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  // Add here:
  'dd-MM-yyyy'
];
```

### Add Column Detection Keywords
```typescript
// src/utils/excelParser.ts - line 220-225
const dateColumns = headers.filter(h => 
  /date|ngày|日期|your_new_keyword/i.test(h)
);
```

## 🎯 Step 8: Debugging Tips

### Enable Console Logging
All key functions log to console:
```
Merge Analysis: {...}
Sheet "Review 1" có 3 merged cells
Parsing datetime: "1/27/2026" → "2026-01-27"
```

### Check Merge Structure
Use `MergeAnalysisViewer` component to see:
- Header merges
- Data merges
- Row merges
- Column merges

### Test DateTime Separately
Use `DateTimeTest` component with predefined test cases

### Network Issues
If Google Sheets URL fails:
1. Check URL format is correct
2. Verify spreadsheet is publicly accessible
3. Check VITE_BACKEND_URL in .env

## 📚 Step 9: Next Steps

1. **Read the docs**:
   - `EXCEL_PARSER_README.md` - Complete reference
   - `INTEGRATION_EXAMPLES.ts` - 8 code examples

2. **Customize for your needs**:
   - Add more time slots
   - Add more date formats
   - Modify component styling

3. **Integrate with backend**:
   - Save parsed data to database
   - Sync with Google Sheets API
   - Add validation rules

4. **Advanced features**:
   - Data export (CSV, JSON)
   - Batch processing
   - Template system
   - Validation schemas

## 🆘 Troubleshooting

### "Headers not detected"
→ Check if first few rows have enough text to identify as headers
→ Use console to see what was detected

### "Dates not parsing"
→ Add the date format to `dateFormats` array
→ Use DateTimeTest component to verify format

### "Merged cells not working"
→ Check if file actually has merged cells
→ Use MergeAnalysisViewer to inspect
→ Check console for merge analysis logs

### "Google Sheets URL not working"
→ Verify spreadsheet is public
→ Check VITE_BACKEND_URL in .env
→ Ensure backend is running if needed

## 📞 Support

All files are documented and typed:
- Hover over functions for JSDoc comments
- Check types for interfaces
- Read markdown files for guides
- Check INTEGRATION_EXAMPLES.ts for code samples

## ✅ You're Ready!

```
✓ Dependencies installed
✓ Components created
✓ Utilities ready
✓ Documentation done
✓ Server running
✓ Ready to integrate!
```

**Next Action:** Choose your integration method and start using! 🚀

---

Questions? Check:
1. `EXCEL_PARSER_README.md` - Full docs
2. `INTEGRATION_EXAMPLES.ts` - Code examples
3. `QUICK_START.md` - Quick setup
4. Console logs - Debugging
