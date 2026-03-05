
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
  
  // ✅ ATOMIC SWAP: Local state to prevent immediate parent update
  const [tempSemesterId, setTempSemesterId] = useState(selectedSemesterId);
  
  // Sync local selection with parent (e.g. on mount or force reset)
  useEffect(() => {
    setTempSemesterId(selectedSemesterId);
  }, [selectedSemesterId]);

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

  const lastLoadedRef = useRef<string>('');

  const handleShowData = async (forceReload = false, pSemesterId?: string) => {
    // 🏛️ Determine target config (manual override or selected)
    const targetId = pSemesterId || tempSemesterId || selectedSemesterId;
    const config = semesters[targetId];
    
    const targetUrl = config?.sheetUrl || sheetUrl;
    const targetTab = config?.tabName || tabName;
    const targetStartRow = config?.startRow ? parseInt(config.startRow) : startRow;

    if (!targetUrl) return;

    const sheetIdMatch = targetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const actualSheetId = sheetIdMatch ? sheetIdMatch[1] : 'unknown';
    
    // 🕒 REFRESH THRESHOLD: 30 seconds
    const REFRESH_THRESHOLD = 30 * 1000; 

    if (!forceReload) {
      const cached = sheetCacheService.getFull(actualSheetId, targetTab || 'Sheet1');
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < REFRESH_THRESHOLD) {
          console.log(`🚀 [ExcelImport] Cache Hit (${Math.round(age/1000)}s):`, actualSheetId, targetTab);
          
          // ✅ ATOMIC COMMIT: Update parent only WHEN data is ready
          if (pSemesterId) commitSemesterChange(pSemesterId);
          
          processRawData(cached.data, 'Cache', targetTab, undefined, true);
          lastLoadedRef.current = `${targetUrl}-${targetTab || 'Sheet1'}`;
          return;
        }
      }
    }

    onLoadingStart?.();
    setIsProcessing(true);
    setLoading(true);
    setError(null);

    try {
      console.log(`📡 [ExcelImport] Fetching Data for ${actualSheetId} (Tab: ${targetTab})...`);
      const response = await readSheet(targetUrl, targetStartRow, targetTab) as any;
      const { data: rows, tabName: actualTab, rowCount, fetchTime: serverTime } = response;
      
      const fetchTime = serverTime ? new Date(serverTime).toLocaleTimeString() : new Date().toLocaleTimeString();

      // ✅ ATOMIC COMMIT: Update EVERYTHING at once on success
      if (pSemesterId) {
        commitSemesterChange(pSemesterId, actualTab);
      } else if (actualTab && actualTab !== tabName) {
        setTabName(actualTab);
      }

      processRawData(rows, 'GoogleSheet', actualTab, fetchTime, false);
      sheetCacheService.set(actualSheetId, actualTab || 'Sheet1', rows);
      lastLoadedRef.current = `${targetUrl}-${actualTab || 'Sheet1'}`;
    } catch (err: any) {
      setError(err.message || 'Không thể lấy dữ liệu từ Sheets');
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  const commitSemesterChange = (id: string, actualTab?: string) => {
    const config = semesters[id];
    if (!config) return;

    setSelectedSemesterId(id);
    setSheetUrl(config.sheetUrl);
    setStartRow(parseInt(config.startRow) || 1);
    setColumnsConfig(config.columns);
    setTabName(actualTab || config.tabName || 'Sheet1');
    if (config.dateFormat) setDateFormat(config.dateFormat);
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
    const currentKey = `${sheetUrl}-${tabName}`;
    if (selectedSemesterId && sheetUrl && lastLoadedRef.current !== currentKey) {
      handleShowData();
    }
  }, [selectedSemesterId, sheetUrl, tabName]);

  const handleSemesterChange = (semesterId: string, currentSemesters = semesters) => {
    setTempSemesterId(semesterId); // ✅ Update locally immediately
    setError(null);

    const config = currentSemesters[semesterId];
    if (config) {
      if (!config.sheetUrl) return setError('Cấu hình học kỳ thiếu URL Sheet');
      handleShowData(false, semesterId); // ✅ Fetch BEFORE updating parent
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
      <div className="flex flex-col gap-4">
        <div className="w-full">
          <div className="relative group">
            <select
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none text-[12px] font-semibold text-slate-700 h-11 appearance-none transition-all group-hover:border-slate-300 cursor-pointer shadow-sm relative z-10"
              value={tempSemesterId}
              onChange={(e) => handleSemesterChange(e.target.value)}
            >
              <option value="" className="text-xs">-- Học kỳ --</option>
              {sortedSemesters.map((s) => (
                <option key={s.id} value={s.id}>{s.semester}</option>
              ))}
            </select>
            <div className="absolute left-3.5 top-3.5 text-slate-400 z-20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div className="absolute right-3.5 top-4 text-slate-300 pointer-events-none group-focus-within:text-blue-500 transition-colors text-[10px] font-bold z-20">
              ▼
            </div>
          </div>
        </div>

        <button
          onClick={() => handleShowData(true)}
          disabled={isProcessing || !sheetUrl}
          className="w-full h-11 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl active:scale-[0.98] transition-all font-bold shadow-sm flex items-center justify-center gap-2.5 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none min-w-[110px] text-[11px] uppercase tracking-wider relative overflow-hidden"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-blue-600">Đang đồng bộ</span>
            </div>
          ) : (
            <>
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              <span>Tải lại</span>
            </>
          )}
        </button>
      </div>

      {isProcessing && (
        <div className="px-3 py-2 bg-blue-50/50 border border-blue-100/50 rounded-xl animate-pulse">
          <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest text-center">Đang nạp dữ liệu từ Cloud...</p>
        </div>
      )}
    </div>
  );
};
