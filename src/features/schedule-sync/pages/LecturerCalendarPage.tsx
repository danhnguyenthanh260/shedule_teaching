
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useFirebase } from '../../../context/FirebaseContext';
import { useAppPersistence } from '../../../hooks/useAppPersistence';
import { useSheetParser } from '../../../hooks/useSheetParser';
import { configService, SemesterConfig } from '../../../services/configService';
import { ExcelImport } from '../../../components/ExcelImport';
import { khongDau } from '../../../utils/stringUtils';
import { RowNormalized } from '../../../types';
import { ref, onValue } from 'firebase/database';
import { database } from '../../../config/firebase';
import { Link } from 'react-router-dom';
import { syncToNativeGuest } from '../../../services/appsScriptService';

export const LecturerCalendarPage: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user: firebaseUser, accessToken, logout, isAdmin } = useFirebase();
  const persistence = useAppPersistence();
  const {
    sheetUrl, setSheetUrl,
    tabName, setTabName,
    sheetMeta, setSheetMeta,
    headerRowIndex, setHeaderRowIndex,
    allRows, setAllRows,
    fullHeaders, setFullHeaders,
    fullDetailHeaders, setFullDetailHeaders,
    setTitleRow,
    setFullRows,
    dateFormat, setDateFormat,
    selectedSemesterId, setSelectedSemesterId,
    sheetType,
    setSheetType,
    isRestored,
    columnMap, setColumnMap,
    columnsConfig, setColumnsConfig
  } = persistence;

  const [semesters, setSemesters] = useState<Record<string, SemesterConfig>>({});
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isSemestersLoading, setIsSemestersLoading] = useState(true);
  const [lecturerWhitelist, setLecturerWhitelist] = useState<Record<string, any>>({});
  const [searchColumnIndices, setSearchColumnIndices] = useState<number[]>([]);
  const [parserError, setParserError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Get Whitelist for mapping
  useEffect(() => {
    const lecturerRef = ref(database, 'lecturer_whitelist');
    return onValue(lecturerRef, (snapshot) => {
      setLecturerWhitelist(snapshot.val() || {});
    });
  }, []);

  // Fetch configs
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
  }, []);

  const effectiveIsReview = useMemo(() => {
    const fromConfig = semesters[selectedSemesterId]?.sheetType;
    if (fromConfig) return fromConfig === 'review';
    return !!sheetMeta?.isDataMau;
  }, [semesters, selectedSemesterId, sheetMeta]);

  const { rows, applyHeaderRow, applyMapping } = useSheetParser({
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
    dateFormat,
    searchColumnIndices,
    setSearchColumnIndices,
    isReviewMode: effectiveIsReview,
    currentMapping: columnMap
  });

  const [targetSyncEmail, setTargetSyncEmail] = useState('');
  const [isSyncingToEmail, setIsSyncingToEmail] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'success' | 'error', message?: string }>({ type: 'idle' });

  const [isRefreshingBeforeSync, setIsRefreshingBeforeSync] = useState(false);

  const handleSyncToEmail = () => {
    if (!targetSyncEmail || !targetSyncEmail.includes('@')) {
      alert('Vui lòng nhập email hợp lệ (ví dụ: truongdat@gmail.com)');
      return;
    }
    if (!persistence.personFilter) {
      alert('Vui lòng chọn giảng viên trước');
      return;
    }

    // Mở Modal xác nhận tùy chỉnh thay vì window.confirm
    setShowConfirmModal(true);
  };

  const proceedWithSync = async () => {
    setShowConfirmModal(false);
    setIsSyncingToEmail(true);
    setSyncStatus({ type: 'idle' });

    try {
      const lecturerName = availableLecturers.find(l => l.handle === persistence.personFilter)?.label || persistence.personFilter;
      
      // Convert FullCalendar events back to plain objects for GAS
      const syncEvents = calendarEvents.map(ev => {
        const loc = ev.extendedProps.location || 'N/A';
        const isCouncil = sheetType === 'council';
        const typeLabel = isCouncil ? 'Hội đồng' : 'Review';

        return {
          rowId: ev.id,
          code: ev.extendedProps.code || "",
          title: `Lịch ${typeLabel}: ${lecturerName} (${loc})`,
          start: typeof ev.start === 'string' ? ev.start : (ev.start as Date).toISOString(),
          end: typeof ev.end === 'string' ? ev.end : (ev.end as Date).toISOString(),
          location: loc,
          description: "" // 🛑 ĐÃ XÓA TRỐNG: Loại bỏ hoàn toàn Nhóm/Đề tài/Hội đồng theo yêu cầu
        };
      });

      const res = await syncToNativeGuest(
        targetSyncEmail,
        lecturerName,
        persistence.personFilter,
        syncEvents,
        sheetType === 'review' ? 'review' : 'council',
        sheetUrl // 🚀 NEW: Truyền thêm URL để Backend tự động nhận diện ID Sheet
      );

      setSyncStatus({ type: 'success', message: res.message });
    } catch (err: any) {
      console.error('Sync Error:', err);
      setSyncStatus({ type: 'error', message: err.message || 'Có lỗi xảy ra khi đồng bộ.' });
    } finally {
      setIsSyncingToEmail(false);
    }
  };

  // Handle data loaded
  const handleDataLoaded = useCallback((data: any) => {
    setAllRows(data.rawRows);
    setSheetMeta({
      sheetId: data.sheetId,
      tab: data.tabName,
      headerRowIndex: data.headerRowIndex,
      isDataMau: semesters[selectedSemesterId]?.sheetType === 'review' || data.isDataMau,
      sheetType: data.sheetType
    });
    setSheetType(data.sheetType || null);
    applyHeaderRow(data.headerRowIndex, data.rawRows, { sheetId: data.sheetId, tab: data.tabName });
  }, [selectedSemesterId, semesters, setSheetMeta, setSheetType, applyHeaderRow, setAllRows]);

  // Apply mapping automatically when semester/data changes
  useEffect(() => {
    if (!isRestored || allRows.length === 0) return;
    
    const adminConfig = semesters[selectedSemesterId];
    if (adminConfig && adminConfig.mapping) {
       setColumnMap(adminConfig.mapping);
       setColumnsConfig(adminConfig.columns || '');
       applyMapping(adminConfig.mapping, effectiveIsReview);
    }
  }, [isRestored, allRows, semesters, selectedSemesterId, effectiveIsReview, applyMapping]);

  // Extract Email Logic (copied from Dashboard for consistency)
  const extractEmail = useCallback((val: string) => {
    if (!val) return null;
    const str = val.trim();
    if (!str) return null;
    
    let handle = "";
    if (str.includes('(') && str.includes(')')) {
      handle = str.split('(')[1].split(')')[0].trim().toLowerCase();
    } else if (str.includes('@')) {
      handle = str.split('@')[0].trim().toLowerCase();
    } else {
      const nonAccented = khongDau(str);
      const parts = nonAccented.split(' ');
      handle = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    if (!handle) return null;

    const lecturers = Object.values(lecturerWhitelist);
    const matchedLecturer: any = lecturers.find((l: any) => {
      const lCode = khongDau(l.code || "").replace(/[^a-z0-9]/g, '').toLowerCase();
      const lEmailPrefix = (l.email || "").split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const lNameNoDau = khongDau(l.name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
      const inputNoDau = khongDau(str).toLowerCase().replace(/[^a-z0-9]/g, '');
      return lCode === handle || lEmailPrefix === handle || (lNameNoDau === inputNoDau && inputNoDau.length > 5);
    });

    if (matchedLecturer?.email) return matchedLecturer.email.toLowerCase();
    return `${handle}@fpt.edu.vn`;
  }, [lecturerWhitelist]);

  // Detect lecturers from data
  const availableLecturers = useMemo(() => {
    const map = new Map<string, string>(); // handle -> original string
    
      const addPerson = (val: string) => {
        if (!val || typeof val !== 'string') return;
        const str = val.trim();
        if (!str || str.toUpperCase().startsWith('#N/A') || str.includes('#REF!')) return;

        let handle = "";
        if (str.includes('(') && str.includes(')')) {
          handle = str.split('(')[1].split(')')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        } else if (str.includes('@')) {
          handle = str.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        } else {
          const nonAccented = khongDau(str).toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const parts = nonAccented.split(' ');
          handle = parts[parts.length - 1]; // Lấy chữ cuối làm handle
        }

        // 🛡️ CHẶN TIẾP: Nếu handle là 'na' hoặc chỉ có số (ngày/giờ nhầm lẫn)
        if (handle && handle !== 'na' && isNaN(Number(handle)) && !map.has(handle)) {
          map.set(handle, str);
        }
      };

    rows.forEach(r => {
      if (r.person) addPerson(r.person);
      if (r.reviewers) r.reviewers.forEach((p: string) => addPerson(p));
      if (r.email) addPerson(r.email);
    });

    return Array.from(map.entries())
      .map(([handle, label]) => ({ handle, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  // Filter rows for selected lecturer
    const calendarEvents = useMemo(() => {
      const filterHandle = persistence.personFilter;
      if (!filterHandle || rows.length === 0) return [];
      
      const userRows = rows.filter(r => {
        const identifiers: string[] = [];
        
        const getHandle = (s: string) => {
          if (!s || typeof s !== 'string') return '';
          const str = s.trim();
          if (str.includes('(') && str.includes(')')) {
            return str.split('(')[1].split(')')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          }
          if (str.includes('@')) {
            return str.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          }
          // Dùng logic khongDau đồng nhất với availableLecturers
          const clean = khongDau(str).toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const parts = clean.split(' ');
          return parts[parts.length - 1]; // Lấy chữ cuối làm handle
        };
        
        if (r.email) identifiers.push(getHandle(r.email));
        if (r.reviewers && Array.isArray(r.reviewers)) {
          r.reviewers.forEach(rev => {
            if (rev) identifiers.push(getHandle(rev));
          });
        }
        if (r.person) identifiers.push(getHandle(r.person));
      
      const hasInIdentifiers = identifiers.some(id => id && id === filterHandle);
      const hasInRaw = r.rawRow && typeof r.rawRow === 'string' && r.rawRow.toLowerCase().includes(filterHandle);
      
      return hasInIdentifiers || hasInRaw;
    });

    return userRows.map(r => ({
      id: r.id,
      title: filterHandle,
      start: r.startTime,
      end: r.endTime,
      extendedProps: {
        location: r.location,
        code: r.code,
        group: r.groupName,
        person: r.person,
        task: r.task,
        reviewers: r.reviewers,
        subCodes: r.subCodes,
        rawRow: r.rawRow
      },
      backgroundColor: r.sheetType === 'council' ? '#ef4444' : '#3f51b5',
      borderColor: 'transparent',
      textColor: '#ffffff'
    }));
  }, [rows, persistence.personFilter]);

  // Mini-calendar logic
  const miniCalendarDays = useMemo(() => {
    const year = miniCalendarDate.getFullYear();
    const month = miniCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // We want Monday as first day? The header says C (Chủ nhật), T (Thứ 2)...
    // So Sunday is 0.
    
    const days = [];
    // Padding for empty days before first of month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [miniCalendarDate]);

  const goToDate = (date: Date) => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      calendarApi.gotoDate(date);
      calendarApi.changeView('timeGridDay');
    }
  };

  const handlePrevMonth = () => {
    setMiniCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setMiniCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Auto-switch to Day view on small screens
  useEffect(() => {
    const handleResize = () => {
      const calendarApi = calendarRef.current?.getApi();
      if (window.innerWidth < 768 && calendarApi?.view.type === 'timeGridWeek') {
        calendarApi.changeView('timeGridDay');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-white overflow-hidden font-sans text-slate-900 relative">
      {/* 🟢 MOBILE OVERLAY */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* 🟢 LEFT SIDEBAR - Drawer on Mobile, Fixed on Desktop */}
      <aside className={`
        fixed inset-y-0 left-0 w-72 bg-white z-[300] transform transition-transform duration-300 ease-in-out border-r border-slate-200
        lg:translate-x-0 lg:static lg:flex lg:w-64 lg:shrink-0 lg:z-auto h-screen
        ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
       flex flex-col p-0 overflow-y-auto overflow-x-hidden custom-scrollbar`}>
        <div className="p-4 pt-8">
          {/* Mini Calendar Container */}
          <div className="px-1">
             <div className="flex items-center justify-between px-2 mb-4">
                <h3 className="text-[13px] font-bold text-slate-800 capitalize">
                  {miniCalendarDate.toLocaleString('vi-VN', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex gap-0.5">
                  <button 
                    onClick={handlePrevMonth}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button 
                    onClick={handleNextMonth}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-px text-center mb-2">
                {['C', 'T', 'T', 'T', 'T', 'T', 'T'].map((d, i) => (
                  <span key={i} className="text-[9px] font-bold text-slate-400 py-2 uppercase tracking-tighter">{d}</span>
                ))}
                {miniCalendarDays.map((date, i) => {
                  if (!date) return <div key={`empty-${i}`} className="aspect-square" />;
                  
                  const dayNum = date.getDate();
                  const today = new Date();
                  const isToday = dayNum === today.getDate() && 
                                  date.getMonth() === today.getMonth() && 
                                  date.getFullYear() === today.getFullYear();
                  
                  const dayDateStr = date.toDateString();
                  const hasEvents = calendarEvents.some(ev => new Date(ev.start).toDateString() === dayDateStr);

                  return (
                    <div key={i} className="aspect-square flex items-center justify-center p-0.5">
                      <button
                        onClick={() => goToDate(date)}
                        className={`text-[11px] w-full h-full flex items-center justify-center rounded-full transition-all group relative
                          ${isToday ? 'bg-blue-600 text-white font-black shadow-sm' : 
                            hasEvents ? 'bg-blue-100 text-blue-800 font-extrabold ring-1 ring-blue-200 hover:bg-blue-200' : 'text-slate-600 hover:bg-slate-100 font-medium'}`}
                      >
                        {dayNum}
                        {hasEvents && !isToday && (
                          <span className="absolute bottom-1 w-1 h-1 bg-blue-600 rounded-full scale-0 group-hover:scale-100 transition-transform" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
          </div>

          {/* 1. Semester Selection - MOVED TOP */}
          <div className="mt-8 px-4">
             <div className="flex items-center gap-2 mb-4 px-1">
                <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Học kỳ giảng dạy</h3>
             </div>
             <div>
                <ExcelImport
                  accessToken={accessToken}
                  onDataLoaded={handleDataLoaded}
                  onLoadingStart={() => {
                    setIsFetchingData(true);
                    setParserError(null);
                  }}
                  setLoading={setIsFetchingData}
                  setError={setParserError}
                  sheetUrl={sheetUrl}
                  setSheetUrl={setSheetUrl}
                  tabName={tabName}
                  setTabName={setTabName}
                  startRow={persistence.startRow}
                  setStartRow={persistence.setStartRow}
                  columnsConfig={persistence.columnsConfig}
                  setColumnsConfig={persistence.setColumnsConfig}
                  dateFormat={persistence.dateFormat}
                  setDateFormat={persistence.setDateFormat}
                  selectedSemesterId={selectedSemesterId}
                  setSelectedSemesterId={setSelectedSemesterId}
                  semesters={semesters}
                />
             </div>
          </div>

          {/* 2. Search Box - MOVED BOTTOM & REDESIGNED */}
          <div className="mt-10 px-4">
             <div className="flex items-center gap-2 mb-4 px-1">
                <div className="w-1 h-4 bg-orange-500 rounded-full"></div>
                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Chọn giảng viên</h3>
             </div>
             <div className="relative group">
                <select
                  value={persistence.personFilter}
                  onChange={(e) => persistence.setPersonFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none font-bold text-slate-700 appearance-none cursor-pointer hover:bg-slate-100"
                >
                  <option value="">-- Chọn tên giảng viên --</option>
                  {availableLecturers.map(lec => (
                    <option key={lec.handle} value={lec.handle}>
                      {lec.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                </div>
             </div>
             
             {rows.length > 0 && availableLecturers.length === 0 && (
               <p className="mt-2 text-[10px] text-rose-500 font-medium px-1 flex gap-1 items-center">
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 Không tìm thấy tên giảng viên trong dữ liệu.
               </p>
             )}

             {rows.length > 0 && availableLecturers.length > 0 && (
               <p className="mt-2 text-[10px] text-slate-400 italic px-1">
                 Có {availableLecturers.length} giảng viên được phát hiện.
               </p>
             )}
          </div>

          {/* 📧 3. Native Email Sync - REDESIGNED */}
          <div className="mt-10 mb-20 px-4">
             <div className="flex items-center gap-2 mb-4 px-1">
                <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Đồng bộ Calendar</h3>
             </div>
             
             <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-2xl p-5 border border-slate-200 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
               {/* Decorative background element */}
               <div className="absolute -right-6 -top-6 w-20 h-20 bg-blue-50 rounded-full blur-2xl group-hover:bg-blue-100 transition-colors duration-500" />
               
               <p className="relative z-10 text-[10px] text-slate-500 font-bold mb-4 leading-relaxed uppercase tracking-wider flex items-center gap-2">
                 <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                 Nhập Gmail nhận lời mời
               </p>
               
               <div className="relative z-10 space-y-4">
                 <div className="relative group/input">
                   <input 
                     type="email"
                     value={targetSyncEmail}
                     onChange={(e) => setTargetSyncEmail(e.target.value)}
                     placeholder="Ví dụ: truongdat@gmail.com"
                     className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none font-bold text-slate-700 placeholder:text-slate-300"
                   />
                 </div>

                 <button
                   onClick={handleSyncToEmail}
                   disabled={isSyncingToEmail || !targetSyncEmail || !persistence.personFilter}
                   className={`w-full py-4 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-30 disabled:grayscale ${
                     syncStatus.type === 'success' 
                      ? 'bg-emerald-500 text-white shadow-emerald-200/50' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200/50'
                   }`}
                 >
                   {isSyncingToEmail ? (
                     <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                   ) : (
                     <>
                        {syncStatus.type === 'success' ? (
                          <svg className="w-4 h-4 animate-in zoom-in duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        ) : null}
                        <span>{syncStatus.type === 'success' ? 'Đã gửi thành công' : 'Đồng bộ'}</span>
                     </>
                   )}
                 </button>

                 <div className="flex gap-2 items-start px-1 opacity-60">
                    <svg className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-[9px] text-slate-500 font-medium leading-relaxed italic">
                      Google sẽ gửi lời mời (RSVP) tới mail này. Vui lòng xác nhận trong hộp thư.
                    </p>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </aside>

      {/* 🔵 RIGHT MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Header - Premium Redesign */}
        <header className="flex-none h-16 flex items-center justify-between px-4 sm:px-6 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-[100]">
          <div className="flex items-center gap-2 sm:gap-5">
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl lg:hidden"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <img src="https://www.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_5_2x.png" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm" alt="logo" />
              <div className="flex flex-col">
                <span className="text-base sm:text-xl text-slate-800 font-semibold tracking-tight leading-none">Lịch trình</span>
                <span className="hidden sm:inline text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">FPT University</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Dashboard Navigation - Only for Admins */}
            {isAdmin && (
              <Link
                to="/dashboard"
                className="flex items-center justify-center w-10 h-10 sm:w-auto sm:px-4 sm:py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm border border-blue-100 hover:bg-blue-100 transition-all shadow-sm"
                title="Truy cập Bảng điều khiển"
              >
                <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span className="hidden sm:inline ml-2">Bảng điều khiển</span>
              </Link>
            )}

            {/* Navigation for Admins */}
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center justify-center w-10 h-10 sm:w-auto sm:px-4 sm:py-2 bg-slate-800 text-white rounded-xl font-bold text-sm shadow-md hover:bg-slate-900 transition-all"
              >
                <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline ml-2">Quản trị</span>
              </Link>
            )}

            <div className="flex items-center gap-3 ml-2">
              {firebaseUser ? (
                <button 
                  onClick={() => {
                    persistence.clearPersistence();
                    logout();
                  }}
                  className="px-4 py-2 text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-xl font-bold text-sm transition-all"
                >
                  Đăng xuất
                </button>
              ) : (
                <Link
                  to="/admin"
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition-all active:scale-95"
                >
                  Đăng nhập
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* Calendar Body */}
        <main className="flex-1 min-h-0 bg-white border-l border-slate-100">
           {isFetchingData || isSemestersLoading ? (
            <div className="flex-1 h-full flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-[9px] font-black text-slate-400 tracking-widest animate-pulse uppercase">Nạp lịch trình</p>
            </div>
          ) : rows.length === 0 ? (
             <div className="flex-1 h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-4xl">📭</div>
                <h3 className="text-lg font-bold text-slate-800 mb-2 uppercase tracking-tight">Chưa có dữ liệu học kỳ</h3>
                <p className="max-w-xs text-xs text-slate-400 leading-relaxed font-medium">Vui lòng chọn một học kỳ trên thanh công cụ để tải dữ liệu lịch giảng dạy của bạn.</p>
             </div>
          ) : calendarEvents.length === 0 ? (
             <div className="flex-1 h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-20 h-20 bg-blue-50/50 rounded-full flex items-center justify-center mb-6 overflow-hidden">
                  <img src="https://www.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_5_2x.png" className="w-10 h-10" alt="calendar-icon" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2 uppercase tracking-tight">Vui lòng chọn giảng viên</h3>
                <p className="max-w-xs text-xs text-slate-400 leading-relaxed font-medium">
                  Hệ thống đã nạp {rows.length} dòng dữ liệu. <br/> Hãy chọn tên của bạn hoặc bất kỳ giảng viên nào trong danh sách bên trái để xem lịch.
                </p>
             </div>
          ) : (
             <div className="h-full custom-calendar google-style">
               <FullCalendar
                 ref={calendarRef}
                 plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                 initialView="timeGridWeek"
                 nowIndicator={false}
                 firstDay={1}
                 headerToolbar={{
                   left: 'prev,next today title',
                   center: '',
                   right: 'dayGridMonth,timeGridWeek,timeGridDay'
                 }}
                 events={calendarEvents}
                 height="100%"
                 locale="vi"
                 slotDuration="01:00:00"
                 slotLabelInterval="01:00:00"
                 dayHeaderContent={(arg) => {
                   const isToday = arg.isToday;
                   const dayName = arg.date.toLocaleDateString('vi-VN', { weekday: 'short' }).toUpperCase();
                   const dayNum = arg.date.getDate();
                   return (
                     <div className={`flex flex-col items-center py-1 ${isToday ? 'text-[#1a73e8]' : 'text-[#70757a]'}`}>
                       <span className="text-[10px] font-bold mb-0.5 tracking-wider">{dayName}</span>
                       <span className={`text-[14px] font-normal w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isToday ? 'bg-[#1a73e8] text-white' : 'hover:bg-[#f1f3f4]'}`}>
                         {dayNum}
                       </span>
                     </div>
                   );
                 }}
                 eventContent={(arg) => {
                   const { event } = arg;
                   const props = event.extendedProps;
                   const timeText = event.start ? event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '') : '';
                   const endTimeText = event.end ? event.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '') : '';
                   const isMobile = window.innerWidth < 768;
                   const isDayView = arg.view.type === 'timeGridDay';
                   const hasSubCodes = isDayView && props.subCodes && props.subCodes.length > 0;

                   // Responsive font sizes
                   const isMonthView = arg.view.type === 'dayGridMonth';
                    let titleSize = 'text-[10px]';
                    let infoSize = 'text-[9px]';
                    let subSize = 'text-[8px]';

                    if (isDayView) {
                      titleSize = isMobile ? 'text-[13px]' : 'text-[15px]';
                      infoSize = isMobile ? 'text-[11px]' : 'text-[13px]';
                      subSize = isMobile ? 'text-[10px]' : 'text-[13px]';
                    } else if (isMonthView) {
                      titleSize = 'text-[9px]';
                      infoSize = 'text-[8px]';
                      subSize = 'text-[7px]';
                    }

                   return (
                     <div className={`flex ${hasSubCodes ? 'flex-row items-center gap-2 sm:gap-5' : 'flex-col'} h-full overflow-hidden leading-tight ${isMonthView ? "py-0.5 px-0.5" : "py-1 px-1.5"} border-l-2 border-white/30`}>
                       {/* 📍 Left: Main Info */}
                       <div className={`${hasSubCodes ? 'flex-none min-w-[120px] sm:min-w-[180px] pr-2 sm:pr-5 border-r border-white/20' : ''}`}>
                         <div className={`font-bold ${titleSize} truncate uppercase leading-tight`}>{event.title}</div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5 overflow-hidden">
                             <div className={`${infoSize} font-medium opacity-90 truncate shrink-0`}>{timeText} – {endTimeText}</div>
                             {props.task && (
                               <div className={`${infoSize} font-medium opacity-80 truncate leading-tight flex-1 border-l-2 border-white/20 pl-2 hidden sm:block`}>
                                 {props.task}
                               </div>
                             )}
                          </div>
                          {props.task && (
                             <div className={`${infoSize} font-medium opacity-80 truncate mt-0.5 leading-tight sm:hidden`}>
                               {props.task}
                             </div>
                          )}
                          {props.location && (
                            <div className={`${infoSize} font-bold opacity-100 truncate mt-1 whitespace-nowrap overflow-hidden bg-white/10 ${isMonthView ? "px-1 py-0" : "px-2 py-0.5"} rounded-md inline-block shrink-0`}>{props.location}</div>
                          )}
                       </div>
                       
                       {/* 🏷️ Right: Sub-items (column F data) */}
                       {hasSubCodes && (
                         <div className="flex-1 min-w-0">
                           <div className={`${subSize} font-bold text-white grid grid-cols-2 gap-1.5 sm:gap-3 overflow-visible`}>
                              {props.subCodes.map((code, idx) => (
                                <div key={idx} className="bg-white/20 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg border border-white/10 whitespace-normal leading-tight flex items-start gap-1 sm:gap-2 break-words shadow-sm">
                                  <span className="opacity-60 mt-1 flex-shrink-0 text-[8px] sm:text-[10px]">●</span>
                                  <span className={isMobile ? 'line-clamp-1' : ''}>{code}</span>
                                </div>
                              ))}
                           </div>
                         </div>
                       )}
                     </div>
                   );
                 }}
                 buttonText={{ today: 'Hôm nay', month: 'Tháng', week: 'Tuần', day: 'Ngày' }}
                 slotLabelFormat={{ hour: 'numeric', meridiem: 'short', hour12: true }}
                 slotMinTime="07:00:00"
                 slotMaxTime="21:00:00"
                 allDaySlot={false}
                 stickyHeaderDates={true}
                 handleWindowResize={true}
                 expandRows={true}
                 eventDisplay="block"
               />
             </div>
          )}
        </main>
      </div>

      {/* 🟢 MODERN CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowConfirmModal(false)} />
          <div className="bg-white rounded-[28px] w-full max-w-sm overflow-hidden shadow-2xl relative z-10 animate-in zoom-in slide-in-from-bottom-8 duration-500 border border-slate-100">
            <div className="p-8 pb-4 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 rotate-3">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2 leading-none">Xác nhận đồng bộ?</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed font-medium px-2">
                Hệ thống sẽ đồng bộ lịch của <span className="text-blue-600 font-bold">{persistence.personFilter}</span> tới email <span className="text-slate-800 font-bold underline decoration-blue-200 decoration-2 underline-offset-2">{targetSyncEmail}</span>.
              </p>
              
              <div className="mt-5 w-full bg-amber-50 rounded-xl p-3 flex gap-3 items-start text-left">
                <svg className="w-4 h-4 text-amber-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-[11px] text-amber-700 font-bold leading-tight">Google Calendar sẽ gửi email mời xác nhận. Vui lòng hướng dẫn giảng viên bấm "Có" trong mail.</span>
              </div>
            </div>
            <div className="p-6 flex gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-4 text-[11px] font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all uppercase tracking-widest"
              >
                Hủy
              </button>
              <button 
                onClick={proceedWithSync}
                className="flex-1 py-4 text-[11px] font-black bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all uppercase tracking-widest"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔵 MODERN STATUS MODAL (SUCCESS/ERROR) */}
      {syncStatus.type !== 'idle' && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSyncStatus({ type: 'idle' })} />
          <div className="bg-white rounded-[28px] w-full max-w-sm overflow-hidden shadow-2xl relative z-10 animate-in zoom-in slide-in-from-bottom-8 duration-500 border border-slate-100">
            <div className="p-8 pb-4 flex flex-col items-center text-center">
              <div className={`w-16 h-16 ${syncStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} rounded-2xl flex items-center justify-center mb-6`}>
                {syncStatus.type === 'success' ? (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                )}
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2 leading-none">
                {syncStatus.type === 'success' ? 'Hoàn tất!' : 'Có lỗi xảy ra'}
              </h3>
              <p className="text-[13px] text-slate-500 leading-relaxed font-medium px-4">
                {syncStatus.message}
              </p>
            </div>
            <div className="p-6">
              <button 
                onClick={() => setSyncStatus({ type: 'idle' })}
                className={`w-full py-4 text-[11px] font-black ${syncStatus.type === 'success' ? 'bg-emerald-600 shadow-emerald-200' : 'bg-slate-800 shadow-slate-200'} text-white rounded-2xl shadow-lg transition-all uppercase tracking-widest active:scale-95`}
              >
                Đóng thông báo
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* 🎨 THE GOOGLE CALENDAR REDESIGN */
        .google-style.fc {
          --fc-border-color: #bdc1c6;
          --fc-today-bg-color: transparent !important;
          --fc-now-indicator-color: #ea4335;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: transparent;
          --fc-list-event-hover-bg-color: #f1f3f4;
          --fc-event-bg-color: #3f51b5; 
          --fc-event-border-color: #ffffff;
          font-family: 'Roboto', 'Inter', -apple-system, sans-serif;
        }

        /* 📱 Responsive Horizontal Scroll for Week View */
        @media (max-width: 768px) {
          .google-style .fc-view-harness { overflow-x: auto !important; }
          .google-style .fc-timeGridWeek-view { min-width: 800px !important; }
        }

        .google-style .fc-icon { font-family: 'fcicons' !important; }
        .google-style .fc-day-today { background-color: transparent !important; }
        .google-style .fc-timegrid-col.fc-day-today { background-color: transparent !important; }

        .google-style .fc-toolbar {
          padding: 8px 12px !important;
          border-bottom: 1px solid #bdc1c6;
          background: white;
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 8px !important;
          justify-content: space-between !important;
        }

        @media (max-width: 768px) {
          .google-style .fc-toolbar { padding: 8px !important; flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .google-style .fc-toolbar-chunk:first-child { display: flex !important; justify-content: space-between !important; width: 100% !important; align-items: center !important; }
          .google-style .fc-today-button { order: 1 !important; margin: 0 !important; margin-right: 8px !important; padding: 6px 10px !important; font-size: 12px !important; }
          .google-style .fc-toolbar-chunk:first-child .fc-button-group { order: 2 !important; margin: 0 !important; }
          .google-style .fc-toolbar-title { order: 3 !important; font-size: 14px !important; font-weight: 700 !important; margin: 0 !important; color: #3c4043 !important; flex: 1; text-align: right; }
          .google-style .fc-toolbar-chunk:last-child { width: 100% !important; display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 4px !important; padding-top: 8px !important; border-top: 1px solid #f1f3f4 !important; }
          .google-style .fc-toolbar-chunk:last-child .fc-button { width: 100% !important; margin: 0 !important; padding: 8px 0 !important; justify-content: center !important; }
        }

        .google-style .fc-button-group { background: #f1f3f4; padding: 3px; border-radius: 12px; border: 1px solid #e8eaed; display: flex !important; gap: 2px; }
        .google-style .fc-button-group .fc-button {
          background: transparent !important; border: none !important; color: #5f6368 !important; font-weight: 600 !important; font-size: 13px !important;
          text-transform: none !important; border-radius: 9px !important; padding: 8px 16px !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: none !important; flex: 1; display: flex; align-items: center; justify-content: center; min-width: 60px; margin: 0 !important;
        }

        .google-style .fc-toolbar-chunk .fc-button-group:first-child { background: transparent !important; border: none !important; padding: 0 !important; }
        .google-style .fc-button-group .fc-button:hover { background: rgba(60, 64, 67, 0.08) !important; color: #202124 !important; }
        .google-style .fc-button-group .fc-button-active { background: #1a73e8 !important; color: white !important; box-shadow: 0 4px 10px rgba(26, 115, 232, 0.3) !important; }

        .google-style .fc-today-button {
          margin-left: 12px !important; margin-right: 12px !important; background: white !important; border: 1px solid #dadce0 !important;
          color: #3c4043 !important; border-radius: 8px !important; font-weight: 600 !important; padding: 8px 16px !important;
          transition: all 0.2s !important; font-size: 13px !important; text-transform: none !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
        }

        .google-style .fc-today-button:hover { background: #f8f9fa !important; border-color: #d2d4d7 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.08) !important; }
        .google-style .fc-today-button:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }

        .google-style .fc-prev-button, .google-style .fc-next-button { border: none !important; background: transparent !important; padding: 8px !important; border-radius: 50% !important; margin: 0 4px !important; }
        .google-style .fc-prev-button:hover, .google-style .fc-next-button:hover { background-color: #f1f3f4 !important; }

        .google-style .fc-timegrid-axis-cushion::before {
          content: 'GMT+07'; display: block; font-size: 10px; color: #70757a; font-weight: 400; position: absolute; top: 10px; left: 12px;
        }

        .google-style .fc-timegrid-slot-label-cushion {
          display: inline-block; font-size: 10px; color: #70757a; transform: translateY(-50%); padding-right: 12px !important;
          font-weight: 400; text-transform: uppercase; background: white; position: relative; z-index: 2;
        }

        .google-style .fc-timegrid-slot { min-height: 52px !important; border-bottom: 1px solid #bdc1c6 !important; }
        .google-style .fc-timegrid-axis-frame { width: 84px !important; border-right: none !important; }
        .google-style .fc-timegrid-slot-label { border-right: none !important; overflow: visible !important; }

        .google-style .fc-timegrid-slots tr .fc-timegrid-slot-label::after {
          content: ''; position: absolute; right: 0; top: 0; width: 100vw; height: 1px; background: #bdc1c6; z-index: 1;
        }

        .google-style .fc-col-header-cell { border-bottom: 1px solid #bdc1c6 !important; border-left: none !important; background: white !important; }
        .google-style .fc-theme-standard td, .google-style .fc-theme-standard th { border-right: 1px solid #bdc1c6 !important; }

        .google-style .fc-v-event, .google-style .fc-daygrid-event, .google-style .fc-daygrid-block-event {
          background-color: #3f51b5 !important; border: none !important; border-radius: 4px !important;
          box-shadow: 0 1px 1px rgba(60,64,67,0.3) !important; color: white !important;
        }

        .google-style .fc-daygrid-event:hover { filter: brightness(0.9); }
        .fc-timegrid-now-indicator-line, .fc-timegrid-now-indicator-arrow, .google-style .fc-timegrid-now-indicator-line, .google-style .fc-timegrid-now-indicator-arrow {
          display: none !important; visibility: hidden !important; opacity: 0 !important;
        }

        /* 🎨 Custom Scrollbar for Sidebar */
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};
