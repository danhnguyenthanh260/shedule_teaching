
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
  const { user: firebaseUser, accessToken, reauthorizeGoogle } = useFirebase();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [refreshHistory, setRefreshHistory] = useState(0);

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

  const [isFetchingData, setIsFetchingData] = useState(false);

  // Hooks
  const {
    loading,
    rows, setRows,
    error: parserError, setError: setParserError,
    applyHeaderRow,
    applyMapping,
    headerOptions,
    searchHeaderOptions,
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
  }, []); // 👈 Fixed: Only fetch once on mount

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

    const timeStr = data.fetchTime ? ` (Lúc ${data.fetchTime})` : '';
    const cacheStatus = data.isCached ? ' [Dữ liệu từ máy]' : ' [Dữ liệu mới]';
    showToast(`Đã tải ${data.rawRows.length} dòng dữ liệu${timeStr}${cacheStatus}`);
  }, [semesters, selectedSemesterId, setSheetMeta, setSheetType, applyHeaderRow, showToast]);

  // ✅ Unified filtering logic to ensure display and selection are always in sync
  const rowMatchesFilter = useCallback((row: RowNormalized, filterText: string) => {
    const rawFilter = (filterText || '').trim();
    if (!rawFilter) return true;

    const filters = khongDau(rawFilter.toLowerCase()).split(/\s+/).filter(Boolean);
    
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
    
    const hasSpecificFilter = searchColumnIndices && searchColumnIndices.length > 0;
    
    const searchSpace = hasSpecificFilter 
      ? searchValues.map(v => khongDau(String(v || ""))).join(' ')
      : [
          ...searchValues,
          row.person,
          row.groupName,
          row.location,
          row.date,
          row.task
        ].map(v => khongDau(String(v || ""))).join(' ');

    return filters.every(f => searchSpace.includes(f));
  }, [searchColumnIndices, isPreviewMode, effectiveSearchColumns]);

  // Filtering Logic
  const updateSelections = useCallback((data: RowNormalized[], filterValue?: string) => {
    const fValue = filterValue !== undefined ? filterValue : personFilter;
    const matches = data.filter(row => rowMatchesFilter(row, fValue));
    setSelectedIds(new Set(matches.map(m => m.id)));
  }, [personFilter, setSelectedIds, rowMatchesFilter]);

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
  }, [isPreviewMode, allRows, headerRowIndex, sheetMeta, tabName, fullDetailHeaders, dateFormat, effectiveIsReview]);

  const baseRows = isPreviewMode ? previewRows : rows;

  const filteredRows = useMemo(() => {
    return baseRows.filter(row => rowMatchesFilter(row, personFilter));
  }, [baseRows, personFilter, rowMatchesFilter]);

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
    let targetColumnsConfig = ''; // Default to empty (standard view)
    let shouldApply = false;

    // 🏛️ Priority 1: Admin Configuration (Per Semester)
    const adminConfig = semesters[selectedSemesterId];
    if (adminConfig && adminConfig.mapping && Object.keys(adminConfig.mapping).length > 0) {
      targetMapping = adminConfig.mapping;
      targetColumnsConfig = adminConfig.columns || ''; // STRICT: Use Admin's columns or standard
      shouldApply = true;
    } 
    // 👤 Priority 2: User's Saved Mapping (Per File/Tab)
    else if (savedMapping && Object.keys(savedMapping).length > 0) {
      targetMapping = savedMapping;
      targetColumnsConfig = columnsConfig; // Or saved columns if we tracked them
      shouldApply = true;
    }

    // Always apply if it's new, changed, or it's manual trigger (appliedColumnMap)
    if (shouldApply) {
       console.log('📥 [Sync] Applying Mapping for', mappingId);
       setColumnMap(targetMapping);
       setAppliedColumnMap(targetMapping);
       setColumnsConfig(targetColumnsConfig); // 🏛️ Sync columns order
       applyMapping(targetMapping, effectiveIsReview);
       setIsPreviewMode(false);
    } else {
       console.log('🧹 [Sync] Entering Preview Mode for', mappingId);
       setColumnMap({});
       setAppliedColumnMap({});
       // Preview mode usually uses inferredColumnsConfig (all headers)
       // This is fine, as long as it doesn't persist when Applying Admin config
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
    allRows, // 🔄 Trigger on ANY data change (content or length)
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

  const handleSync = async (isForce: boolean = false) => {
    setSyncError(null);
    let rowsToSync = filteredRows.filter(r => selectedIds.has(r.id));
    
    // ...
    if (isPreviewMode) {
      // ...
      const realRows = applyMapping(columnMap, sheetMeta?.isDataMau || false);
      if (realRows) {
        rowsToSync = realRows.filter(r => selectedIds.has(r.id));
      }
    }

    if (rowsToSync.length === 0) {
      setSyncError("Không tìm thấy mục nào hợp lệ để đồng bộ. Hãy kiểm tra lại ánh xạ cột.");
      return;
    }

    try {
      const result = await syncToCalendar(rowsToSync, isForce);
      if (result) {
        if (firebaseUser && sheetMeta) {
          await saveSyncLog({
            userId: firebaseUser.uid,
            sheetId: sheetMeta.sheetId,
            tabName: sheetMeta.tab,
            totalRows: rowsToSync.length,
            syncResult: result
          });
          setRefreshHistory(prev => prev + 1); // 🔄 Force history modal to refresh
          showToast(`Đã đồng bộ ${rowsToSync.length} mục lên Calendar!`);
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
            Dữ liệu
          </h2>
          <div className="flex-1 overflow-visible p-0.5">
            <ExcelImport
              accessToken={accessToken}
              onDataLoaded={(data) => {
                handleDataLoaded(data);
                setIsFetchingData(false);
              }}
              onLoadingStart={() => {
                setRows([]);
                setAllRows([]);
                setSelectedIds(new Set());
                setSyncResult(null);
                setSyncError(null);
                setIsFetchingData(true);
              }}
              setLoading={setIsFetchingData} 
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
                        showToast('Đã lưu cấu hình ánh xạ mặc định cho học kỳ');
                      }
                    }
                  } catch (err: any) {
                    showToast('Lỗi khi lưu cấu hình');
                  }
                }}
                isLoading={loading}
              />
            </div>
          </section>
        ) : allRows.length > 0 ? (
          /* Lecturers see a comprehensive, categorized User Manual */
          <div className="lg:w-[58%] bg-white border border-slate-100 rounded-3xl flex flex-col p-5 gap-3 shadow-sm border-b-4 border-b-slate-100/50">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[10px] font-bold text-slate-700 flex items-center gap-2 uppercase tracking-[0.2em]">
                Cẩm nang sử dụng
              </h2>
              <span className="px-2 py-0.5 bg-orange-100 text-[#F27024] text-[8px] font-bold rounded-full uppercase tracking-tighter">Lecturer Edition</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 overflow-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
              {/* Category 1: Core Flow */}
              <div className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100 hover:border-orange-200 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 bg-[#F27024] text-white text-[10px] font-bold rounded-lg flex items-center justify-center shadow-sm">1</span>
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">Đồng bộ lịch</h4>
                </div>
                <ul className="space-y-1.5 ml-1">
                  <li className="flex gap-2 text-[9px] text-slate-500 font-medium">
                    <span className="text-orange-400">•</span> Chọn học kỳ & Nhập tên bạn vào ô tìm kiếm.
                  </li>
                  <li className="flex gap-2 text-[9px] text-slate-500 font-medium">
                    <span className="text-orange-400">•</span> Tích chọn các dòng cần đồng bộ lên Calendar.
                  </li>
                </ul>
              </div>

              {/* Category 2: Management */}
              <div className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100 hover:border-orange-200 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-lg flex items-center justify-center shadow-sm">2</span>
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">Quản lý hiệu quả</h4>
                </div>
                <ul className="space-y-1.5 ml-1">
                  <li className="flex gap-2 text-[9px] text-slate-500 font-medium">
                    <span className="text-blue-400">•</span> Click "Lịch sử" (góc trên) để xem các lần import.
                  </li>
                  <li className="flex gap-2 text-[9px] text-slate-500 font-medium">
                    <span className="text-blue-400">•</span> Dùng "Tải lại" nếu dữ liệu Excel vừa thay đổi.
                  </li>
                </ul>
              </div>

              {/* Category 3: Cleanup */}
              <div className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100 hover:border-orange-200 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-lg flex items-center justify-center shadow-sm">3</span>
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">Dọn dẹp lịch cũ</h4>
                </div>
                <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
                  Dùng nút <span className="text-rose-600 font-bold">"Xóa lịch cũ"</span> ở bảng dưới để xóa sạch các sự kiện app đã tạo, giúp Calendar gọn gàng trước khi sync mới.
                </p>
              </div>

              {/* Category 4: Optimization */}
              <div className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100 hover:border-orange-200 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg flex items-center justify-center shadow-sm">4</span>
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">Lọc nâng cao</h4>
                </div>
                <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
                  Sử dụng biểu tượng <span className="text-slate-800 font-bold">🔍 (biểu tượng phễu)</span> bên cạnh ô tìm kiếm để lọc dữ liệu theo Phòng, Tiêu đề hoặc Ngày.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:w-[58%] bg-slate-50/30 border border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center p-6 gap-3 opacity-60">
            <div className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-300 font-bold">1</div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Hoàn thành bước 1 (Chọn học kỳ) để bắt đầu</p>
          </div>
        )}
      </div>

      {/* Step 3: Preview & Sync (Approx 3/4 of screen) */}
      {(rows.length > 0 || (allRows.length > 0 && isPreviewMode)) && (
        <section className="flex-1 min-h-0 bg-white p-4 rounded-3xl border border-slate-100 flex flex-col relative z-[60] overflow-visible animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          <div className="flex-none flex items-center justify-between gap-4 mb-3 border-b border-slate-100 pb-3 min-h-[3.5rem]">
            <div className="flex items-center gap-2 shrink-0">
              
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight leading-tight">Kiểm tra & Đồng bộ</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                  {isPreviewMode ? 'Chế độ xem trước (Dữ liệu thô)' : `Sẵn sàng: ${filteredRows.length} mục`}
                </p>
              </div>
            </div>

              <div className="flex-1 flex items-center justify-end gap-3 min-w-0 pr-2">
                {mappingLoading && (
                  <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold animate-pulse border border-orange-100 italic shrink-0">
                    Đang tải...
                  </div>
                )}
                
                <div className="flex items-center gap-2 w-full max-w-sm min-w-0">
                  <div className="relative flex-1 min-w-0">
                  <div className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-[#F27024] transition-colors pointer-events-none">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                    <input
                      type="text"
                      placeholder="Lọc tên giảng viên..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all focus:bg-white font-bold text-slate-800 placeholder:text-slate-400 pointer-events-auto cursor-text"
                      value={personFilter}
                      onChange={(e) => {
                        setPersonFilter(e.target.value);
                        updateSelections(rows, e.target.value);
                      }}
                    />
                  </div>

                  <SearchColumnSelector
                    headers={searchHeaderOptions}
                    selectedIndices={searchColumnIndices}
                    onSelectionChange={setSearchColumnIndices}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                 {/* 🚨 NÚT ĐỒNG BỘ CHÍNH */}
                <div className="relative group">
                  <button
                    onClick={() => handleSync(false)}
                    disabled={syncing || clearing || selectedIds.size === 0}
                    className="h-11 px-6 bg-[#F27024] text-white rounded-2xl font-bold hover:bg-orange-600 disabled:bg-slate-50 disabled:text-slate-300 disabled:border-slate-100 border border-transparent transition-all shadow-xl shadow-orange-200/50 flex items-center gap-2 text-[11px] uppercase tracking-widest active:scale-95"
                  >
                    {syncing ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Đồng bộ ({selectedIds.size})</>
                    )}
                  </button>

                </div>

                <div className="w-px h-8 bg-slate-100 mx-1" />

              <div className="flex items-center gap-1.5">
                {isConfirmingClear ? (
                  <div className="flex items-center gap-1.5 p-1 bg-rose-50 border border-rose-100 rounded-xl animate-in fade-in slide-in-from-right-4 duration-300">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsConfirmingClear(false);
                        await clearAppEvents();
                      }}
                      className="px-4 py-2 bg-rose-500 text-white rounded-lg font-bold text-[10px] uppercase tracking-wider hover:bg-rose-600 active:scale-95 shadow-lg shadow-rose-200"
                    >
                      Tôi muốn xóa
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsConfirmingClear(false);
                      }}
                      className="px-4 py-2 bg-white text-slate-400 border border-slate-200 rounded-lg font-bold text-[10px] uppercase tracking-wider hover:text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
                    >
                      Từ chối
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsConfirmingClear(true)}
                    disabled={syncing || clearing}
                    className="px-4 py-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl font-bold hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all text-[11px] uppercase tracking-wider flex items-center gap-2 group"
                    title="Xóa tất cả các sự kiện đã tạo bởi ứng dụng này"
                  >
                    {clearing ? (
                      <div className="w-3 h-3 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Xóa lịch cũ
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-50 bg-slate-50/30">
            {(loading || mappingLoading || isFetchingData) ? (
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
                <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-4 text-[#F27024] font-bold text-xl">
                  ?
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
        onForceSync={() => {
          const errText = (parserError || syncError || '').toLowerCase();
          if (errText.includes('401') || errText.includes('unauthenticated') || errText.includes('credentials')) {
            reauthorizeGoogle();
          } else {
            handleSync(true);
          }
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
