
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ExcelImport } from '../../../components/ExcelImport';
import { MappingTool } from '../../../components/MappingTool';
import { ScheduleTable } from '../../../components/ScheduleTable';
import { StatusAlerts } from '../../../components/StatusAlerts';
import SyncHistoryModal from '../../../components/SyncHistoryModal';
import { useFirebaseMapping } from '../../../hooks/useFirebaseMapping';
import { useAppPersistence } from '../../../hooks/useAppPersistence';
import { ColumnMapping, RowNormalized, SyncResult, DateFormat } from '../../../types';
import { useFirebase } from '../../../context/FirebaseContext';
import { useSheetParser } from '../../../hooks/useSheetParser';
import { useSyncLogs } from '../../../hooks/useSyncLogs';
import { useCalendarSync } from '../../../hooks/useCalendarSync';
import { khongDau } from '../../../utils/stringUtils';
import { googleService, inferSchema } from '../../../services/googleService';
import { SearchColumnSelector } from '../../../components/SearchColumnSelector';
import { isAdmin, isSuperAdmin } from '../../../config/admin';
import { database } from '../../../config/firebase';
import { ref, set, get } from 'firebase/database';
import { configService, SemesterConfig } from '../../../services/configService';

export const LecturerDashboard: React.FC = () => {
  const { user: firebaseUser, accessToken } = useFirebase();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [refreshHistory] = useState(0);

  // Semesters & Local state
  const [semesters, setSemesters] = useState<Record<string, SemesterConfig>>({});
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Persistence (localStorage)
  const persistence = useAppPersistence();
  const {
    sheetUrl, setSheetUrl,
    tabName, setTabName,
    sheetMeta, setSheetMeta,
    headerRowIndex, setHeaderRowIndex,
    columnMap, setColumnMap,
    personFilter, setPersonFilter,
    startRow, setStartRow,
    columnsConfig, setColumnsConfig,
    allRows, setAllRows,
    fullHeaders, setFullHeaders,
    fullDetailHeaders, setFullDetailHeaders,
    setTitleRow,
    setFullRows,
    selectedIds, setSelectedIds,
    dateFormat, setDateFormat,
    searchColumnIndices, setSearchColumnIndices,
    selectedSemesterId, setSelectedSemesterId,
    sheetType, setSheetType,
    isRestored,
  } = persistence;

  // Determine effective mode: Admin Config > Local Heuristic
  const effectiveIsReview = useMemo(() => {
    const fromConfig = semesters[selectedSemesterId]?.sheetType;
    if (fromConfig) return fromConfig === 'review';
    return !!sheetMeta?.isDataMau;
  }, [semesters, selectedSemesterId, sheetMeta]);

  // Hooks
  const {
    loading,
    rows, setRows,
    error: parserError, setError: setParserError,
    applyHeaderRow,
    applyMapping,
    headerOptions,
    headerRowOptions,
    effectiveSearchColumns
  } = useSheetParser({
    allRows,
    tabName,
    sheetMeta,
    setSheetMeta,
    headerRowIndex,
    setHeaderRowIndex,
    setFullHeaders,
    setFullDetailHeaders,
    setTitleRow,
    setFullRows,
    fullHeaders,
    fullDetailHeaders,
    dateFormat, // 👈 Restore missing prop
    searchColumnIndices,
    setSearchColumnIndices,
    isReviewMode: effectiveIsReview,
    isUserAdmin: isAdmin(firebaseUser?.email) || isSuperAdmin(firebaseUser?.email), // 🏛️ More robust admin check
    currentMapping: columnMap // 🔒 Keep mapped columns visible
  });

  const { saveSyncLog } = useSyncLogs();
  const {
    syncing,
    clearing,
    syncResult, setSyncResult,
    syncError, setSyncError,
    syncToCalendar,
    clearAppEvents
  } = useCalendarSync({ accessToken });

  // Toast State
  
  // Fetch semesters on mount
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const configs = await configService.fetchConfigs();
        setSemesters(configs);
      } catch (e) {
        console.error('Failed to fetch configs:', e);
      }
    };
    fetchConfigs();
  }, [selectedSemesterId]);

  // Confirmation State
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const [appliedColumnMap, setAppliedColumnMap] = useState<ColumnMapping>({});

  // Sync appliedColumnMap with persistence columnMap whenever it changes (especially for Admin)
  useEffect(() => {
    if (Object.keys(columnMap).length > 0) {
      setAppliedColumnMap(columnMap);
    }
  }, [columnMap]);

  // ✅ Create a unique ID for each sheet-tab combination to prevent settings overlap
  const mappingId = useMemo(() => {
    if (!sheetMeta?.sheetId) return undefined;
    const cleanTab = (tabName || 'Sheet1').replace(/[^a-zA-Z0-9]/g, '');
    const mode = sheetMeta.sheetType?.type || 'council';
    return `${sheetMeta.sheetId}-${cleanTab}-${mode}`;
  }, [sheetMeta?.sheetId, tabName, sheetMeta?.sheetType?.type]);

  // Firebase Mapping Sync
  const {
    mapping: savedMapping,
    savedHeaderRowIndex,
    loading: mappingLoading,
    saveMapping: saveFirebaseMapping
  } = useFirebaseMapping(mappingId);

  // ✅ 1. HANDLE DATA LOADED
  const handleDataLoaded = useCallback((data: any) => {
    // 🛡️ Pre-emptive cleanup
    setRows([]);
    setColumnMap({});
    setAppliedColumnMap({});
    lastAppliedMappingId.current = null; // 🚨 Reset chốt chặn
    setSelectedIds(new Set());
    setParserError(null);
    setSyncError(null);

    // 🛡️ Pre-emptive mode detection to prevent flicker
    const fromConfig = semesters[selectedSemesterId]?.sheetType;
    const isActuallyReview = fromConfig ? fromConfig === 'review' : data.isDataMau;

    setAllRows(data.rawRows);
    setSheetMeta({
      sheetId: data.sheetId,
      tab: data.tabName,
      headerRowIndex: data.headerRowIndex,
      isDataMau: isActuallyReview,
      sheetType: data.sheetType
    });
    setSheetType(data.sheetType || null);
    applyHeaderRow(data.headerRowIndex, data.rawRows, { sheetId: data.sheetId, tab: data.tabName });
    
    // 🚨 Don't force isPreviewMode=true if we are switching semesters, 
    // let the Sync effect decide based on the presence of mapping.
    if (!selectedSemesterId) {
      setIsPreviewMode(true);
    }

    showToast(`✓ Đã tải ${data.rawRows.length} dòng dữ liệu (${isActuallyReview ? 'Review Mode' : 'Normal'})`);
  }, [semesters, selectedSemesterId, setSheetMeta, setSheetType, applyHeaderRow, showToast]);

  // Filtering Logic
  const updateSelections = useCallback((data: RowNormalized[], filterValue?: string) => {
    const fValue = filterValue !== undefined ? filterValue : personFilter;
    const rawFilter = (fValue || '').trim();

    if (!rawFilter) {
      setSelectedIds(new Set(data.map(r => r.id)));
      return;
    }

    const filters = rawFilter.split(/\s+/).map(f => khongDau(f)).filter(Boolean);
    const matches = data.filter(row => {
      const searchValues = (searchColumnIndices && searchColumnIndices.length > 0)
        ? searchColumnIndices.map(idx => row.rawRow[idx] || "")
        : effectiveSearchColumns.map(idx => row.rawRow[idx] || "");
        
      const searchSpace = [
        ...searchValues,
        row.person,
        row.groupName
      ].map(v => khongDau(v)).join(' ');

      return filters.every(f => searchSpace.includes(f));
    });

    setSelectedIds(new Set(matches.map(m => m.id)));
  }, [personFilter, setSelectedIds, effectiveSearchColumns, searchColumnIndices]);

  // ✅ Filter display rows for both Preview and Mapped modes
  const previewRows = useMemo(() => {
    if (!isPreviewMode || allRows.length === 0) return [];

    console.log('[Dashboard] previewRows - effectiveIsReview:', effectiveIsReview, 'tabName:', tabName);

    // ✅ If Review Mode, use the grouping expansion even for preview
    if (effectiveIsReview) {
      const expandedPreview = googleService.normalizeRowsWithGrouping({
        sheetId: sheetMeta?.sheetId || 'preview',
        tab: tabName,
        detailHeaders: fullDetailHeaders,
        rawRows: allRows,
        mapping: {}, // No mapping yet
        headerRowIndex,
        isDataMau: true, // Force expansion
        preferredFormat: dateFormat
      });
      console.log('[Dashboard] expandedPreview count:', expandedPreview.length);
      return expandedPreview;
    }

    const dataOnly = allRows.slice(headerRowIndex + 1);
    return dataOnly.map((r, idx) => {
      const actualIdx = idx + headerRowIndex + 1;
      const cleanTab = (tabName || 'Sheet1').replace(/[^a-zA-Z0-9]/g, '');
      return {
        id: `row-${sheetMeta?.sheetId?.substring(0, 5) || 'preview'}-${cleanTab}-${actualIdx}`,
        date: r[0] || '',
        startTime: r[1] || '',
        endTime: '',
        person: r[2] || '',
        rawRow: r,
      } as RowNormalized;
    });
  }, [isPreviewMode, allRows, headerRowIndex, sheetMeta, tabName, fullDetailHeaders, dateFormat]);

  const baseRows = isPreviewMode ? previewRows : rows;

  const filteredRows = useMemo(() => {
    const rawFilter = (personFilter || '').trim();
    if (!rawFilter) return baseRows;

    const filters = khongDau(rawFilter.toLowerCase()).split(/\s+/).filter(Boolean);

    return baseRows.filter(row => {
      let searchValues: any[] = [];
      
      const indicesToUse = (searchColumnIndices && searchColumnIndices.length > 0) 
        ? searchColumnIndices 
        : (isPreviewMode ? [] : effectiveSearchColumns);

      if (isPreviewMode && indicesToUse.length === 0) {
        searchValues = row.rawRow || [];
      } else {
        searchValues = indicesToUse.map(idx => {
           // 🔒 Shifted Isolation Logic: 
           // If it's a review event and the search column is in the Review Area (J+):
           if (row.blockStart !== undefined && row.reviewAreaStart !== undefined && idx >= row.reviewAreaStart) {
              // 1. Calculate offset relative to the FIRST block start
              const relativeOffset = idx - row.reviewAreaStart;
              // 2. Project this offset onto the CURRENT event's block
              const targetIdx = row.blockStart + relativeOffset;
              
              // 3. Extract if within valid range
              if (targetIdx <= (row.blockEnd || 999)) {
                return (row.rawRow?.[targetIdx] || "").toString();
              }
              return "";
           }
           
           // Otherwise (Global or Standard mode), search exactly what was selected
           return (row.rawRow?.[idx] || "").toString();
        });
      }
      
      const searchSpace = [
        ...searchValues,
        row.person,
        row.groupName,
        row.location,
        row.date,
        row.task
      ].map(v => khongDau(String(v || ""))).join(' ');

      // Use .every() to ensure all word tokens are present in the search space
      return filters.every(f => searchSpace.includes(f));
    });
  }, [baseRows, personFilter, effectiveSearchColumns, isPreviewMode, searchColumnIndices]);

  // ✅ 2. CALLBACK HANDLERS (Must be at top level)
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedIds]);

  const handleToggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === filteredRows.length) return new Set();
      return new Set(filteredRows.map(r => r.id));
    });
  }, [filteredRows, setSelectedIds]);

  // ✅ 1. ULTIMATE SYNC EFFECT: Handles restore, semester switch, and manual column updates
  const lastAppliedMappingId = useRef<string | null>(null);
  const lastAppliedDateFormat = useRef<DateFormat | null>(null);

  useEffect(() => {
    // 🛡️ Guard Clause
    if (!isRestored || !mappingId || allRows.length === 0 || mappingLoading) {
      if (mappingLoading) setRows([]); 
      return;
    }

    const isNewMappingId = lastAppliedMappingId.current !== mappingId;
    const isNewDateFormat = lastAppliedDateFormat.current !== dateFormat;
    
    // Choose which mapping to use
    let targetMapping: ColumnMapping = {};
    let shouldApply = false;

    if (savedMapping && Object.keys(savedMapping).length > 0) {
      targetMapping = savedMapping;
      shouldApply = true;
    } else {
      const configMapping = semesters[selectedSemesterId]?.mapping;
      if (configMapping && Object.keys(configMapping).length > 0) {
        targetMapping = configMapping;
        shouldApply = true;
      }
    }

    // Always apply if it's new, changed, or it's manual trigger (appliedColumnMap)
    if (shouldApply) {
       console.log('📥 [Sync] Applying Mapping for', mappingId);
       setColumnMap(targetMapping);
       setAppliedColumnMap(targetMapping);
       applyMapping(targetMapping, effectiveIsReview);
       setIsPreviewMode(false);
    } else {
       console.log('🧹 [Sync] Entering Preview Mode for', mappingId);
       setColumnMap({});
       setAppliedColumnMap({});
       applyMapping({}, effectiveIsReview); // 🚀 Ensure preview rows populated
       setIsPreviewMode(true);
    }

    lastAppliedMappingId.current = mappingId;
    lastAppliedDateFormat.current = dateFormat;
  }, [
    isRestored,
    mappingId, 
    savedMapping, 
    mappingLoading,
    allRows.length, 
    semesters, 
    selectedSemesterId,
    effectiveIsReview,
    dateFormat,
    applyMapping 
  ]);

  // Dynamic column labels based on applied mapping
  const columnLabels = useMemo(() => {
    const labels: any = {};
    if (appliedColumnMap && headerOptions) {
      Object.entries(appliedColumnMap).forEach(([field, index]) => {
        const header = headerOptions.find(h => h.value === index);
        if (header && header.label) {
          labels[field] = header.label;
        }
      });
    }
    return labels;
  }, [appliedColumnMap, headerOptions]);

  // ✅ 3. Update selections whenever rows change (Mapping applied or loaded)
  useEffect(() => {
    if (rows.length > 0) {
      updateSelections(rows);
    }
  }, [rows]);

  const handleSync = async () => {
    let rowsToSync = filteredRows.filter(r => selectedIds.has(r.id));
    
    // 🚨 QUAN TRỌNG: Nếu đang ở preview mode, các dòng trong filteredRows (previewRows) 
    // có thể thiếu dữ liệu ánh xạ chuẩn. Cần ánh xạ lại "nóng" trước khi gửi đi.
    if (isPreviewMode) {
      if (!columnMap.date || !columnMap.time) {
        setSyncError("Vui lòng cấu hình cột Ngày và Giờ ở Bước 2 trước khi đồng bộ.");
        return;
      }
      
      const realRows = applyMapping(columnMap, sheetMeta?.isDataMau || false);
      if (realRows) {
        console.log(`🔄 handleSync (Preview): Selected IDs:`, Array.from(selectedIds));
        console.log(`🔄 handleSync (Preview): Available Row IDs:`, realRows.map(r => r.id));
        rowsToSync = realRows.filter(r => selectedIds.has(r.id));
      }
    }

    console.log(`🚀 Final rows to sync: ${rowsToSync.length}`);

    if (rowsToSync.length === 0) {
      setSyncError("Không tìm thấy mục nào hợp lệ để đồng bộ. Hãy kiểm tra lại ánh xạ cột.");
      return;
    }

    try {
      const result = await syncToCalendar(rowsToSync);
      if (result) {
        if (firebaseUser && sheetMeta) {
          saveSyncLog({
            userId: firebaseUser.uid,
            sheetId: sheetMeta.sheetId,
            tabName: sheetMeta.tab,
            totalRows: rowsToSync.length,
            syncResult: result
          });
        }
      }
    } catch (err: any) {
      // syncToCalendar already sets syncError
    }
  };

  if (!firebaseUser) return null;

  return (
    <div className="h-full flex flex-col gap-4 relative overflow-visible text-slate-900 bg-slate-50/50">
      {/* Header Section: Steps 1 & 2 side-by-side (Approx 1/4 of screen) */}
      <div className="flex-none flex flex-col lg:flex-row gap-3">
        {/* Step 1: Import */}
        <section className="lg:w-[42%] bg-white p-4 rounded-3xl border border-slate-100 flex flex-col relative z-[50] border-b-4 border-b-slate-100/50">
          <h2 className="text-[10px] font-bold text-[#F27024] mb-1.5 flex items-center gap-2 uppercase tracking-[0.2em] flex-none">
            <span className="w-4 h-4 bg-[#F27024] text-white rounded-md flex items-center justify-center text-[10px] shadow-sm font-bold">1</span>
            Dữ liệu
          </h2>
          <div className="flex-1 overflow-visible p-0.5">
            <ExcelImport
              accessToken={accessToken}
              onDataLoaded={handleDataLoaded}
              setLoading={() => {}} // Handle locally if needed
              setError={setParserError}
              sheetUrl={sheetUrl}
              setSheetUrl={setSheetUrl}
              tabName={tabName}
              setTabName={setTabName}
              startRow={startRow}
              setStartRow={setStartRow}
              columnsConfig={columnsConfig}
              setColumnsConfig={setColumnsConfig}
              dateFormat={dateFormat}
              setDateFormat={setDateFormat}
              selectedSemesterId={selectedSemesterId}
              setSelectedSemesterId={setSelectedSemesterId}
              semesters={semesters}
            />
          </div>
        </section>

        {allRows.length > 0 && isAdmin(firebaseUser?.email) ? (
          <section className="lg:w-[58%] bg-white p-4 rounded-3xl border border-slate-100 flex flex-col relative z-[50] border-b-4 border-b-slate-100/50">
            <h2 className="text-[10px] font-bold text-slate-700 mb-2 flex items-center gap-2 uppercase tracking-[0.2em] flex-none">
              <span className="w-4 h-4 bg-slate-700 text-white rounded-md flex items-center justify-center text-[10px] shadow-sm font-bold">2</span>
              Cấu hình (Quyền Admin)
            </h2>
            <div className="flex-1 overflow-visible p-0.5">
              <MappingTool
                headers={headerOptions}
                headerRowOptions={headerRowOptions}
                headerRowIndex={headerRowIndex}
                onHeaderRowChange={(idx) => applyHeaderRow(idx, allRows)}
                columnMap={columnMap}
                setColumnMap={setColumnMap}
                onApply={async () => {
                  setAppliedColumnMap(columnMap);
                  setIsPreviewMode(false);
                  
                  try {
                    // 1. Save Column Mapping (User-specific persistence)
                    if (mappingId) {
                      await saveFirebaseMapping(mappingId, columnMap, headerRowIndex);
                    }

                    // 2. Save Global Semester Config (Because user IS Admin)
                    if (selectedSemesterId) {
                      const currentConfig = semesters[selectedSemesterId];
                      if (currentConfig) {
                        const configRef = ref(database, `configs/${selectedSemesterId}`);
                        await set(configRef, {
                          ...currentConfig,
                          startRow: startRow.toString(),
                          columns: columnsConfig,
                          mapping: columnMap // 🏛️ Save this as global mapping for all users
                        });
                        showToast('✓ Đã lưu cấu hình ánh xạ mặc định cho học kỳ');
                      }
                    }
                  } catch (err: any) {
                    showToast('❌ Lỗi khi lưu cấu hình');
                  }
                }}
                isLoading={loading}
              />
            </div>
          </section>
        ) : allRows.length > 0 ? (
          /* Lecturers don't see Step 2, they see a clean welcome/info banner */
          <div className="lg:w-[58%] bg-[#F27024]/5 border border-[#F27024]/10 rounded-3xl flex flex-col items-center justify-center p-8 text-center gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-xl shadow-orange-100 flex items-center justify-center text-[#F27024] text-3xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-1 uppercase tracking-wider">Chọn học kỳ & Bắt đầu</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed max-w-[300px]">
                Mọi thứ đã được Admin thiết lập sẵn. Vui lòng nhập tên của bạn ở Bước 3 để lọc lịch giảng dạy.
              </p>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-7 bg-slate-100/50 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center p-4 grayscale opacity-60">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Hoàn thành bước 1 để bắt đầu</p>
          </div>
        )}
      </div>

      {/* Step 3: Preview & Sync (Approx 3/4 of screen) */}
      {(rows.length > 0 || (allRows.length > 0 && isPreviewMode)) && (
        <section className="flex-1 min-h-0 bg-white p-4 rounded-3xl border border-slate-100 flex flex-col relative z-[60] overflow-visible">
          <div className="flex-none flex items-center justify-between gap-3 mb-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-600 text-white rounded-xl flex items-center justify-center text-xs shadow-lg shadow-orange-100 font-bold">3</div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight leading-tight">Kiểm tra & Đồng bộ</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                  {isPreviewMode ? 'Chế độ xem trước (Dữ liệu thô)' : `Sẵn sàng: ${filteredRows.length} mục`}
                </p>
              </div>
            </div>

              <div className="flex items-center gap-3">
                {mappingLoading && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold animate-pulse border border-orange-100 italic">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang tải cấu hình học kỳ...
                  </div>
                )}
                
                <div className="relative group flex items-center gap-2">
                <div className="relative">
                  <div className="absolute left-3 top-2 text-slate-400 group-focus-within:text-[#F27024] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Lọc tên giảng viên..."
                    className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none w-64 transition-all focus:bg-white font-bold text-slate-800 placeholder:text-slate-400 pointer-events-auto cursor-text relative z-[100]"
                    value={personFilter}
                    onChange={(e) => {
                      setPersonFilter(e.target.value);
                      updateSelections(rows, e.target.value);
                    }}
                  />
                </div>

                <SearchColumnSelector
                  headers={headerOptions}
                  selectedIndices={searchColumnIndices}
                  onSelectionChange={setSearchColumnIndices}
                />
              </div>

              <button
                onClick={handleSync}
                disabled={syncing || clearing || selectedIds.size === 0}
                className="px-5 py-2.5 bg-[#F27024] text-white rounded-xl font-bold hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:border-slate-200 border border-transparent transition-all shadow-lg shadow-orange-200 flex items-center gap-2 text-[11px] uppercase tracking-wider"
              >
                {syncing ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Đồng bộ ({selectedIds.size})
                  </>
                )}
              </button>

              {isConfirmingClear ? (
                <div className="flex items-center bg-rose-50 border border-rose-100 rounded-xl p-0.5 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                  <span className="hidden sm:inline px-2 py-1 text-[9px] font-extrabold text-rose-500 uppercase tracking-tight">Xóa sạch?</span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setIsConfirmingClear(false);
                      try {
                        const res = await clearAppEvents();
                        if (res) showToast("✓ Đã xóa sạch lịch cũ thành công!");
                      } catch (e) {}
                    }}
                    className="px-3 py-2 bg-rose-500 text-white rounded-lg font-extrabold text-[10px] hover:bg-rose-600 transition-all active:scale-90"
                  >
                    Có
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsConfirmingClear(false);
                    }}
                    className="px-3 py-2 text-slate-400 font-bold text-[10px] hover:text-slate-600 transition-all"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmingClear(true)}
                  disabled={syncing || clearing}
                  className="px-4 py-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl font-bold hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all text-[11px] uppercase tracking-wider flex items-center gap-2"
                  title="Xóa tất cả các sự kiện đã tạo bởi ứng dụng này"
                >
                  {clearing ? (
                    <div className="w-3 h-3 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" />
                      </svg>
                      Xóa lịch cũ
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-50 bg-slate-50/30">
            {(loading || mappingLoading) ? (
              <div className="h-full flex flex-col items-center justify-center bg-white animate-in fade-in duration-500">
                <div className="relative mb-6">
                  <div className="w-16 h-16 border-4 border-orange-100 border-t-[#F27024] rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center">
                      <div className="w-4 h-4 bg-orange-400 rounded-full animate-ping"></div>
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-[0.2em] mb-2">Đang tải dữ liệu Sheet</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">Vui lòng đợi trong giây lát...</p>
                </div>
              </div>
            ) : (rows.length > 0 || (allRows.length > 0 && isPreviewMode)) ? (
              <div className="relative h-full">
                <ScheduleTable
                  rows={filteredRows}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleAll={handleToggleAll}
                  columnLabels={columnLabels}
                  columnsConfig={columnsConfig}
                  headers={fullDetailHeaders}
                  isPreview={isPreviewMode}
                  allRows={allRows}
                  headerRowIndex={headerRowIndex}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-white">
                <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-4 text-[#F27024] animate-pulse">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-[0.3em]">Đang đợi học kỳ...</h3>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Global Components: Alerts & Toasts */}
      <StatusAlerts
        result={syncResult}
        error={parserError || syncError}
        onClose={() => {
          setSyncResult(null);
          setSyncError(null);
          setParserError(null);
        }}
      />

      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-500 flex items-center gap-3 z-[100]">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
          <span className="text-xs font-bold tracking-tight">{toastMessage}</span>
        </div>
      )}

      <SyncHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        userId={firebaseUser?.uid || ''}
        refreshTrigger={refreshHistory}
      />
    </div>
  );
};
