# Excel Parser System - Hướng dẫn sử dụng

## 📋 Tính năng

### ✅ Tự động phát hiện cấu trúc Excel
- Nhận diện loại sheet (Review, Schedule, Simple)
- Xử lý merged cells (gộp dòng, gộp cột, gộp cả 2)
- Tìm headers tự động từ bất kỳ vị trí nào

### ✅ Xử lý DateTime thông minh
- **Formats ngày tháng:**
  - 1/27/2026 (M/d/yyyy)
  - 27/01/2026 (d/M/yyyy)
  - 2026-01-27 (yyyy-MM-dd)
  - Excel serial dates

- **Formats thời gian:**
  - Slot numbers: 1, 2, 3, 4 → chuyển đổi tự động
  - Slot text: "Slot 1", "slot2", "s3" → normalize
  - Time ranges: 13h00-14h30, 13:00-14:30, 1:00 PM - 2:30 PM
  
- **Slot chuẩn định sẵn:**
  - Slot 1: 7:00 - 9:15
  - Slot 2: 9:30 - 11:45
  - Slot 3: 12:30 - 14:45
  - Slot 4: 15:00 - 17:15

### ✅ Hỗ trợ nhiều nguồn dữ liệu
- Upload file Excel (.xlsx, .xls)
- Paste Google Sheets URL
- Xử lý nhiều sheets trong 1 file

### ✅ Phân tích chi tiết Merged Cells
- Phân loại: Row merge, Col merge, Both
- Phân biệt: Header merges vs Data merges
- Báo cáo: Số lượng và vị trí của mỗi merged cell

## 🚀 Cách sử dụng

### 1. Import components vào app
```typescript
import { ExcelImport, DataTable, MergeAnalysisViewer, DateTimeTest } from '@/components';
import '@/styles/excelParser.css';

// Hoặc import page hoàn chỉnh
import ExcelParserPage from '@/pages/ExcelParserPage';
import '@/styles/excelParserPage.css';
```

### 2. Sử dụng các component riêng lẻ

**ExcelImport - Nhập dữ liệu:**
```typescript
<ExcelImport onDataParsed={(sheets) => {
  console.log('Parsed sheets:', sheets);
}} />
```

**DataTable - Hiển thị dữ liệu:**
```typescript
const [sheets, setSheets] = useState<NormalizedSheet[]>([]);
{sheets.map(sheet => (
  <DataTable key={sheet.sheetName} data={sheet} />
))}
```

**MergeAnalysisViewer - Phân tích Merged:**
```typescript
<MergeAnalysisViewer sheet={sheet} />
```

**DateTimeTest - Test DateTime Parser:**
```typescript
<DateTimeTest />
```

### 3. Sử dụng utilities trực tiếp

**Parse Excel:**
```typescript
import { parseExcelFile } from '@/utils';

const file = /* ... */;
const sheets = await parseExcelFile(file);
console.log(sheets); // NormalizedSheet[]
```

**Parse DateTime:**
```typescript
import { parseDateTime, formatDateTime } from '@/utils/dateTimeParser';

const parsed = parseDateTime('1/27/2026');
const formatted = formatDateTime(parsed);
console.log(formatted); // "2026-01-27"
```

**Phân tích Merged Cells:**
```typescript
import { analyzeMergeStructure } from '@/utils/mergedCellsHandler';

const analysis = analyzeMergeStructure(worksheet);
console.log(analysis);
// {
//   totalMerges: 5,
//   mergedRows: [...],
//   mergedCols: [...],
//   mergedBoth: [...],
//   headerMerges: [...],
//   dataMerges: [...]
// }
```

## 📊 Output data format

### NormalizedSheet interface
```typescript
{
  sheetName: string;              // Tên sheet
  headers: string[];              // Danh sách headers đã normalize
  data: Record<string, any>[];   // Mảng dữ liệu
  detectedType: 'review' | 'schedule' | 'simple';
  mergeInfo?: {
    totalMerges: number;
    mergedRows: MergeInfo[];
    mergedCols: MergeInfo[];
    mergedBoth: MergeInfo[];
    headerMerges: MergeInfo[];
    dataMerges: MergeInfo[];
  }
}
```

### ParsedDateTime interface
```typescript
{
  date?: Date;                    // Nếu là date
  dateString?: string;            // Format ISO: "2026-01-27"
  timeSlot?: {
    slot: number;                 // 1, 2, 3, 4 hoặc 0 (custom)
    startTime: string;            // "HH:mm"
    endTime: string;              // "HH:mm"
    display: string;              // "7:00 - 9:15"
  };
  rawValue: string;               // Giá trị gốc
  type: 'date' | 'time-slot' | 'time-range' | 'unknown';
}
```

## 🎯 Các trường hợp xử lý

### Sheet có merged headers
```
A2:I2 = "Table 1"
J3:BE3 = "Table 2"

→ Output: headers từ cả 2 merged ranges
```

### Sheet có merged rows (data)
```
A5:A10 = "Course A"  (merged rows)

→ Output: "Course A" được điền vào tất cả rows 5-10
```

### DateTime format hỗn hợp
```
| Date       | Slot     | Time        |
|------------|----------|-------------|
| 1/27/2026  | 1        | 7h00-9h15  |
| 27/01/2026 | slot2    | 9h30-11h45 |
| 2026-01-27 | Slot 3   | 13:00-14:30|

→ Tất cả đều được normalize thành format chuẩn
```

## ⚙️ Configuration

### Thêm slot tùy chỉnh
File: `src/utils/dateTimeParser.ts`
```typescript
const STANDARD_SLOTS: TimeSlot[] = [
  { slot: 1, startTime: '07:00', endTime: '09:15', display: '7:00 - 9:15' },
  // Thêm slots khác ở đây
];
```

### Thêm date formats
```typescript
const dateFormats = [
  'M/d/yyyy',
  'd/M/yyyy',
  // Thêm formats khác ở đây
];
```

### Thêm column detection keywords
File: `src/utils/excelParser.ts`
```typescript
const dateColumns = headers.filter(h => 
  /date|ngày|日期|your_keyword/i.test(h)
);
```

## 🔧 Dependencies

```json
{
  "xlsx": "^0.18.5",      // Xử lý Excel
  "date-fns": "^3.3.1"    // Parse & format dates
}
```

## 📝 Ví dụ thực tế

### Import 3 sheets cùng lúc
```typescript
import { ExcelImport, DataTable } from '@/components';
const [sheets, setSheets] = useState([]);

<ExcelImport 
  onDataParsed={(sheets) => {
    setSheets(sheets);
    console.log(`Imported ${sheets.length} sheets:`, 
      sheets.map(s => `${s.sheetName} (${s.data.length} rows)`));
  }} 
/>

{sheets.map(sheet => (
  <DataTable key={sheet.sheetName} data={sheet} />
))}
```

### Lấy metadata datetime
```typescript
const sheet = sheets[0];
const firstRow = sheet.data[0];

// Metadata từ datetime parser
console.log(firstRow['Date_iso']);        // "2026-01-27"
console.log(firstRow['Slot_start']);      // "07:00"
console.log(firstRow['Slot_end']);        // "09:15"
console.log(firstRow['Slot_number']);     // 1
```

## 🐛 Troubleshooting

**Q: Headers không được phát hiện đúng?**
- Kiểm tra xem headers có chữ hoa, in đậm hoặc contain keywords (Code, Date, Slot, etc)
- Mở console xem logs "Merge Analysis"

**Q: DateTime không parse đúng?**
- Dùng component `DateTimeTest` để test format
- Thêm format mới vào `dateFormats` array nếu cần

**Q: Merged cells không expand đúng?**
- Mở component `MergeAnalysisViewer` để xem cấu trúc merge
- Check console logs từ `analyzeMergeStructure`

## 📚 File structure
```
src/
├── utils/
│   ├── excelParser.ts          # Main parser
│   ├── dateTimeParser.ts       # DateTime handling
│   ├── mergedCellsHandler.ts   # Merged cells logic
│   └── index.ts                # Exports
├── components/
│   ├── ExcelImport.tsx         # Import component
│   ├── DataTable.tsx           # Display component
│   ├── MergeAnalysisViewer.tsx # Analysis component
│   ├── DateTimeTest.tsx        # Test component
│   └── index.ts                # Exports
├── pages/
│   └── ExcelParserPage.tsx     # Full page with tabs
└── styles/
    ├── excelParser.css         # Component styles
    └── excelParserPage.css     # Page styles
```
