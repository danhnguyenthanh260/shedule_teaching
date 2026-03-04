
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ExcelImport } from '../../../components/ExcelImport';
import { MappingTool } from '../../../components/MappingTool';
import { ScheduleTable } from '../../../components/ScheduleTable';
import { StatusAlerts } from '../../../components/StatusAlerts';
import ConfirmModal from '../../../components/ConfirmModal';
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
import { notifyLecturers, batchInvitationNotifyLecturers, respondToInvitations, exchangeOAuthCode, getLecturerTokenStatus } from '../../../services/appsScriptService';
import { googleService, inferSchema } from '../../../services/googleService';
import { SearchColumnSelector } from '../../../components/SearchColumnSelector';
import { isAdmin, isSuperAdmin } from '../../../config/admin';
import { database } from '../../../config/firebase';
import { ref, set, get, onValue } from 'firebase/database';
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
  const [isConfigExpanded, setIsConfigExpanded] = useState(true); // 📱 Mobile/Desktop config visibility. Default to true.

  // Internal conflict modal state
  const [internalConflictOpen, setInternalConflictOpen] = useState(false);
  const [internalConflictGroups, setInternalConflictGroups] = useState<any[]>([]);
  const [pendingNonConflicting, setPendingNonConflicting] = useState<RowNormalized[]>([]);
  const [pendingAllRows, setPendingAllRows] = useState<RowNormalized[]>([]);
  const [lastSyncedRows, setLastSyncedRows] = useState<RowNormalized[]>([]);
  const [autoRSVPStatus, setAutoRSVPStatus] = useState<{ loading: boolean; success?: boolean; error?: string; message?: string }>({ loading: false });
  const [isCalendarConnected, setIsCalendarConnected] = useState<{ connected: boolean; hasRefreshToken: boolean } | null>(null);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);

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
    globalRecallEvents,
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

  // 🚀 Boss Requested: Reset search when semester changes
  useEffect(() => {
    if (selectedSemesterId) {
      setPersonFilter('');
      setSelectedIds(new Set());
    }
  }, [selectedSemesterId]);

  // Confirmation State
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isConfirmingGlobalRecall, setIsConfirmingGlobalRecall] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false); // 📧 New notification state
  const [showNotifyConfirm, setShowNotifyConfirm] = useState(false); // 📧 Toggle for notification modal
  const [isInvitingBatch, setIsInvitingBatch] = useState(false); // 📧 NEW: Đang gửi mời tổng hợp
  const [showBatchInvitationConfirm, setShowBatchInvitationConfirm] = useState(false); // 📧 NEW: Hiện modal xác nhận mời tổng hợp
  
  // 🎓 Lecturer Whitelist for Email Mapping
  const [lecturerWhitelist, setLecturerWhitelist] = useState<Record<string, { name: string; code: string; email: string }>>({});

  useEffect(() => {
    const lecturerRef = ref(database, 'lecturer_whitelist');
    return onValue(lecturerRef, (snapshot) => {
      const data = snapshot.val();
      setLecturerWhitelist(data || {});
    });
  }, []);
  
  // 🚀 Zero-Click Auto-Sync State
  const [autoSyncPhase, setAutoSyncPhase] = useState<'idle' | 'detecting' | 'processing' | 'done'>('idle');
  const autoSyncProcessedRef = useRef(false);

  const [appliedColumnMap, setAppliedColumnMap] = useState<ColumnMapping>({});

  // 🔑 Handle OAuth Callback from URL (Option 2)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && firebaseUser?.email) {
      const completeOAuth = async () => {
        setIsConnectingCalendar(true);
        try {
          // Exchange code for token
          await exchangeOAuthCode(firebaseUser.email!, code);
          setIsCalendarConnected({ connected: true, hasRefreshToken: true });
          // Success notification
          alert("Kết nối Google Calendar thành công, từ giờ Admin có thể đồng bộ các sự kiện lên Calendar thay bạn");
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
          alert("Lỗi kết nối Calendar: " + (err instanceof Error ? err.message : String(err)));
        } finally {
          setIsConnectingCalendar(false);
        }
      };
      completeOAuth();
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser?.email) {
      const checkConnection = async () => {
        try {
          const status = await getLecturerTokenStatus(firebaseUser.email!);
          setIsCalendarConnected(status);
        } catch (err) {
          console.error('Error checking calendar connection:', err);
        }
      };
      checkConnection();
    }
  }, [firebaseUser]);

  const handleConnectCalendar = async () => {
    if (!firebaseUser?.email) return;
    
    setIsConnectingCalendar(true);
    try {
      // 🌐 Construct Google OAuth URL
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
      const redirectUri = window.location.origin + '/'; // Back to dashboard
      const scope = encodeURIComponent(
        'https://www.googleapis.com/auth/calendar ' +
        'https://www.googleapis.com/auth/calendar.events'
      );
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${scope}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(firebaseUser.email)}`;

      // Redirect lecturer to Google
      window.location.href = authUrl;
    } catch (err) {
      console.error("Không thể khởi tạo kết nối Google");
      setIsConnectingCalendar(false);
    }
  };

  // Sync appliedColumnMap with persistence columnMap whenever it changes (especially for Admin)
  useEffect(() => {
    if (Object.keys(columnMap).length > 0) {
      setAppliedColumnMap(columnMap);
    }
  }, [columnMap]);

  // ✅ Create a unique ID for each sheet-tab combination to prevent settings overlap
  const currentSheetKey = useMemo(() => {
    if (!sheetUrl) return 'default';
    const id = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || 'unknown';
    return `${id}-${tabName}`;
  }, [sheetUrl, tabName]);

  // 🚀 Step 1: Deep Link Detection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAutoSync = params.get('autoSync') === 'true';
    const targetEmail = params.get('email');
    const targetUrl = params.get('url');
    const targetTab = params.get('tab');

    if (isAutoSync && targetEmail && targetUrl) {
      console.log(`🚀 Auto-Sync Init: ${targetEmail}`);
      setSheetUrl(targetUrl);
      if (targetTab) setTabName(targetTab);
      setPersonFilter(targetEmail);
      
      setAutoSyncPhase('detecting');
      
      // Clear URL params to avoid re-triggering
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // 🚀 Step 3: Magic Link (autoRSVP) Detection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAutoRSVP = params.get('autoRSVP') === 'true';
    const email = params.get('email');
    const action = params.get('action');

    if (isAutoRSVP && email && (action === 'accept' || action === 'decline' || action === 'maybe')) {
      const triggerBatchRSVP = async () => {
        setAutoRSVPStatus({ loading: true });
        try {
          const result = await respondToInvitations(email, action as 'accept' | 'decline' | 'maybe');
          setAutoRSVPStatus({ 
            loading: false, 
            success: true, 
            message: result.message || `Đã cập nhật thành công ${result.data?.updatedCount || 0} buổi chấm vào Calendar của bạn!` 
          });
        } catch (err) {
          setAutoRSVPStatus({ 
            loading: false, 
            success: false, 
            error: err instanceof Error ? err.message : String(err) 
          });
        }
      };
      triggerBatchRSVP();
    }
  }, []);

  // 🚀 Step 2: Auto-Trigger Sync Logic
  useEffect(() => {
    if (autoSyncPhase === 'detecting' && !loading && rows.length > 0 && accessToken && !autoSyncProcessedRef.current) {
      console.log('🚀 Triggering Zero-Click Auto-Sync...');
      autoSyncProcessedRef.current = true;
      setAutoSyncPhase('processing');
      
      // Delay slightly for UI smoothness
      setTimeout(() => {
        handleSync(true, 'replace').then(() => {
          setAutoSyncPhase('done');
        }).catch(err => {
          console.error('Auto-Sync failed:', err);
          setAutoSyncPhase('idle'); // Back to normal if failed
        });
      }, 1500);
    }
  }, [autoSyncPhase, loading, rows.length, accessToken]);
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

  // 📧 Logic trích xuất Email & Gom nhóm (Dùng chung cho cả sync & notify)
  const extractEmail = useCallback((val: string) => {
    if (!val) return null;
    const str = val.trim();
    if (!str) return null;
    
    // 1. Xác định "Handle" hoặc "Mã" từ chuỗi nhập vào
    let handle = "";
    let isLikelyEmail = str.includes('@');

    if (str.includes('(') && str.includes(')')) {
      // Ưu tiên lấy trong ngoặc: "Tên (abc)" -> abc
      handle = str.split('(')[1].split(')')[0].trim().toLowerCase();
    } else if (isLikelyEmail) {
      // Lấy phần trước @: "abc@gmail.com" -> abc
      handle = str.split('@')[0].trim().toLowerCase();
    } else {
      // Nếu chỉ có tên: "Nguyễn Văn Đạt" -> dat
      const nonAccented = khongDau(str);
      const parts = nonAccented.split(' ');
      handle = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    if (!handle) return null;

    const lecturers = Object.values(lecturerWhitelist) as Array<{ name: string; code: string; email: string }>;
    
    // 2. CHIẾN THUẬT TÌM KIẾM: Tìm người khớp nhất trong Quản lý giảng viên
    const matchedLecturer = lecturers.find(l => {
      const lCode = khongDau(l.code || "").replace(/[^a-z0-9]/g, '').toLowerCase();
      const lEmailPrefix = (l.email || "").split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const lNameNoDau = khongDau(l.name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
      const inputNoDau = khongDau(str).toLowerCase().replace(/[^a-z0-9]/g, '');

      // So khớp Mã giảng viên hoặc Tiền tố Email
      if (lCode === handle || lEmailPrefix === handle) return true;
      
      // So khớp Tên đầy đủ không dấu (Dự phòng cho hội đồng chỉ ghi tên)
      if (lNameNoDau === inputNoDau && inputNoDau.length > 5) return true;

      return false;
    });

    // 3. TRẢ VỀ KẾT QUẢ
    if (matchedLecturer?.email) {
      // Nếu tìm thấy trong Whitelist -> Lấy mail chuẩn (có thể là @gmail hoặc @fpt)
      return matchedLecturer.email.toLowerCase();
    }

    // Nếu không thấy thì mặc định gán đuôi @fpt.edu.vn
    return `${handle}@fpt.edu.vn`;
  }, [lecturerWhitelist]);

  // 📧 🚀 Reactive Notification Data: Luôn bám sát Filter & Search
  const notifiableLecturers = useMemo(() => {
    if (allRows.length === 0) return [];

    const targetRows = selectedIds.size > 0 
      ? filteredRows.filter(r => selectedIds.has(r.id))
      : filteredRows;

    if (targetRows.length === 0) return [];

    const emailGroups: Record<string, RowNormalized[]> = {};
    
    targetRows.forEach(r => {
      let emails: string[] = [];
      if (r.email) {
        const e = extractEmail(r.email);
        if (e) emails.push(e);
      }
      if (r.reviewers && r.reviewers.length > 0) {
        r.reviewers.forEach(rev => {
          const e = extractEmail(rev);
          if (e && !emails.includes(e)) emails.push(e);
        });
      }
      if (r.person && emails.length === 0) {
        const e = extractEmail(r.person);
        if (e) emails.push(e);
      }
      
      emails.forEach(email => {
        if (!emailGroups[email]) emailGroups[email] = [];
        emailGroups[email].push(r);
      });
    });

    return Object.entries(emailGroups).map(([email, rows]) => {
      const handle = email.split('@')[0];
      let foundName = handle;
      
      for (const r of rows) {
        if (r.reviewers) {
          const match = r.reviewers.find(name => {
            const h = khongDau(name).split(' ').pop()?.replace(/[^a-z0-9]/g, '');
            return h === handle;
          });
          if (match) { foundName = match; break; }
        }
        if (r.person) {
          const h = khongDau(r.person).split(' ').pop()?.replace(/[^a-z0-9]/g, '');
          if (h === handle) { foundName = r.person; break; }
        }
      }

      return {
        email,
        name: foundName,
        events: rows.map(r => {
          let eventTitle = foundName;
          if (r.isGrouped) {
             const timePart = r.timeRaw ? ` - Slot(${r.timeRaw})` : '';
             eventTitle = `${foundName}${timePart}`.trim();
          } else {
             const taskPart = r.task && r.task !== 'Nhiệm vụ' && r.task !== 'Review' ? ` - ${r.task}` : '';
             eventTitle = `${foundName}${taskPart}`;
             if (!eventTitle) eventTitle = effectiveIsReview ? 'Chấm bài Review' : 'Hội đồng bảo vệ';
          }

          return {
            start: r.startTime,
            end: r.endTime,
            location: r.location || '',
            title: eventTitle,
            description: r.isGrouped 
              ? `Đồng bộ từ FPT Scheduler\nGiảng viên: ${foundName}\nThời gian: ${r.timeRaw || 'N/A'}`
              : `Nhiệm vụ: ${r.task || 'Chưa phân công'}\nGiảng viên: ${foundName}\nThời gian: ${r.timeRaw || 'N/A'}`
          };
        })
      };
    });
  }, [allRows.length, filteredRows, selectedIds, lecturerWhitelist, effectiveIsReview, extractEmail]);

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
    
    // 🚀 Optimization: If no rows are selected, we sync ALL filtered rows (useful for Auto-Sync)
    let rowsToSync = selectedIds.size > 0 
      ? filteredRows.filter(r => selectedIds.has(r.id))
      : filteredRows;
    
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

  // 🚀 NEW: Đồng bộ cho tất cả giảng viên (Ưu tiên Silent Sync)
  const handleGlobalSync = () => {
    if (notifiableLecturers.length === 0) {
      setSyncError("Không có dữ liệu giảng viên để đồng bộ. Vui lòng chọn hoặc lọc dữ liệu trước.");
      return;
    }
    // 🛡️ Close other popovers
    setIsConfirmingGlobalRecall(false);
    setIsConfirmingClear(false);
    setSyncError(null);
    setShowNotifyConfirm(true);
  };

  const executeNotifyLecturers = async (lecturersData: any[]) => {
    setIsNotifying(true);
    setShowNotifyConfirm(false);
    setSyncError(null);
    setSyncResult(null);
    try {
      const currentType = effectiveIsReview ? 'review' : 'council';
      const result = await notifyLecturers(lecturersData, sheetUrl, tabName, currentType);
      
      if (result.status === 'success') {
        const { success, failed, total, errors, quotaRemaining, mailSent, mailSkipped, debugLogs } = result.data;
        
        const logEntries = [
          `Tổng số giảng viên xử lý: ${total}`,
          `Email đã gửi: ${mailSent || 0}`,
          `Bỏ qua (Do không đổi): ${mailSkipped || 0}`,
          `Hạn ngạch (Quota) còn: ${quotaRemaining}`
        ];

        if (debugLogs && debugLogs.length > 0) {
          logEntries.push("--- Nhật ký chi tiết ---");
          logEntries.push(...debugLogs);
        }

        if (failed > 0) {
          const errorMsgs = errors.map((e: any) => `${e.title || 'GV'}: ${e.message || 'Lỗi không xác định'}`).join('\n');
          setSyncError(`Hoàn tất với một số lỗi. Đã xử lý: ${success}/${total}.\nLỗi chi tiết:\n${errorMsgs}\n\n${logEntries.slice(0, 4).join('\n')}`);
        } else if (success === 0) {
          setSyncError(`Không có dữ liệu nào được đồng bộ. Quota gửi mail còn: ${quotaRemaining}`);
        } else {
          setSyncResult({
             type: 'sync',
             created: success,
             updated: 0,
             skipped: 0,
             failed: 0,
             logs: logEntries
          });
        }
      } else {
        throw new Error(result.message || "Backend không trả về trạng thái thành công.");
      }
    } catch (err: any) {
      setSyncError(err.message || "Lỗi khi gửi thông báo.");
    } finally {
      setIsNotifying(false);
    }
  };

  /**
   * 📧 NEW: Thực thi gửi mời tổng hợp (Force Batch Invitation)
   */
  const executeBatchInvitationNotify = async (lecturersData: any[]) => {
    setIsInvitingBatch(true);
    setShowBatchInvitationConfirm(false);
    setSyncError(null);
    setSyncResult(null);
    try {
      const currentType = effectiveIsReview ? 'review' : 'council';
      const result = await batchInvitationNotifyLecturers(lecturersData, sheetUrl, tabName, currentType);
      
      if (result.status === 'success') {
        const { success, failed, total, errors, quotaRemaining, mailSent, mailSkipped, debugLogs } = result.data;
        
        const logEntries = [
          `CHẾ ĐỘ: LỜI MỜI TỔNG HỢP (SUMMARY INVITATION)`,
          `Tổng số giảng viên xử lý: ${total}`,
          `Email đã gửi: ${mailSent || 0}`,
          `Bỏ qua (Do không đổi): ${mailSkipped || 0}`,
          `Hạn ngạch (Quota) còn: ${quotaRemaining}`
        ];

        if (debugLogs && debugLogs.length > 0) {
          logEntries.push("--- Nhật ký chi tiết ---");
          logEntries.push(...debugLogs);
        }

        if (failed > 0) {
          const errorMsgs = errors.map((e: any) => `${e.title || 'GV'}: ${e.message || 'Lỗi không xác định'}`).join('\n');
          setSyncError(`Hoàn tất mời tổng hợp với một số lỗi. Đã xử lý: ${success}/${total}.\nLỗi chi tiết:\n${errorMsgs}\n\n${logEntries.slice(0, 5).join('\n')}`);
        } else if (success === 0) {
          setSyncError(`Không có dữ liệu nào được mời. Quota gửi mail còn: ${quotaRemaining}`);
        } else {
          setSyncResult({
             type: 'sync',
             created: success,
             updated: 0,
             skipped: 0,
             failed: 0,
             logs: logEntries
          });
        }
      } else {
        throw new Error(result.message || "Lỗi không xác định từ Backend");
      }
    } catch (err: any) {
      setSyncError("Lỗi gửi lời mời: " + (err.message || String(err)));
    } finally {
      setIsInvitingBatch(false);
    }
  };

  // Magic Link (autoRSVP) Check
  const isAutoRSVPMood = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autoRSVP') === 'true';
  }, []);

  if (isAutoRSVPMood) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-slate-950 overflow-hidden">
        {/* Subtle motion background */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-orange-300/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-300/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>

        <div className="relative z-10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl p-10 rounded-[3rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.1)] max-w-lg w-full mx-4 border border-white/40 dark:border-white/5 text-center transform transition-all duration-700">
          {autoRSVPStatus.loading ? (
            <div className="flex flex-col items-center py-10">
              <div className="relative w-24 h-24 mb-10">
                <div className="absolute inset-0 border-4 border-[#F27024]/10 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[#F27024] border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight uppercase italic">Đang đồng bộ...</h2>
              <p className="text-slate-500 dark:text-slate-400 text-xl font-medium leading-relaxed italic">
                Hệ thống đang tự động xác nhận lịch và lưu vào Calendar cá nhân của bạn.
              </p>
            </div>
          ) : autoRSVPStatus.success ? (
            <div className="flex flex-col items-center py-6">
              <div className="w-28 h-28 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-10 text-6xl shadow-inner animate-bounce">✓</div>
              <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight uppercase italic">Thành công!</h2>
              <p className="text-slate-600 dark:text-slate-300 text-xl mb-10 leading-relaxed font-medium italic">
                {autoRSVPStatus.message || "Lịch giảng dạy đã được cập nhật thành công!"}
              </p>
              
              <div className="flex flex-col gap-4 w-full">
                <button
                  onClick={() => window.open('https://calendar.google.com', '_blank')}
                  className="w-full bg-slate-900 dark:bg-slate-700 text-white py-5 rounded-2xl font-bold text-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-95 shadow-lg"
                >
                  Mở Google Calendar
                </button>
                <button
                  onClick={() => window.close()}
                  className="w-full bg-white dark:bg-slate-800 text-slate-400 py-4 rounded-2xl font-bold text-lg hover:text-slate-600 dark:hover:text-slate-300 transition-all active:scale-95"
                >
                  Đóng trang này
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-10">
              <div className="w-24 h-24 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mb-10 text-6xl italic shadow-inner">!</div>
              <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight uppercase italic">Rất tiếc!</h2>
              <p className="text-rose-500/90 text-xl mb-10 leading-relaxed font-medium italic">
                {autoRSVPStatus.error || "Đã xảy ra lỗi không xác định."}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-[#F27024] text-white py-5 rounded-2xl font-bold text-xl hover:bg-orange-600 shadow-xl shadow-orange-500/20 transition-all active:scale-95"
              >
                Thử lại ngay
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!firebaseUser) return null;

  return (
    <div className="flex-1 bg-[#F8FAFC] flex flex-col p-2 md:p-3 lg:h-full lg:overflow-hidden min-h-0">
      {/* 🚀 Zero-Click Auto-Sync Overlay */}
      {autoSyncPhase === 'processing' && (
        <div className="fixed inset-0 z-[9999] bg-white/90 flex flex-col items-center justify-center p-6 text-center">
           <div className="w-16 h-16 border-4 border-[#F27024]/20 border-t-[#F27024] rounded-full animate-spin mb-4" />
           <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight uppercase">Đang đồng bộ tự động</h2>
           <p className="text-slate-500 max-w-md font-medium">Hệ thống đang xử lý lịch và lưu vào Calendar cá nhân. Vui lòng không đóng trình duyệt!</p>
        </div>
      )}
      
      {autoSyncPhase === 'done' && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 text-center">
           <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
           </div>
           <h2 className="text-3xl font-bold text-slate-800 mb-3 tracking-tight uppercase">Thành công!</h2>
           <p className="text-slate-500 max-w-md text-lg mb-8 font-medium italic">Lịch giảng dạy của bạn đã được cập nhật vào Google Calendar.</p>
           <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => window.open('https://calendar.google.com', '_blank')}
                className="px-8 py-4 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                 Mở Google Calendar
              </button>
              <button 
                onClick={() => setAutoSyncPhase('idle')}
                className="px-8 py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all"
              >
                 Quay lại Dashboard
              </button>
           </div>
        </div>
      )}

      {/* 🏛️ OAuth Connection Banner - PROMINENT SILENT SYNC */}
      {!isAdmin(firebaseUser?.email) && isCalendarConnected && (isCalendarConnected.connected === false || isCalendarConnected.hasRefreshToken === false) && (
        <section className="mb-3">
          <div className="relative overflow-hidden bg-white border border-orange-200 rounded-2xl p-2.5 shadow-sm group">
            <div className="relative z-10 flex items-center gap-4">
              {/* Icon - Smaller */}
              <div className="shrink-0 w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-xl border border-orange-100">
                📅
              </div>

              {/* Text - Slimmer */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Khuyến nghị</span>
                </div>
                 <h3 className="text-sm md:text-base font-bold text-slate-800 leading-tight">
                  Vui lòng bấm kết nối để admin có thể đồng bộ trực tiếp lên calendar
                </h3>
              </div>

              {/* CTA Button - Compact */}
              <div className="shrink-0">
                <button
                  onClick={handleConnectCalendar}
                  disabled={isConnectingCalendar}
                  className="px-5 py-2.5 bg-[#F27024] hover:bg-orange-600 text-white rounded-lg font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 text-[11px] whitespace-nowrap"
                >
                  {isConnectingCalendar ? "Đang kết nối..." : "Kết nối ngay"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {isCalendarConnected && isCalendarConnected.connected === true && isCalendarConnected.hasRefreshToken === true && !isAdmin(firebaseUser?.email) && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl w-fit text-[11px] font-bold border border-emerald-100 shadow-sm">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          Đã kết nối Lịch tự động
        </div>
      )}

      {/* 🚀 FIRST ROW: Step 1 & Step 2 */}
      <div 
        id="config-area" 
        className={`grid transition-all duration-500 ease-in-out overflow-hidden flex-none ${
          isConfigExpanded ? 'grid-rows-[1fr] opacity-100 mb-2 lg:mb-3' : 'grid-rows-[0fr] opacity-0 mb-0'
        }`}
      >
        <div className="min-h-0 flex flex-col lg:flex-row gap-3">
          {/* Step 1: Import */}
          <section className="lg:w-[35%] card-clean p-1.5 md:p-2 flex flex-col">
            <div className="flex items-center gap-2 mb-1 px-1">
              <div className="step-number w-5 h-5 text-[9px]">1</div>
              <div>
                <h2 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest leading-none">Dữ liệu</h2>
                <p className="text-[8px] text-slate-400 font-bold mt-0.5 uppercase">CHỌN HỌC KỲ</p>
              </div>
            </div>
            <div className="flex-1">
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
            <section className="lg:w-[65%] card-clean p-1.5 md:p-2 flex flex-col">
              <div className="flex items-center gap-2 mb-1 px-1">
                <div className="step-number w-5 h-5 text-[9px]">2</div>
                <div>
                  <h2 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest leading-none">Cấu hình</h2>
                  <p className="text-[8px] text-slate-400 font-bold mt-0.5 uppercase">ÁNH XẠ CỘT</p>
                </div>
              </div>
              <div className="flex-1">
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
                      if (mappingId) await saveFirebaseMapping(mappingId, columnMap, headerRowIndex);
                      if (selectedSemesterId) {
                        const currentConfig = semesters[selectedSemesterId];
                        if (currentConfig) {
                          const configRef = ref(database, `configs/${selectedSemesterId}`);
                          await set(configRef, {
                            ...currentConfig,
                            startRow: startRow.toString(),
                            columns: columnsConfig,
                            mapping: columnMap
                          });
                        }
                      }
                    } catch (err) { /* silent */ }
                  }}
                  isLoading={loading}
                />
              </div>
            </section>
          ) : allRows.length > 0 ? (
            /* Lecturers Manual Section */
            <div className="lg:w-[65%] card-clean p-1.5 md:p-2 flex flex-col">
              <div className="flex items-center gap-2 mb-1 px-1">
                <div className="step-number w-5 h-5 text-[9px]">2</div>
                <div>
                  <h2 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest leading-none">Hướng dẫn</h2>
                  <p className="text-[8px] text-slate-400 font-bold mt-0.5 uppercase">CÁCH ĐỒNG BỘ</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 flex-1">
                {[
                  { id: '1', title: 'Lọc lịch cá nhân', desc: 'Dùng ô tìm kiếm để lọc tên của bạn.' },
                  { id: '2', title: 'Chọn sự kiện', desc: 'Đánh dấu sự kiện cần đồng bộ lên Calendar.' },
                  { id: '3', title: 'Kiểm tra xung đột', desc: 'Hệ thống báo nếu trùng lịch hiện có.' },
                  { id: '4', title: 'Hoàn tất', desc: 'Nhấn Đồng bộ và chờ lịch cập nhật.' },
                ].map((item) => (
                  <div key={item.id} className="p-1 px-2 rounded-lg bg-white/50 border border-slate-100/10 hover:border-orange-200 transition-all group flex flex-col justify-center">
                    <h4 className="text-[9px] font-bold text-slate-800 leading-tight uppercase tracking-tight">{item.title}</h4>
                    <p className="text-[8px] text-slate-400 font-medium leading-tight mt-0.5 line-clamp-2">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="lg:w-[60%] card-clean p-4 flex flex-col items-center justify-center border-dashed border-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 text-sm font-bold mb-2">
                 2
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Đang chờ cấu hình bước 1</p>
            </div>
          )}
        </div>
      </div>

      {/* 🚀 STEP 3: CONTROL CENTER */}
      {(rows.length > 0 || (allRows.length > 0 && isPreviewMode)) && (
        <section className="flex-none lg:flex-1 lg:min-h-0 card-clean flex flex-col mb-2 !overflow-visible">
          {/* Header Row */}
          <div className="p-3 md:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            {/* Step label */}
            <div className="flex items-center justify-between lg:justify-start gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="step-number w-6 h-6 sm:w-7 sm:h-7 text-[10px] sm:text-xs">3</div>
                <div>
                  <h2 className="text-[10px] sm:text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">Kiểm tra</h2>
                  <p className="text-[8px] sm:text-[10px] text-slate-400 font-bold mt-0.5 uppercase">
                    {isPreviewMode ? 'XEM TRƯỚC' : `Sẵn sàng: ${filteredRows.length}`}
                  </p>
                </div>
              </div>
              
              {/* Mobile-only Config Toggle button */}
              <button
                onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                className="lg:hidden p-2 rounded-lg bg-slate-50 text-slate-400 border border-slate-200"
                title={isConfigExpanded ? 'Ẩn cấu hình' : 'Hiện cấu hình'}
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${isConfigExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Search + Action Buttons Group */}
            <div className="flex flex-col lg:flex-row items-center gap-2 flex-1 min-w-0 w-full">
              <div className="flex items-center gap-2 w-full flex-1">
                <div className="relative flex-1 group">
                  <div className="absolute left-3 top-2.5 text-slate-300 pointer-events-none">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Tìm giảng viên..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-[#F27024]/10 focus:border-[#F27024] outline-none transition-all"
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

              {/* Desktop Config Button */}
              <button
                onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                className="hidden lg:flex h-10 px-4 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl font-bold text-xs uppercase items-center gap-2 hover:bg-slate-100 transition-all shadow-sm"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${isConfigExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                </svg>
                <span>{isConfigExpanded ? 'Ẩn cấu hình' : 'Hiện cấu hình'}</span>
              </button>
            </div>

            {/* Buttons Group — Scrollable on mobile if many items */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 w-full lg:w-auto min-w-0">
              <button
                onClick={() => handleSync(false)}
                disabled={syncing || clearing || selectedIds.size === 0}
                className="h-10 px-4 bg-[#F27024] hover:bg-orange-600 text-white rounded-xl font-bold disabled:opacity-30 transition-all flex items-center justify-center gap-2 shadow-sm uppercase text-[10px] sm:text-xs tracking-wider whitespace-nowrap"
              >
                {syncing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span>Đồng bộ lên Calendar ({selectedIds.size})</span>
                  </>
                )}
              </button>

              {isAdmin(firebaseUser?.email) && (
                <>
                  <div className="relative group shrink-0">
                     <button
                       onClick={handleGlobalSync}
                       disabled={isNotifying || syncing || clearing}
                       className={`h-10 px-3 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 text-[10px] sm:text-xs uppercase whitespace-nowrap ${
                         showNotifyConfirm ? 'bg-slate-900 text-white' : 'bg-slate-800 text-white hover:bg-slate-900'
                       }`}
                     >
                       {isNotifying ? (
                         <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                       ) : (
                         <>
                           <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                           <span className="hidden sm:inline">Đồng bộ cho mọi calendar giảng viên</span>
                           <span className="sm:hidden">Đồng bộ mọi GV</span>
                         </>
                       )}
                     </button>
 
                     {showNotifyConfirm && (
                       <div className="absolute top-full right-1/2 translate-x-1/2 lg:right-0 lg:translate-x-0 mt-4 w-72 xs:w-96 bg-white border border-slate-100 p-6 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.18)] z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                         <div className="text-center mb-4">
                           <h4 className="text-sm font-black text-blue-600 uppercase tracking-tight mb-1">ĐỒNG BỘ TỔNG THỂ?</h4>
                           <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest leading-relaxed">
                             Hệ thống sẽ đồng bộ lịch trực tiếp cho {notifiableLecturers.length} giảng viên.
                           </p>
                         </div>
                         
                          {/* 📋 NEW: List of lecturers to notify */}
                          <div className="max-h-48 overflow-y-auto mb-5 px-1 scrollbar-thin scrollbar-thumb-slate-200">
                            <div className="space-y-2">
                              {notifiableLecturers.map((lecturer, idx) => (
                                <div key={idx} className="flex flex-col p-2 bg-slate-50 rounded-xl border border-slate-100">
                                  <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold text-slate-700 truncate max-w-[150px]">{lecturer.name}</span>
                                    <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase">{lecturer.events.length} LỊCH</span>
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-medium truncate italic">{lecturer.email}</span>
                                </div>
                              ))}
                              {notifiableLecturers.length === 0 && (
                                <div className="text-center py-4 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Không có giảng viên phù hợp</div>
                              )}
                            </div>
                          </div>
 
                         <div className="flex gap-2">
                           <button 
                             onClick={() => executeNotifyLecturers(notifiableLecturers)} 
                             disabled={notifiableLecturers.length === 0}
                             className="flex-[1.5] py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-blue-100 transition-all disabled:opacity-50 disabled:bg-slate-300"
                           >
                             XÁC NHẬN ĐỒNG BỘ
                           </button>
                           <button 
                             onClick={() => { setShowNotifyConfirm(false); setIsNotifying(false); }} 
                             className="flex-1 py-3 bg-slate-50 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest outline-none hover:bg-slate-100 transition-all font-bold"
                           >
                             HỦY
                           </button>
                         </div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 lg:left-auto lg:right-8 w-4 h-4 bg-white rotate-45 translate-y-2 border-l border-t border-slate-100"></div>
                      </div>
                    )}
                  </div>

                  {/* 📧 NEW: Batch Invitation Button */}
                  <div className="relative group shrink-0">
                     <button
                       onClick={() => {
                         setShowNotifyConfirm(false);
                         setShowBatchInvitationConfirm(true);
                         setSyncError(null);
                       }}
                       disabled={isInvitingBatch || syncing || clearing}
                       className={`h-10 px-3 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 text-[10px] sm:text-xs uppercase whitespace-nowrap ${
                         showBatchInvitationConfirm ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100'
                       }`}
                     >
                       {isInvitingBatch ? (
                         <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                       ) : (
                         <>
                           <svg className="w-3.5 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                           <span className="hidden sm:inline">Mời giảng viên (Gửi mail mời)</span>
                           <span className="sm:hidden">Mời GV (Batch)</span>
                         </>
                       )}
                     </button>
 
                     {showBatchInvitationConfirm && (
                       <div className="absolute top-full right-1/2 translate-x-1/2 lg:right-0 lg:translate-x-0 mt-4 w-72 xs:w-96 bg-white border border-slate-100 p-6 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.18)] z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                         <div className="text-center mb-4">
                           <h4 className="text-sm font-black text-orange-600 uppercase tracking-tight mb-1">XÁC NHẬN GỬI MỜI?</h4>
                           <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest leading-relaxed">
                             Gửi 1 email tổng hợp cho {notifiableLecturers.length} giảng viên. Họ chỉ cần nhấn "Có" trong mail để xác nhận toàn bộ lịch.
                           </p>
                         </div>
                         
                          {/* 📋 NEW: List of lecturers to notify */}
                          <div className="max-h-48 overflow-y-auto mb-5 px-1 scrollbar-thin scrollbar-thumb-slate-200">
                            <div className="space-y-2">
                              {notifiableLecturers.map((lecturer, idx) => (
                                <div key={idx} className="flex flex-col p-2 bg-orange-50/50 rounded-xl border border-orange-100">
                                  <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold text-slate-700 truncate max-w-[150px]">{lecturer.name}</span>
                                    <span className="text-[9px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-md uppercase">{lecturer.events.length} LỊCH</span>
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-medium truncate italic">{lecturer.email}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                         <div className="flex gap-2">
                           <button 
                             onClick={() => executeBatchInvitationNotify(notifiableLecturers)} 
                             disabled={notifiableLecturers.length === 0}
                             className="flex-[1.5] py-3 bg-orange-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-orange-100 transition-all disabled:opacity-50 disabled:bg-slate-300"
                           >
                             XÁC NHẬN GỬI MỜI
                           </button>
                           <button 
                             onClick={() => { setShowBatchInvitationConfirm(false); setIsInvitingBatch(false); }} 
                             className="flex-1 py-3 bg-slate-50 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest outline-none hover:bg-slate-100 transition-all font-bold"
                           >
                             HỦY
                           </button>
                         </div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 lg:left-auto lg:right-8 w-4 h-4 bg-white rotate-45 translate-y-2 border-l border-t border-slate-100"></div>
                      </div>
                    )}
                  </div>

                  <div className="relative group shrink-0">
                    <button
                      onClick={() => {
                        setShowNotifyConfirm(false);
                        setIsNotifying(false);
                        setIsConfirmingClear(false);
                        setIsConfirmingGlobalRecall(true);
                      }}
                      disabled={syncing || clearing}
                      className={`h-10 px-3 rounded-xl font-bold transition-all text-[10px] sm:text-xs uppercase whitespace-nowrap border ${
                        isConfirmingGlobalRecall ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-600 border-rose-100'
                      }`}
                    >
                      Thu hồi
                    </button>

                    {isConfirmingGlobalRecall && (
                      <div className="absolute top-full right-0 mt-4 w-72 xs:w-80 bg-white border border-slate-100 p-6 rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="text-center mb-4">
                          <h4 className="text-sm font-black text-rose-600 uppercase tracking-tight mb-1">XÓA TẤT CẢ?</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">HÀNH ĐỘNG KHÔNG THỂ KHÔI PHỤC.</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={async () => { setIsConfirmingGlobalRecall(false); await globalRecallEvents(); }} className="flex-[1.5] py-2.5 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">Xác nhận</button>
                          <button onClick={() => setIsConfirmingGlobalRecall(false)} className="flex-1 py-2.5 bg-slate-50 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest outline-none">Hủy</button>
                        </div>
                        <div className="absolute bottom-full right-8 w-4 h-4 bg-white rotate-45 translate-y-2 border-l border-t border-slate-100"></div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="relative group shrink-0">
                <button
                  onClick={() => {
                    setShowNotifyConfirm(false);
                    setIsNotifying(false);
                    setIsConfirmingGlobalRecall(false);
                    setIsConfirmingClear(true);
                  }}
                  disabled={syncing || clearing}
                  className={`h-10 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm text-[10px] sm:text-xs uppercase whitespace-nowrap ${
                    isConfirmingClear ? 'bg-rose-600 text-white border-rose-600 shadow-rose-200' : 'bg-white text-slate-500 border-slate-200 hover:border-rose-500 hover:text-rose-500'
                  }`}
                >
                  {clearing ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      <span className="hidden sm:inline">Dọn dẹp</span>
                      <span className="sm:hidden">Xóa</span>
                    </>
                  )}
                </button>

                {isConfirmingClear && (
                  <div className="absolute top-full right-0 mt-4 w-72 xs:w-80 bg-white border border-slate-100 p-6 rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="text-center mb-4">
                      <h4 className="text-sm font-black text-rose-600 uppercase tracking-tight mb-1">DỌN DẸP LỊCH</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sẽ xóa sạch sự kiện cũ của bạn.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async () => { setIsConfirmingClear(false); const currentType = effectiveIsReview ? 'review' : 'council'; await clearAppEvents(currentType); }} className="flex-[1.5] py-2.5 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">Xác nhận</button>
                      <button onClick={() => setIsConfirmingClear(false)} className="flex-1 py-2.5 bg-slate-50 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest outline-none">Hủy</button>
                    </div>
                    <div className="absolute bottom-full right-8 w-4 h-4 bg-white rotate-45 translate-y-2 border-l border-t border-slate-100"></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 min-h-0 overflow-hidden bg-white">
            {(!isRestored || loading || mappingLoading || isFetchingData || !isMappingSettled || isSemestersLoading) ? (
              <div className="h-full flex flex-col items-center justify-center bg-slate-50/30">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-[#F27024] rounded-full animate-spin mb-4" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Đang nạp dữ liệu...</p>
              </div>
            ) : (
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
            )}
          </div>
        </section>
      )}

      {/* Global Components: Alerts & Toasts */}
      <InternalConflictModal
        isOpen={internalConflictOpen}
        conflictGroups={internalConflictGroups}
        onAcceptAll={() => {
          setInternalConflictOpen(false);
          doSyncRows(pendingAllRows);
        }}
        onSyncSelected={(selectedEvents) => {
          setInternalConflictOpen(false);
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

export default LecturerDashboard;
