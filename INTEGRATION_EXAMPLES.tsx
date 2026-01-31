/**
 * INTEGRATION EXAMPLES
 * Các ví dụ tích hợp hệ thống Excel Parser vào app
 */

// ============================================
// EXAMPLE 1: Full Page Integration
// ============================================
import React from 'react';
import ExcelParserPage from './pages/ExcelParserPage';
import './styles/excelParserPage.css';

export function Example1_FullPage() {
  return <ExcelParserPage />;
}

// ============================================
// EXAMPLE 2: Custom Integration with State
// ============================================
import { ExcelImport, DataTable, MergeAnalysisViewer } from './components';
import { NormalizedSheet } from './utils';
import './styles/excelParser.css';

export function Example2_CustomIntegration() {
  const [sheets, setSheets] = React.useState<NormalizedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = React.useState(0);

  const currentSheet = sheets[selectedSheet];

  return (
    <div className="custom-excel-app">
      <h1>Custom Excel Parser</h1>
      
      <ExcelImport onDataParsed={setSheets} />

      {sheets.length > 0 && (
        <div>
          <div>
            <label>Select Sheet: </label>
            <select
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(parseInt(e.target.value))}
            >
              {sheets.map((sheet, idx) => (
                <option key={idx} value={idx}>
                  {sheet.sheetName} ({sheet.data.length} rows)
                </option>
              ))}
            </select>
          </div>

          <DataTable data={currentSheet} />
          <MergeAnalysisViewer sheet={currentSheet} />
        </div>
      )}
    </div>
  );
}

// ============================================
// EXAMPLE 3: Direct Utility Usage
// ============================================
import { parseExcelFile, parseDateTime, analyzeMergeStructure } from './utils';

export async function Example3_DirectUtilityUsage() {
  // Parse Excel
  const file = /* ... get file ... */ as File;
  const sheets = await parseExcelFile(file);

  // Process each sheet
  sheets.forEach(sheet => {
    console.log(`Sheet: ${sheet.sheetName}`);
    console.log(`  Type: ${sheet.detectedType}`);
    console.log(`  Headers: ${sheet.headers.join(', ')}`);
    console.log(`  Rows: ${sheet.data.length}`);
    
    // Access datetime metadata
    sheet.data.forEach((row, idx) => {
      if (row['Date_iso']) {
        console.log(`  Row ${idx} date: ${row['Date_iso']}`);
      }
      if (row['Slot_start']) {
        console.log(`  Row ${idx} slot: ${row['Slot_start']} - ${row['Slot_end']}`);
      }
    });

    // Analyze merges
    if (sheet.mergeInfo?.totalMerges > 0) {
      console.log(`  Merged cells: ${sheet.mergeInfo.totalMerges}`);
    }
  });
}

// ============================================
// EXAMPLE 4: DateTime Parsing Only
// ============================================
import { parseDateTime, formatDateTime, normalizeDataDateTime } from './utils/dateTimeParser';

export function Example4_DateTimeOnly() {
  // Test various formats
  const testCases = [
    '1/27/2026',
    '27/01/2026',
    '2026-01-27',
    'slot 1',
    '13h00-14h30',
    '9:30 - 11:45'
  ];

  testCases.forEach(test => {
    const parsed = parseDateTime(test);
    const formatted = formatDateTime(parsed);
    console.log(`"${test}" → ${parsed.type}: ${formatted}`);
  });

  // Normalize entire dataset
  const data = [
    { date: '1/27/2026', slot: '1', time: '13h00-14h30' },
    { date: '27/01/2026', slot: 'slot2', time: '9:30 - 11:45' }
  ];

  const normalized = normalizeDataDateTime(data, ['date'], ['slot', 'time']);
  console.log('Normalized:', normalized);
  // Output: [{
  //   date: '2026-01-27',
  //   date_formatted: '27/01/2026',
  //   date_iso: '2026-01-27',
  //   slot: 'Slot 1 (7:00 - 9:15)',
  //   slot_start: '07:00',
  //   slot_end: '09:15',
  //   slot_number: 1,
  //   time: '13:00 - 14:30',
  //   time_start: '13:00',
  //   time_end: '14:30'
  // }]
}

// ============================================
// EXAMPLE 5: Merged Cells Analysis
// ============================================
import * as XLSX from 'xlsx';
import {
  getMergedCells,
  expandMergedDataRows,
  getHeaderFromMergedCells,
  analyzeMergeStructure as analyzeMerge
} from './utils/mergedCellsHandler';

export function Example5_MergedCellsAnalysis() {
  const file = /* ... get file ... */ as File;
  const reader = new FileReader();

  reader.onload = (e) => {
    const data = new Uint8Array(e.target?.result as ArrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    // Get merge analysis
    const analysis = analyzeMerge(worksheet);
    console.log('Merge Analysis:', analysis);

    // Get merged cells info
    const mergedCells = getMergedCells(worksheet);
    mergedCells.forEach(merge => {
      console.log(
        `Merged: Row ${merge.startRow}-${merge.endRow}, Col ${merge.startCol}-${merge.endCol}`,
        `Value: ${merge.value}`
      );
    });

    // Expand merged data rows
    const expanded = expandMergedDataRows(worksheet, 5);
    console.log('Expanded worksheet:', expanded);

    // Get headers from merged cells
    const headers = getHeaderFromMergedCells(worksheet, 0);
    console.log('Headers from merged:', headers);
  };

  reader.readAsArrayBuffer(file);
}

// ============================================
// EXAMPLE 6: Advanced - Custom Sheet Processing
// ============================================
export async function Example6_CustomSheetProcessing() {
  const file = /* ... get file ... */ as File;
  const sheets = await parseExcelFile(file);

  sheets.forEach(sheet => {
    switch (sheet.detectedType) {
      case 'review':
        processReviewSheet(sheet);
        break;
      case 'schedule':
        processScheduleSheet(sheet);
        break;
      case 'simple':
        processSimpleSheet(sheet);
        break;
    }
  });

  function processReviewSheet(sheet: NormalizedSheet) {
    console.log('Processing Review Sheet:', sheet.sheetName);
    
    // Group by date
    const byDate = new Map<string, typeof sheet.data>();
    sheet.data.forEach(row => {
      const date = row['Date_iso'] || row['Date'];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(row);
    });

    byDate.forEach((rows, date) => {
      console.log(`${date}: ${rows.length} rows`);
    });
  }

  function processScheduleSheet(sheet: NormalizedSheet) {
    console.log('Processing Schedule Sheet:', sheet.sheetName);
    
    // Group by slot
    const bySlot = new Map<number, typeof sheet.data>();
    sheet.data.forEach(row => {
      const slotNum = row['Slot_number'] || row['Slot Code_number'];
      if (slotNum) {
        if (!bySlot.has(slotNum)) bySlot.set(slotNum, []);
        bySlot.get(slotNum)!.push(row);
      }
    });

    bySlot.forEach((rows, slot) => {
      console.log(`Slot ${slot}: ${rows.length} rows`);
    });
  }

  function processSimpleSheet(sheet: NormalizedSheet) {
    console.log('Processing Simple Sheet:', sheet.sheetName);
    console.log(`Total rows: ${sheet.data.length}`);
    console.log(`Headers: ${sheet.headers.join(', ')}`);
  }
}

// ============================================
// EXAMPLE 7: React Hook for Excel Data
// ============================================
export function useExcelParser() {
  const [sheets, setSheets] = React.useState<NormalizedSheet[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const parseFile = async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const result = await parseExcelFile(file);
      setSheets(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { sheets, loading, error, parseFile };
}

// Usage:
export function Example7_UseHook() {
  const { sheets, loading, error, parseFile } = useExcelParser();

  return (
    <div>
      <input
        type="file"
        onChange={(e) => parseFile(e.target.files?.[0]!)}
        disabled={loading}
      />
      {error && <div className="error">{error}</div>}
      {sheets.map(sheet => (
        <div key={sheet.sheetName}>
          <h2>{sheet.sheetName}</h2>
          <p>{sheet.data.length} rows</p>
        </div>
      ))}
    </div>
  );
}

// ============================================
// EXAMPLE 8: Export Data to Different Formats
// ============================================
export function Example8_ExportData(sheets: NormalizedSheet[]) {
  // Export to CSV
  function exportToCSV(sheet: NormalizedSheet) {
    const headers = sheet.headers.join(',');
    const rows = sheet.data.map(row =>
      sheet.headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`;
        }
        return val;
      }).join(',')
    );
    return [headers, ...rows].join('\n');
  }

  // Export to JSON
  function exportToJSON(sheet: NormalizedSheet) {
    return JSON.stringify(sheet.data, null, 2);
  }

  // Download file
  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  sheets.forEach(sheet => {
    download(exportToCSV(sheet), `${sheet.sheetName}.csv`);
    download(exportToJSON(sheet), `${sheet.sheetName}.json`);
  });
}
