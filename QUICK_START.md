# 🚀 Quick Start - Excel Parser System

## Installation (Đã xong ✅)

Dependencies đã được cài đặt:
```bash
npm install xlsx date-fns
```

## 📌 File mới tạo

### Utilities
- ✅ `src/utils/excelParser.ts` - Main parser logic
- ✅ `src/utils/dateTimeParser.ts` - DateTime handling
- ✅ `src/utils/mergedCellsHandler.ts` - Merged cells handling
- ✅ `src/utils/index.ts` - Exports

### Components
- ✅ `src/components/ExcelImport.tsx` - Import file/URL
- ✅ `src/components/DataTable.tsx` - Display data
- ✅ `src/components/MergeAnalysisViewer.tsx` - Show merge info
- ✅ `src/components/DateTimeTest.tsx` - Test datetime parser
- ✅ `src/components/index.ts` - Exports

### Pages
- ✅ `src/pages/ExcelParserPage.tsx` - Full-featured demo page

### Styles
- ✅ `src/styles/excelParser.css` - Component styles
- ✅ `src/styles/excelParserPage.css` - Page styles

## 🎯 Cách tích hợp

### Option 1: Sử dụng full page (recommended)
```typescript
// App.tsx
import ExcelParserPage from './pages/ExcelParserPage';
import './styles/excelParserPage.css';

function App() {
  return <ExcelParserPage />;
}
```

### Option 2: Sử dụng từng component riêng lẻ
```typescript
import { ExcelImport, DataTable, DateTimeTest } from './components';
import './styles/excelParser.css';
import { NormalizedSheet } from './utils';

function MyApp() {
  const [sheets, setSheets] = useState<NormalizedSheet[]>([]);

  return (
    <>
      <ExcelImport onDataParsed={setSheets} />
      {sheets.map(sheet => <DataTable key={sheet.sheetName} data={sheet} />)}
      <DateTimeTest />
    </>
  );
}
```

## 🧪 Test ngay

Server đã chạy tại: **http://localhost:3001**

### Các bước test:
1. **Chọn một trong 2 cách integrate ở trên**
2. **Upload file Excel hoặc paste Google Sheets URL**
3. **Xem data được parsed trong tab "Xem dữ liệu"**
4. **Kiểm tra merged cells analysis ở tab "Phân tích Merged"**
5. **Test datetime parser ở tab "Test DateTime"**

## 💡 Key Features

### ✅ Auto-detect Sheet Type
```typescript
// Tự động nhận diện loại sheet
// - review: Có "Review" ở A1 và "Date" ở A3
// - schedule: Có merged cells
// - simple: Headers ở row 1, data từ row 2
```

### ✅ Xử lý Merged Cells
```
Trước:  A2:I2 gộp = "Table 1"
        J3:BE3 gộp = "Table 2"

Sau:   Headers = ["Table 1", "Table 2", ...]
       Data được expand đầy đủ
```

### ✅ Smart DateTime Parsing
```
Input: "1/27/2026", "27/01/2026", "slot 2", "13h00-14h30"
Output: Normalize về format chuẩn + metadata
```

### ✅ Metadata Enhancement
```
{
  "Date": "2026-01-27",
  "Date_iso": "2026-01-27",      // ← Thêm
  "Slot": "Slot 2 (9:30 - 11:45)",
  "Slot_start": "09:30",          // ← Thêm
  "Slot_end": "11:45",            // ← Thêm
  "Slot_number": 2                // ← Thêm
}
```

## 📊 Support 3 loại Sheet

### Sheet 1: Review Format
```
A1: "Review 1"
A3: "Date"  B3: "3"  C3: "1/20/2026"
A4: Header row (Code, Week Code, Day Code, ...)
A5+: Data rows
```

### Sheet 2: Schedule Format  
```
A1-I1: (gộp) = "Table 1"
J1-BE1: (gộp) = "Table 2"
A4: Code | B4: Week Code | ... (Headers)
A5+: Data với merged cells
```

### Sheet 3: Simple Format
```
A1: Header | B1: Header | C1: Header
A2+: Data rows
```

## 🔧 Customize

### Thêm time slot mới
`src/utils/dateTimeParser.ts`:
```typescript
const STANDARD_SLOTS: TimeSlot[] = [
  { slot: 1, startTime: '07:00', endTime: '09:15', display: '7:00 - 9:15' },
  // Thêm custom slots ở đây
];
```

### Thêm date format
`src/utils/dateTimeParser.ts`:
```typescript
const dateFormats = [
  'M/d/yyyy',
  'd/M/yyyy',
  // Thêm formats ở đây
];
```

### Thêm column detection
`src/utils/excelParser.ts`:
```typescript
const dateColumns = headers.filter(h => 
  /date|ngày|your_keyword/i.test(h)
);
```

## 📚 API Reference

### parseExcelFile()
```typescript
import { parseExcelFile } from '@/utils';

const sheets = await parseExcelFile(file);
// Returns: NormalizedSheet[]
```

### parseDateTime()
```typescript
import { parseDateTime, formatDateTime } from '@/utils/dateTimeParser';

const parsed = parseDateTime('1/27/2026');
const formatted = formatDateTime(parsed);
// Returns: ParsedDateTime
```

### analyzeMergeStructure()
```typescript
import { analyzeMergeStructure } from '@/utils/mergedCellsHandler';

const analysis = analyzeMergeStructure(worksheet);
// Returns: { totalMerges, mergedRows, mergedCols, ... }
```

## 🐛 Debug Tips

1. **Mở console** (F12) để xem logs
2. **Dùng DateTimeTest** để test datetime formats
3. **Dùng MergeAnalysisViewer** để xem chi tiết merged cells
4. **Check Network tab** nếu dùng Google Sheets URL

## 📞 Support

Cần customize thêm? Các files chính để edit:
- DateTime logic: `src/utils/dateTimeParser.ts`
- Merge handling: `src/utils/mergedCellsHandler.ts`
- Excel parsing: `src/utils/excelParser.ts`
- Component UI: `src/components/*.tsx`

---

✅ **Hệ thống đã sẵn sàng! Bắt đầu test ngay!**
