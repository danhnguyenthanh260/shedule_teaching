
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ExcelImport } from '../../../components/ExcelImport';
import { MappingTool } from '../../../components/MappingTool';
import { ScheduleTable } from '../../../components/ScheduleTable';
import { StatusAlerts } from '../../../components/StatusAlerts';
import { InternalConflictModal, detectInternalOverlaps } from '../../../components/InternalConflictModal';
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
  const [isMappingSettled, setIsMappingSettled] = useState(false);
  const [isSemestersLoading, setIsSemestersLoading] = useState(true);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false); // 📱 Mobile config visibility

  // Internal conflict modal state
  const [internalConflictOpen, setInternalConflictOpen] = useState(false);
  const [internalConflictGroups, setInternalConflictGroups] = useState<any[]>([]);
  const [pendingNonConflicting, setPendingNonConflicting] = useState<RowNormalized[]>([]);
  const [pendingAllRows, setPendingAllRows] = useState<RowNormalized[]>([]);
  const [lastSyncedRows, setLastSyncedRows] = useState<RowNormalized[]>([]); // Lưu rows cuối cùng đã gửi sync

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
    clearAppEvents,
    conflicts, setConflicts
  } = useCalendarSync({ accessToken, reauthorizeGoogle });

  // Toast State
  
  // Fetch semesters on mount
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        setIsSemestersLoading(true);
        const configs = await configService.fetchConfigs();
        setSemesters(configs);
      } catch (e) {
        console.error('Failed to fetch configs:', e);
      } finally {
        setIsSemestersLoading(false);
      }
    };
    fetchConfigs();
  }, []); // 👈 Fixed: Only fetch once on mount

  // Confirmation State
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

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
    setIsMappingSettled(false); // 🚨 Khóa UI cho đến khi mapping mới được nạp

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
  }, [semesters, selectedSemesterId, setSheetMeta, setSheetType, applyHeaderRow]);

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
    if (!isRestored || !mappingId || allRows.length === 0 || mappingLoading || isSemestersLoading) {
      if (mappingLoading || isSemestersLoading) setIsMappingSettled(false);
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
    setIsMappingSettled(true); // ✅ Đã áp dụng Mapping xong, mở khóa UI
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

  // 🔄 Hàm sync chính (có thể nhận rows đã filter sẵn)
  const doSyncRows = async (rowsToSync: RowNormalized[], isForce: boolean = false, conflictMode?: 'insert' | 'keep_old' | 'replace', overrideSheetType?: 'council' | 'review') => {
    setLastSyncedRows(rowsToSync); // 💾 Lưu lại để dùng khi resolve conflict
    try {
      const result = await syncToCalendar(rowsToSync, isForce, conflictMode, false, overrideSheetType);
      if (result) {
        if (firebaseUser && sheetMeta) {
          await saveSyncLog({
            userId: firebaseUser.uid,
            sheetId: sheetMeta.sheetId,
            tabName: sheetMeta.tab,
            totalRows: rowsToSync.length,
            syncResult: result
          });
          setRefreshHistory(prev => prev + 1);
        }
      }
    } catch (err: any) {
      // syncToCalendar already sets syncError
    }
  };

  const handleSync = async (isForce: boolean = false, conflictMode?: 'insert' | 'keep_old' | 'replace') => {
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

    // 🔍 Check internal overlaps (event trùng nhau trong batch)
    const { groups, nonConflicting } = detectInternalOverlaps(rowsToSync);
    if (groups.length > 0 && !conflictMode) {
      // Có event trùng nội bộ → mở modal
      setInternalConflictGroups(groups);
      setPendingNonConflicting(nonConflicting);
      setPendingAllRows(rowsToSync);
      setInternalConflictOpen(true);
      return; // Dừng sync, đợi user chọn
    }

    await doSyncRows(rowsToSync, isForce, conflictMode, effectiveIsReview ? 'review' : 'council');
  };

  // 🚀 NEW: Đồng bộ cho tất cả giảng viên (Gửi mail mời)
  const handleSyncAllLecturers = async () => {
    setSyncError(null);
    
    // 1. Lấy tất cả dòng đang filter (hoặc tất cả đang chọn)
    const targetRows = selectedIds.size > 0 
      ? filteredRows.filter(r => selectedIds.has(r.id))
      : filteredRows;

    if (targetRows.length === 0) {
      setSyncError("Không có dữ liệu giảng viên để đồng bộ. Vui lòng chọn hoặc lọc dữ liệu trước.");
      return;
    }

    // 2. Gom nhóm theo Email: Một giảng viên chỉ nhận 1 lời mời duy nhất
    const emailGroups: Record<string, RowNormalized[]> = {};
    
    targetRows.forEach(r => {
      let emails: string[] = [];
      if (r.reviewers && r.reviewers.length > 0) {
        emails = r.reviewers
          .filter(name => name && name.trim())
          .map(name => {
             const cleanHandle = name.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
             // 💡 DYNAMIC DOMAIN: Nếu là giảng viên FPT thường dùng @fpt.edu.vn, còn lại dùng @gmail.com
             // Đây là một giả định, lý tưởng nhất là lấy từ cột Email nếu có
             return r.email ? r.email.toLowerCase() : `${cleanHandle}@fpt.edu.vn`;
          });
      } else if (r.person) {
        const names = r.person.split('&').map(n => n.trim());
        emails = names
          .filter(n => n.length > 0)
          .map(n => {
            if (n.includes('@')) return n.toLowerCase();
            const cleanHandle = n.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, ''); 
            return r.email ? r.email.toLowerCase() : `${cleanHandle}@fpt.edu.vn`;
          });
      } else if (r.email) {
        emails = [r.email.toLowerCase()];
      }

      emails.forEach(email => {
        if (!emailGroups[email]) emailGroups[email] = [];
        emailGroups[email].push(r);
      });
    });

    const groupedRows: RowNormalized[] = Object.entries(emailGroups).map(([email, rows], groupIdx) => {
      // 🚀 NEW: Gom nhóm bằng SubEvents thay vì 1 block dài
      const subEvents = rows.map(r => ({
        start: r.startTime,
        end: r.endTime,
        location: r.location || '',
        description: `Buổi chấm: Slot ${r.timeRaw || 'N/A'}`
      }));

      // Sắp xếp các buổi theo thời gian
      subEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      // Thông tin chi tiết cho mô tả email
      const detailInfo = subEvents.map((s, i) => {
        const d = new Date(s.start);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        return `${i+1}. ${dateStr} | ${s.description} | Phòng: ${s.location}`
      }).join('\n');

      const firstRow = rows[0];
      return {
        ...firstRow,
        id: `group-${email.split('@')[0]}`,
        email: email,
        task: `Lịch chấm ${effectiveIsReview ? 'Review' : 'Hội đồng'} - ${rows.length} buổi`,
        // Start/End của base event lấy theo buổi đầu tiên (để không bị kéo dài 6 ngày)
        startTime: subEvents[0].start,
        endTime: subEvents[0].end,
        subEvents: subEvents, // 📧 CHUYỂN DANH SÁCH SANG BACKEND
        raw: {
          ...firstRow.raw,
          description: `Đồng bộ từ FPT Scheduler\n\nChào Giảng viên,\n\nBạn có lịch chấm ${effectiveIsReview ? 'Review' : 'Hội đồng'} tổng cộng ${rows.length} buổi như sau:\n\n${detailInfo}\n\nTrân trọng,\nFPT Scheduler`
        },
        status: 'pending'
      } as RowNormalized;
    });

    if (groupedRows.length === 0) {
      setSyncError("Không thể xác định được email giảng viên từ dữ liệu này.");
      return;
    }

    if (!window.confirm(`Xác nhận gửi 01 EMAIL TỔNG HỢP cho mỗi giảng viên (Tổng cộng ${groupedRows.length} giảng viên, ${targetRows.length} sự kiện)?`)) {
      return;
    }

    await doSyncRows(groupedRows, true, 'replace', effectiveIsReview ? 'review' : 'council');
  };

  if (!firebaseUser) return null;

  return (
    <div className="h-full flex flex-col gap-4 relative overflow-visible text-slate-900 bg-[#F1F5F9]">
      {/* Header Section: Steps 1 & 2 side-by-side (Approx 1/4 of screen) */}
      <div className={`flex-none flex flex-col lg:flex-row gap-3 overflow-hidden transition-all duration-500 ease-in-out ${!isConfigExpanded ? 'max-h-0 lg:max-h-[1000px] opacity-0 lg:opacity-100' : 'max-h-[1500px] opacity-100'}`}>
        {/* Step 1: Import */}
        <section className="lg:w-[42%] bg-white p-4 rounded-3xl border border-slate-200 flex flex-col relative z-[50] border-b-4 border-b-slate-200/50">
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
          <section className="lg:w-[58%] bg-white p-4 rounded-3xl border border-slate-200 flex flex-col relative z-[50] border-b-4 border-b-slate-200/50">
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
                      }
                    }
                  } catch (err: any) {
                    // Fail silently or handle error differently
                  }
                }}
                isLoading={loading}
              />
            </div>
          </section>
        ) : allRows.length > 0 ? (
          /* Lecturers see a comprehensive, categorized User Manual */
          <div className="lg:w-[58%] bg-white border border-slate-200 rounded-3xl flex flex-col p-5 gap-3 shadow-sm border-b-4 border-b-slate-200/50">
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
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">Đồng bộ lên Google Calendar</h4>
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

      {/* 🚀 STEP 3: PREMIUM CONTROL CENTER (Mobile-First) */}
      {(rows.length > 0 || (allRows.length > 0 && isPreviewMode)) && (
        <section className="flex-1 min-h-0 bg-white/40 glass-panel p-3 sm:p-5 rounded-2xl sm:rounded-[2.5rem] flex flex-col shadow-2xl shadow-slate-200/40 mb-2 sm:mb-0 border-b-4 sm:border-b-8 border-b-slate-200/10 transition-all duration-300">
          {/* Mobile Config Toggle & Status */}
          <div className="lg:hidden flex items-center justify-between mb-2 px-1">
            <button
              onClick={() => setIsConfigExpanded(!isConfigExpanded)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all font-bold text-[9px] uppercase tracking-wider ${isConfigExpanded ? 'bg-orange-50 text-[#F27024] border-orange-200' : 'bg-white text-slate-500 border-slate-200 shadow-sm'}`}
            >
              <svg className={`w-3 h-3 transition-transform duration-300 ${isConfigExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
              {isConfigExpanded ? 'Thu gọn' : 'Thiết lập & Cấu hình'}
            </button>
            
            <div className="flex items-center gap-2 bg-white/50 px-2 py-1 rounded-lg border border-white/50">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                {rows.length} mục
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-5 mb-2 sm:mb-5 pb-2 sm:pb-5 border-b border-white/50">
            <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-xl fpt-gradient flex items-center justify-center text-white shadow-lg shadow-orange-200 lg:hidden transform hover:scale-105 transition-transform">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-black text-slate-800 tracking-tight leading-tight">Kiểm tra & Đồng bộ</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[9px] sm:text-[11px] text-slate-400 font-extrabold uppercase tracking-widest leading-none">
                      {isPreviewMode ? 'Xem trước' : `${filteredRows.length} mục sẵn sàng`}
                    </p>
                  </div>
                </div>
              </div>
 
              <div className="w-full sm:flex-1 flex flex-col sm:flex-row items-center justify-end gap-3 min-w-0">
                {mappingLoading && (
                  <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold animate-pulse border border-orange-100 italic shrink-0">
                    Đang tải...
                  </div>
                )}
                
                <div className="flex items-center gap-2 w-full max-w-sm min-w-0 group">
                  {/* 🔍 Premium Glass Search Bar */}
                  <div className="relative flex-1 min-w-0">
                    <div className="absolute left-3 top-2.5 text-slate-300 group-focus-within:text-[#F27024] transition-colors pointer-events-none">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Tìm kiếm..."
                      className="w-full pl-9 pr-3 py-2 bg-white border-2 border-slate-100 rounded-xl text-[12px] font-black text-slate-700 placeholder:text-slate-300 focus:border-[#F27024]/30 focus:shadow-xl focus:shadow-orange-100/50 outline-none transition-all cursor-text"
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
            </div>
 
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 mb-4 sm:mb-0 border-white/50">
                  {/* 🚨 NÚT ĐỒNG BỘ CHÍNH - Premium Gradient Overlay */}
                  <div className="relative group flex-[2] sm:flex-initial">
                    <button
                      onClick={() => handleSync(false)}
                      disabled={syncing || clearing || selectedIds.size === 0}
                      className="w-full h-10 sm:h-12 px-4 sm:px-6 fpt-gradient text-white rounded-xl sm:rounded-[1.25rem] font-black hover:brightness-110 disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-100 border border-transparent transition-all shadow-xl shadow-orange-200/40 flex items-center justify-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-widest active:scale-95"
                    >
                      {syncing ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>Đồng bộ lên Google Calendar ({selectedIds.size})</>
                      )}
                    </button>
                  </div>

                  {/* 🏛️ Admin Only: Sync for All Lecturers & Recall All */}
                  {isAdmin(firebaseUser?.email) && (
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      {/* Sync All Button */}
                      <div className="relative group">
                        <button
                          onClick={handleSyncAllLecturers}
                          disabled={syncing || clearing}
                          className="h-10 sm:h-12 px-4 sm:px-6 bg-slate-900 text-white rounded-xl sm:rounded-[1.25rem] font-black hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-300 border border-transparent transition-all shadow-xl shadow-slate-200/40 flex items-center justify-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-widest active:scale-95 whitespace-nowrap"
                          title="Đồng bộ và gửi mail mời cho toàn bộ giảng viên trong danh sách"
                        >
                          {syncing ? (
                             <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                              </svg>
                              Đồng bộ cho tất cả GV
                            </>
                          )}
                        </button>
                      </div>

                      {/* 🚀 NEW: Admin Recall All Button (Thu hồi tất cả) */}
                      <div className="relative group">
                        <button
                          onClick={async () => {
                            if (window.confirm(`⚠️ CẢNH BÁO QUAN TRỌNG:
Hành động này sẽ THU HỒI (Xóa) toàn bộ lịch đã gửi cho TẤT CẢ giảng viên của học kỳ này.
Các giảng viên sẽ nhận được email thông báo hủy lịch.
Bạn có chắc chắn muốn tiếp tục?`)) {
                              const currentType = effectiveIsReview ? 'review' : 'council';
                              await clearAppEvents(currentType, true); // sendUpdates = true
                            }
                          }}
                          disabled={syncing || clearing}
                          className="h-10 sm:h-12 px-4 bg-rose-600 text-white rounded-xl sm:rounded-[1.25rem] font-black hover:bg-rose-700 disabled:bg-slate-100 disabled:text-slate-300 transition-all shadow-xl shadow-rose-200/40 flex items-center justify-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-widest active:scale-95 whitespace-nowrap"
                          title="Thu hồi toàn bộ sự kiện đã gửi (Xóa trên lịch GV)"
                        >
                          {clearing ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                               </svg>
                               Thu hồi tất cả
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
 
                  <div className="hidden sm:block w-px h-8 bg-slate-200/50 mx-1" />
 
                  {/* 🗑️ NÚT XÓA LỊCH - Icon Focus */}
                  <div className="relative group flex-1 sm:flex-initial">
                    <button
                      onClick={() => setIsConfirmingClear(!isConfirmingClear)}
                      disabled={syncing || clearing}
                      className={`w-full h-10 sm:h-12 px-2 sm:px-4 rounded-xl sm:rounded-[1.25rem] font-black transition-all text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 border shadow-lg active:scale-95 ${
                        isConfirmingClear 
                        ? 'bg-rose-50 text-rose-500 border-rose-200 ring-4 ring-rose-50' 
                        : 'bg-white text-slate-400 border-slate-100 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 shadow-sm'
                      }`}
                      title="Xóa dữ liệu cũ"
                    >
                      {clearing ? (
                        <div className="w-4 h-4 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span className="hidden sm:inline-block">Xóa lịch</span>
                        </>
                      )}
                    </button>
 
                    {/* Premium Popover Confirm */}
                    {isConfirmingClear && (
                      <div className="absolute top-full right-0 mt-4 w-72 bg-white border border-slate-100 p-6 rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] z-[100] animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300 pointer-events-auto">
                        <div className="text-center mb-6">
                          <div className="w-14 h-14 bg-rose-50 rounded-[1.25rem] flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-inner">
                             <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          </div>
                          <h4 className="text-[13px] font-black text-rose-500 uppercase tracking-widest mb-2">Dọn dẹp lịch cá nhân</h4>
                          <p className="text-[10px] text-slate-400 font-extrabold leading-relaxed px-2 uppercase tracking-tight">Xóa sạch các sự kiện app đã tạo trên LỊCH CỦA BẠN <br/><span className="text-slate-900">(Không ảnh hưởng đến người khác)</span></p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setIsConfirmingClear(false);
                              const currentType = effectiveIsReview ? 'review' : 'council';
                              await clearAppEvents(currentType);
                            }}
                            className="flex-[1.5] py-4 bg-rose-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:brightness-110 active:scale-95 shadow-2xl shadow-rose-200 transition-all"
                          >
                            Xác nhận Xóa
                          </button>
                          <button
                            onClick={() => setIsConfirmingClear(false)}
                            className="flex-1 py-4 bg-slate-50 text-slate-400 border border-slate-100 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white hover:border-slate-300 transition-all active:scale-95"
                          >
                            Hủy
                          </button>
                        </div>
                        <div className="absolute -top-1.5 right-6 w-3 h-3 bg-white border-t border-l border-slate-100 rotate-45" />
                      </div>
                    )}
                  </div>
                </div>

          <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-50 bg-slate-100">
            {(!isRestored || loading || mappingLoading || isFetchingData || !isMappingSettled || isSemestersLoading) ? (
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
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-[0.2em] mb-2">
                    {(!isRestored || mappingLoading || !isMappingSettled || isSemestersLoading) ? 'Đang khôi phục phiên làm việc' : 'Đang tải dữ liệu Sheet'}
                  </h3>
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
      {/* Internal Conflict Modal */}
      <InternalConflictModal
        isOpen={internalConflictOpen}
        conflictGroups={internalConflictGroups}
        onAcceptAll={() => {
          setInternalConflictOpen(false);
          doSyncRows(pendingAllRows);
        }}
        onSyncSelected={(selectedEvents) => {
          setInternalConflictOpen(false);
          // Merge: events đã chọn + events không trùng
          const finalRows = [...pendingNonConflicting, ...selectedEvents];
          doSyncRows(finalRows);
        }}
        onClose={() => setInternalConflictOpen(false)}
      />

      <StatusAlerts
        result={syncResult}
        error={parserError || syncError}
        conflicts={conflicts}
        onClose={() => {
          setSyncResult(null);
          setSyncError(null);
          setParserError(null);
          setConflicts([]);
        }}
        onForceSync={() => {
          const errText = (parserError || syncError || '').toLowerCase();
          if (errText.includes('401') || errText.includes('unauthenticated') || errText.includes('credentials')) {
            reauthorizeGoogle();
          } else {
            handleSync(true);
          }
        }}
        onConflictResolve={(mode) => {
          setSyncError(null);
          setConflicts([]);
          // ✅ Dùng lastSyncedRows (rows đã lọc) thay vì gọi handleSync lại từ đầu
          doSyncRows(lastSyncedRows, false, mode);
        }}
      />


      <SyncHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        userId={firebaseUser?.uid || ''}
        refreshTrigger={refreshHistory}
      />
    </div>
  );
};
