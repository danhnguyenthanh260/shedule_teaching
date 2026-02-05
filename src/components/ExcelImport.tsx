
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { readSheet } from '../services/appsScriptService';
import { configService, SemesterConfig } from '../services/configService';
import { detectSheetType, SheetTypeInfo } from '../utils/sheetTypeDetection';

interface ExcelImportProps {
  onDataLoaded: (data: {
    rawRows: string[][];
    sheetId: string;
    tabName: string;
    headerRowIndex: number;
    isDataMau: boolean;
    sheetType?: SheetTypeInfo;
  }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  sheetUrl: string;
  setSheetUrl: (url: string) => void;
  tabName: string;
  setTabName: (tab: string) => void;
  startRow: number;
  setStartRow: (row: number) => void;
  columnsConfig: string;
  setColumnsConfig: (cols: string) => void;
  accessToken: string | null;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({
  onDataLoaded,
  setLoading,
  setError,
  sheetUrl,
  setSheetUrl,
  tabName,
  setTabName,
  startRow,
  setStartRow,
  columnsConfig,
  setColumnsConfig,
  accessToken
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [semesters, setSemesters] = useState<Record<string, SemesterConfig>>({});
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch configs on mount
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        setLoading(true);
        setError(null);
        const configs = await configService.fetchConfigs();
        setSemesters(configs);

        // Auto-select first semester if available
        const firstId = Object.keys(configs)[0];
        if (firstId) {
          handleSemesterChange(firstId, configs);
        }
      } catch (err: any) {
        // ✅ TASK 2 & 3: Show error immediately if config fetch fails
        const errorMsg = err.message || '❌ Không thể tải danh sách học kỳ';
        setError(errorMsg);
        console.error('Failed to fetch configs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, []);

  // ✅ AUTO-LOAD when semester changes
  useEffect(() => {
    if (selectedSemesterId && sheetUrl) {
      handleShowData();
    }
  }, [selectedSemesterId]);

  const handleSemesterChange = (semesterId: string, currentSemesters = semesters) => {
    setSelectedSemesterId(semesterId);
    setError(null); // Clear previous errors

    if (semesterId && currentSemesters[semesterId]) {
      const config = currentSemesters[semesterId];

      // ✅ TASK 3: Validate config before applying
      if (!config.sheetUrl) {
        setError('❌ Cấu hình học kỳ thiếu URL Sheet');
        return;
      }
      if (!config.startRow) {
        setError('❌ Cấu hình học kỳ thiếu dòng bắt đầu');
        return;
      }
      if (!config.columns) {
        setError('❌ Cấu hình học kỳ thiếu danh sách cột');
        return;
      }

      setSheetUrl(config.sheetUrl);
      setStartRow(parseInt(config.startRow) || 1);
      setColumnsConfig(config.columns);
    }
  };

  const processRawData = (rows: string[][], source: string) => {
    if (!rows || rows.length === 0) {
      throw new Error('❌ Dữ liệu trống');
    }

    const isReviewMode = tabName.toLowerCase().includes('review');

    // ✅ Detect sheet type based on tab name or sheet URL
    const sheetType = detectSheetType(tabName || sheetUrl);

    // ✅ SMART FILTERING: For Review Mode, check if first 9 columns contain "Project Info"
    // If yes, slice all rows to remove columns A-I (index 0-8)
    let processedRows = rows;

    // Extract Sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const currentSheetId = sheetIdMatch ? sheetIdMatch[1] : '';

    // "Data Mẫu" Sheet ID - only apply filtering to this specific sheet
    const DATA_MAU_SHEET_ID = '1nshAfx6vf11FUDOTOTiLu0D-zulNfM5uKoCI0A106Sk';

    if (currentSheetId === DATA_MAU_SHEET_ID && rows.length > 0) {
      const firstRow = rows[0];
      const firstColumns = firstRow.slice(0, 9).map(h => String(h || '').toLowerCase().trim());
      const projectInfoKeywords = ['stt', 'mã nhóm', 'mã đề tài', 'tên đề tài', 'gvhd'];
      const hasProjectInfoGarbage = firstColumns.filter(h =>
        projectInfoKeywords.some(k => h.includes(k))
      ).length >= 2;

      if (hasProjectInfoGarbage) {
        // Slice all rows to remove first 9 columns (A-I)
        processedRows = rows.map(row => row.slice(9));
        console.log('✂️ Review Mode: Removed columns A-I (Project Info). Remaining columns:', processedRows[0]?.length);
      }
    }

    onDataLoaded({
      rawRows: processedRows,
      sheetId: source,
      tabName: tabName || 'Sheet1',
      headerRowIndex: 0, // ✅ FIX: readSheet already starts from startRow, so first row is header
      isDataMau: isReviewMode,
      sheetType: sheetType
    });
  };

  const handleShowData = async () => {
    // ✅ TASK 3: Strict validation before proceeding
    if (!sheetUrl) {
      setError('❌ Vui lòng chọn học kỳ hoặc nhập URL Sheet');
      return;
    }

    setIsProcessing(true);
    setLoading(true);
    setError(null);

    try {
      const rows = await readSheet(sheetUrl, startRow);
      processRawData(rows, 'GoogleSheet');
      // ✅ TASK 2: Only show success if actually successful
      setError(null);

      // 🔍 DEBUG: Log raw data validation
      console.log('🔍 Loaded Rows (First 5):', rows.slice(0, 5));
      console.log('🔍 Columns detected:', rows[0] ? rows[0].map((c, i) => `${i}:${c}`).join('|') : 'Empty');

    } catch (err: any) {
      // ✅ TASK 2: Always show error in red, never success
      console.error('Fetch data error:', err);
      const errorMsg = err.message || '❌ Không thể lấy dữ liệu từ Sheets';
      setError(errorMsg);
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

        processRawData(data, 'LocalFile');
      } catch (err: any) {
        console.error('XLSX process error:', err);
        setError('Lỗi đọc file Excel: ' + err.message);
      } finally {
        setIsProcessing(false);
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setError('Lỗi khi đọc file.');
      setIsProcessing(false);
      setLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Simplify Step 1: Just Semester Selection & Auto-load status */}
      <div className="flex flex-col sm:flex-row items-end gap-3">
        <div className="flex-1 w-full">
          <label className="block text-[10px] font-black text-slate-400 mb-1.5 ml-1 uppercase tracking-widest">Chọn Học kỳ để lấy lịch</label>
          <div className="relative group">
            <select
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-fpt-orange outline-none text-sm font-bold text-slate-700 h-12 shadow-sm appearance-none transition-all group-hover:border-slate-300"
              value={selectedSemesterId}
              onChange={(e) => handleSemesterChange(e.target.value)}
            >
              <option value="">-- Chọn học kỳ --</option>
              {(Object.values(semesters) as SemesterConfig[]).map((s) => (
                <option key={s.id} value={s.id}>{s.semester}</option>
              ))}
            </select>
            <div className="absolute right-4 top-4 text-slate-400 pointer-events-none group-focus-within:text-fpt-orange transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        <div className="flex-none flex items-center gap-2 mb-0.5">
          <button
            onClick={handleShowData}
            disabled={isProcessing || !sheetUrl}
            className="px-6 h-12 bg-[#F27024] text-white rounded-xl hover:bg-orange-600 active:scale-95 transition-all font-black shadow-lg shadow-orange-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none min-w-[140px]"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-[10px] uppercase tracking-wider">Tải lại</span>
              </>
            )}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-12 h-12 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center border border-slate-200 shadow-sm"
            title="Tải file .xlsx từ máy"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx, .xls"
            />
          </button>
        </div>
      </div>

      {/* Admin Info (Hidden but functional) - You could also just remove these inputs if they are not needed for teachers to edit at all */}
      {/* 
      <div className="hidden">
        <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
        <input value={startRow} onChange={e => setStartRow(parseInt(e.target.value))} />
        <input value={columnsConfig} onChange={e => setColumnsConfig(e.target.value)} />
      </div> 
      */}

      {isProcessing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg animate-pulse border border-orange-100">
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
          <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Đang tải dữ liệu từ Google Sheets...</span>
        </div>
      )}
    </div>
  );
};
