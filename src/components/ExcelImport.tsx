
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { readSheet } from '../services/appsScriptService';
import { configService, SemesterConfig } from '../services/configService';
import { detectSheetType, SheetTypeInfo } from '../utils/sheetTypeDetection';
import { DateFormat } from '../types';
import { sheetCacheService } from '../services/sheetCache';

interface ExcelImportProps {
  onDataLoaded: (data: {
    rawRows: string[][];
    sheetId: string;
    tabName: string;
    headerRowIndex: number;
    isDataMau: boolean;
    sheetType?: SheetTypeInfo;
    fetchTime?: string;
    isCached?: boolean; // 👈 Báo cho UI biết dữ liệu này từ cache hay mới fetch
  }) => void;
  onLoadingStart?: () => void;
  // ...
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
  dateFormat: DateFormat;
  setDateFormat: (format: DateFormat) => void;
  selectedSemesterId: string;
  setSelectedSemesterId: (id: string) => void;
  semesters: Record<string, SemesterConfig>;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({
  onDataLoaded,
  onLoadingStart,
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
  accessToken,
  dateFormat,
  setDateFormat,
  selectedSemesterId,
  setSelectedSemesterId,
  semesters
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedSemesters = React.useMemo(() => {
    return (Object.values(semesters) as SemesterConfig[]).sort((a, b) => {
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.semester.localeCompare(a.semester);
    });
  }, [semesters]);

  const processRawData = (rows: string[][], source: string, sourceTab?: string, fetchTime?: string, isCached?: boolean) => {
    if (!rows || rows.length === 0) {
      throw new Error('Dữ liệu trống');
    }

    // ✅ Detect sheet type based on tab name or sheet URL
    const sheetTypeInfo = detectSheetType(tabName || sheetUrl);

    // Extract Sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const actualSheetId = sheetIdMatch ? sheetIdMatch[1] : source;

    // ✅ Check if config explicitly defines sheet type
    const configSheetType = semesters[selectedSemesterId]?.sheetType;
    const finalSheetType = configSheetType ? (configSheetType === 'review' ? detectSheetType('review') : detectSheetType('council')) : sheetTypeInfo;

    // 🎯 AUTO-DETECT HEADER ROW (Especially for Review Mode)
    let detectedHeaderRowIndex = 0;
    if (finalSheetType.type === 'review' && rows.length > 0) {
      console.log('🔍 [ExcelImport] Scanning for Review Mode headers (Universal Detection)...');
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i].map(c => String(c || '').toLowerCase().trim());
        const codeCount = row.filter(c => c === 'code').length;
        const rev1Count = row.filter(c => c.includes('reviewer 1') || c.includes('gv 1')).length;
        
        // If we find 3 blocks on this row, treat it as the header row
        if (codeCount >= 3 || rev1Count >= 3) {
          console.log(`✅ [ExcelImport] Found Review Mode headers on row index ${i}`);
          detectedHeaderRowIndex = i;
          break;
        }
      }
    }

    onDataLoaded({
      rawRows: rows, 
      sheetId: actualSheetId,
      tabName: sourceTab || tabName || 'Sheet1',
      headerRowIndex: detectedHeaderRowIndex,
      isDataMau: finalSheetType.type === 'review',
      sheetType: finalSheetType,
      fetchTime: fetchTime,
      isCached: isCached // 👈 Truyền trạng thái cache
    });
  };

  const handleShowData = async (forceReload = false) => {
    if (!sheetUrl) return;

    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const actualSheetId = sheetIdMatch ? sheetIdMatch[1] : 'unknown';
    
    // 🕒 REFRESH THRESHOLD: If cache is older than 30 seconds, fetch fresh regardless
    const REFRESH_THRESHOLD = 30 * 1000; 

    if (!forceReload) {
      const cached = sheetCacheService.getFull(actualSheetId, tabName || 'Sheet1');
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < REFRESH_THRESHOLD) {
          console.log(`🚀 [ExcelImport] Loading from Cache (Age: ${Math.round(age/1000)}s):`, actualSheetId, tabName);
          processRawData(cached.data, 'Cache', tabName, undefined, true);
          return;
        }
        console.log(`🕦 [ExcelImport] Cache expired (${Math.round(age/1000)}s > 30s). Auto-refreshing...`);
      }
    } else {
      // 🚀 HARD RESET: Remove from local cache before fetching fresh
      console.log('🧹 [ExcelImport] Force Reload: Clearing local cache...');
      sheetCacheService.remove(actualSheetId, tabName || 'Sheet1');
    }

    onLoadingStart?.();
    setIsProcessing(true);
    setLoading(true);
    setError(null);

    try {
      console.log(`📡 [ExcelImport] Fetching Nuclear Fresh Data for ${actualSheetId} (Tab: ${tabName})...`);
      const response = await readSheet(sheetUrl, startRow, tabName) as any;
      const { data: rows, tabName: actualTab, rowCount, fetchTime: serverTime, isFresh } = response;
      
      const fetchTime = serverTime ? new Date(serverTime).toLocaleTimeString() : new Date().toLocaleTimeString();
      console.log(`✅ [ExcelImport] Data received: ${rowCount} rows. Server Time: ${fetchTime}${isFresh ? ' (NUCLEAR FRESH 🚀)' : ''}`);

      // ✅ Update the tabName state in parent to reflect reality
      if (actualTab && actualTab !== tabName) {
        setTabName(actualTab);
      }

      processRawData(rows, 'GoogleSheet', actualTab, fetchTime, false);
      
      // Save to cache
      sheetCacheService.set(actualSheetId, actualTab || 'Sheet1', rows);
      setError(null);
      
      // 🚀 Explicitly tell the user the data is fresh
      if (forceReload) {
        // We can't call showToast directly from here without passing it as prop, 
        // but the parent's handleDataLoaded will show a toast.
      }
    } catch (err: any) {
      console.error('Fetch data error:', err);
      setError(err.message || 'Không thể lấy dữ liệu từ Sheets');
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  // ✅ AUTO-SELECT newest semester if none selected
  useEffect(() => {
    if (!selectedSemesterId && sortedSemesters.length > 0) {
      const firstId = sortedSemesters[0].id;
      handleSemesterChange(firstId, semesters);
    }
  }, [sortedSemesters, selectedSemesterId]);

  // ✅ AUTO-LOAD when semester changes
  useEffect(() => {
    if (selectedSemesterId && sheetUrl) {
      handleShowData();
    }
  }, [selectedSemesterId, sheetUrl]);

  const handleSemesterChange = (semesterId: string, currentSemesters = semesters) => {
    setSelectedSemesterId(semesterId);
    setError(null); // Clear previous errors

    if (semesterId && currentSemesters[semesterId]) {
      const config = currentSemesters[semesterId];

      // ✅ TASK 3: Validate config before applying
      if (!config.sheetUrl) {
        setError('Cấu hình học kỳ thiếu URL Sheet');
        return;
      }
      if (!config.startRow) {
        setError('Cấu hình học kỳ thiếu dòng bắt đầu');
        return;
      }
      if (!config.columns) {
        setError('Cấu hình học kỳ thiếu danh sách cột');
        return;
      }

      setSheetUrl(config.sheetUrl);
      setStartRow(parseInt(config.startRow) || 1);
      setColumnsConfig(config.columns);
      if (config.tabName) {
        setTabName(config.tabName);
      }
      if (config.dateFormat) {
        setDateFormat(config.dateFormat);
      }
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
    <div className="flex flex-col gap-3 p-1">
      {/* Simplify Step 1: Just Semester Selection & Auto-load status */}
      <div className="flex flex-col sm:flex-row items-end gap-3">
        <div className="flex-1 w-full">
          <label className="block text-[10px] font-bold text-slate-400 mb-1.5 ml-1 uppercase tracking-widest">Chọn Học kỳ để lấy lịch</label>
          <div className="relative group">
            <select
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-fpt-orange outline-none text-sm font-bold text-slate-700 h-12 appearance-none transition-all group-hover:border-slate-300 pointer-events-auto cursor-pointer relative z-10"
              value={selectedSemesterId}
              onChange={(e) => handleSemesterChange(e.target.value)}
            >
              <option value="">-- Chọn học kỳ --</option>
              {sortedSemesters.map((s) => (
                <option key={s.id} value={s.id}>{s.semester}</option>
              ))}
            </select>
            <div className="absolute right-4 top-4.5 text-slate-400 pointer-events-none group-focus-within:text-fpt-orange transition-colors text-xs font-bold">
              V
            </div>
          </div>
        </div>


        <div className="flex-none flex items-center gap-2 mb-0.5">
          <button
            onClick={() => handleShowData(true)}
            disabled={isProcessing || !sheetUrl}
            className="px-6 h-12 bg-[#F27024] text-white rounded-xl hover:bg-orange-600 active:scale-95 transition-all font-bold shadow-lg shadow-orange-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none min-w-[140px]"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-wider">Tải lại</span>
              </>
            )}
          </button>

        </div>
      </div>


      {isProcessing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg animate-pulse border border-orange-100">
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
          <span className="text-[9px] font-bold text-orange-600 uppercase tracking-widest">Đang tải dữ liệu từ Google Sheets...</span>
        </div>
      )}
    </div>
  );
};
