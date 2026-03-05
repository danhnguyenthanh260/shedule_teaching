
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

export const LecturerCalendarPage: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { user: firebaseUser, accessToken, logout } = useFirebase();
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

  // Filter rows for current user
  const calendarEvents = useMemo(() => {
    if (!firebaseUser?.email || rows.length === 0) return [];
    
    // Get the identifying handle of the current user (e.g. 'ngohoangtruongdat')
    const userHandle = firebaseUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Filter rows where user is involved by checking handle
    const userRows = rows.filter(r => {
      const identifiers: string[] = [];
      
      // Get handles from available fields
      const getHandle = (s: string) => {
        if (!s || typeof s !== 'string') return '';
        return s.split('@')[0].split('(')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      };
      
      if (r.email) identifiers.push(getHandle(r.email));
      if (r.reviewers && Array.isArray(r.reviewers)) {
        r.reviewers.forEach(rev => {
          if (rev) identifiers.push(getHandle(rev));
        });
      }
      if (r.person) identifiers.push(getHandle(r.person));
      
      // Also check if the raw row has the handle anywhere just in case
      const hasInIdentifiers = identifiers.some(id => id && id === userHandle);
      const hasInRaw = r.rawRow && typeof r.rawRow === 'string' && r.rawRow.toLowerCase().includes(userHandle);
      
      return hasInIdentifiers || hasInRaw;
    });

    // Map to FullCalendar format
    return userRows.map(r => {
      // Always display the logged-in user's handle as the event title for clarity
      return {
        id: r.id,
        title: userHandle,
        start: r.startTime,
        end: r.endTime,
        extendedProps: {
          location: r.location,
          group: r.groupName,
          person: r.person,
          reviewers: r.reviewers,
          rawRow: r.rawRow
        },
        backgroundColor: '#3f51b5',
        borderColor: 'transparent',
        textColor: '#ffffff'
      };
    });
  }, [rows, firebaseUser?.email, extractEmail, effectiveIsReview]);

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

  return (
    <div className="flex h-screen w-screen bg-white overflow-hidden font-sans text-slate-900">
      {/* 🟢 LEFT SIDEBAR - Slimmer & Cleaner */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 p-0 bg-white shrink-0">
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

          {/* Moved Semester Selection Here */}
          <div className="mt-10 px-4">
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
        </div>
      </aside>

      {/* 🔵 RIGHT MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Header - Premium Redesign */}
        <header className="flex-none h-16 flex items-center justify-between px-6 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-[100]">
          <div className="flex items-center gap-5">
            <div className="p-2.5 text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </div>
            <div className="flex items-center gap-3">
              <img src="https://www.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_5_2x.png" className="w-8 h-8 drop-shadow-sm" alt="logo" />
              <div className="flex flex-col">
                <span className="text-xl text-slate-800 font-semibold tracking-tight leading-none">Lịch trình</span>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">FPT University</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Lecturer Info Badge */}
             <div className="hidden lg:flex flex-col items-end px-4 py-1.5 border-r border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Giảng viên đang xem</span>
                <span className="text-sm font-semibold text-slate-700">{firebaseUser?.email}</span>
             </div>

             <div className="flex items-center gap-3">
               <div className="flex flex-col items-end hidden sm:flex">
                  <span className="text-xs font-bold text-slate-800">{firebaseUser?.displayName}</span>
                  <div className="flex items-center gap-1">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Đang hoạt động</span>
                  </div>
               </div>

               <div className="relative ml-1">
                 <div 
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className={`w-10 h-10 rounded-full border-2 border-white shadow-sm ring-2 ${isProfileOpen ? 'ring-blue-500' : 'ring-slate-100/50'} cursor-pointer hover:ring-blue-100 transition-all overflow-hidden bg-slate-50`}
                 >
                   <img src={firebaseUser?.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser?.displayName || 'U'}&background=random`} className="w-full h-full object-cover" alt="avatar" />
                 </div>
                 
                 {/* Click-away overlay */}
                 {isProfileOpen && (
                   <div 
                    className="fixed inset-0 z-[998]" 
                    onClick={() => setIsProfileOpen(false)}
                   ></div>
                 )}

                 {/* Logout/Profile Overlay */}
                 <div className={`absolute top-full right-0 mt-3 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl ${isProfileOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'} transition-all duration-300 z-[999] p-3 overflow-hidden`}>
                    <div className="bg-slate-50 -m-3 p-4 mb-3 flex flex-col items-center border-b border-slate-100">
                       <img src={firebaseUser?.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser?.displayName || 'U'}&background=random`} className="w-16 h-16 rounded-full border-4 border-white shadow-lg mb-3" alt="avatar-large" />
                       <p className="text-sm font-black text-slate-900 leading-tight">{firebaseUser?.displayName}</p>
                       <p className="text-xs font-medium text-slate-500">{firebaseUser?.email}</p>
                    </div>

                    <div className="space-y-1">
                      <button 
                        onClick={() => {
                          persistence.clearPersistence();
                          logout();
                        }} 
                        className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
                        Đăng xuất hệ thống
                      </button>
                    </div>
                 </div>
               </div>
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
                <h3 className="text-lg font-bold text-slate-800 mb-2 uppercase tracking-tight">Không tìm thấy lịch dạy</h3>
                <p className="max-w-xs text-xs text-slate-400 leading-relaxed font-medium">
                  Hệ thống đã nạp dữ liệu học kỳ nhưng không tìm thấy sự kiện nào khớp với tài khoản <span className="text-blue-600 font-bold">{firebaseUser?.email}</span>.
                </p>
                <p className="mt-4 text-[10px] text-slate-400 italic">Mẹo: Hãy kiểm tra xem bạn đã đăng nhập đúng tài khoản email công vụ chưa.</p>
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
                   left: 'today prev,next title',
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
                     <div className={`flex flex-col items-center py-2 ${isToday ? 'text-[#1a73e8]' : 'text-[#70757a]'}`}>
                       <span className="text-[10px] font-bold mb-1 tracking-wider">{dayName}</span>
                       <span className={`text-[20px] font-normal w-10 h-10 flex items-center justify-center rounded-full transition-colors ${isToday ? 'bg-[#1a73e8] text-white' : 'hover:bg-[#f1f3f4]'}`}>
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

                   return (
                     <div className="flex flex-col h-full overflow-hidden leading-tight py-1 px-1.5 border-l-2 border-white/30">
                       <div className="font-bold text-[10px] truncate">{event.title}</div>
                       <div className="text-[9px] font-medium opacity-90 truncate">{timeText} – {endTimeText}</div>
                       {props.location && (
                           <div className="text-[9px] font-medium opacity-90 truncate mt-0.5">{props.location}</div>
                       )}
                     </div>
                   );
                 }}
                 buttonText={{ today: 'Hôm nay', month: 'Tháng', week: 'Tuần', day: 'Ngày' }}
                 slotLabelFormat={{ hour: 'numeric', meridiem: 'short', hour12: true }}
                 slotMinTime="07:00:00"
                 slotMaxTime="22:00:00"
                 allDaySlot={false}
                 stickyHeaderDates={true}
                 handleWindowResize={true}
                 expandRows={false}
                 eventDisplay="block"
               />
             </div>
          )}
        </main>
      </div>

      <style>{`
        /* 🎨 THE GOOGLE CALENDAR REDESIGN */
        .google-style.fc {
          --fc-border-color: #dadce0;
          --fc-today-bg-color: transparent !important;
          --fc-now-indicator-color: #ea4335;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: transparent;
          --fc-list-event-hover-bg-color: #f1f3f4;
          --fc-event-bg-color: #3f51b5; 
          --fc-event-border-color: #ffffff;
          font-family: 'Roboto', 'Inter', -apple-system, sans-serif;
        }

        /* REMOVE YELLOW HIGHLIGHT FOR TODAY */
        .google-style .fc-day-today {
          background-color: transparent !important;
        }
        
        .google-style .fc-timegrid-col.fc-day-today {
          background-color: transparent !important;
        }

        .google-style .fc-toolbar {
          padding: 8px 16px !important;
          border-bottom: 1px solid #dadce0;
          background: white;
        }

        .google-style .fc-toolbar-title {
          font-size: 20px !important;
          font-weight: 400 !important;
          color: #3c4043 !important;
          margin-left: 16px !important;
        }

        .google-style .fc-button {
          background: white !important;
          border: 1px solid #dadce0 !important;
          color: #3c4043 !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          padding: 6px 12px !important;
          border-radius: 4px !important;
          box-shadow: none !important;
          text-transform: none !important;
        }

        .google-style .fc-button:hover { background: #f8f9fa !important; border-color: #dadce0 !important; }
        .google-style .fc-button-active { background: #e8f0fe !important; color: #1a73e8 !important; border-color: #e8f0fe !important; }

        /* GOOGLE STYLE TIME AXIS (GMT+07) */
        .google-style .fc-timegrid-axis-cushion::before {
          content: 'GMT+07';
          display: block;
          font-size: 10px;
          color: #70757a;
          font-weight: 400;
          position: absolute;
          top: 10px;
          left: 12px;
        }

        .google-style .fc-timegrid-slot-label-cushion {
          display: inline-block;
          font-size: 10px;
          color: #70757a;
          transform: translateY(-50%);
          padding-right: 12px !important;
          font-weight: 400;
          text-transform: uppercase;
          background: white; /* Cover the line part under the text */
          position: relative;
          z-index: 2;
        }

        .google-style .fc-timegrid-slot {
          height: 52px !important;
          border-bottom: 1px solid #dadce0 !important;
        }

        /* Clean Axis - No Vertical Line */
        .google-style .fc-timegrid-axis-frame { 
          width: 84px !important; 
          border-right: none !important; 
        }
        
        .google-style .fc-timegrid-slot-label {
          border-right: none !important;
          overflow: visible !important;
        }

        /* Continuous Horizontal Grid Lines */
        .google-style .fc-timegrid-slots tr .fc-timegrid-slot-label::after {
          content: '';
          position: absolute;
          right: 0;
          top: 0;
          width: 100vw; /* Extend line all the way to the right */
          height: 1px;
          background: #dadce0;
          z-index: 1;
        }

        .google-style .fc-col-header-cell { border-bottom: 1px solid #dadce0 !important; border-left: none !important; background: white !important; }
        .google-style .fc-theme-standard td, .google-style .fc-theme-standard th { border-right: 1px solid #dadce0 !important; }

        .google-style .fc-v-event,
        .google-style .fc-daygrid-event,
        .google-style .fc-daygrid-block-event {
          background-color: #3f51b5 !important;
          border: none !important;
          border-radius: 4px !important;
          box-shadow: 0 1px 1px rgba(60,64,67,0.3) !important;
          color: white !important;
        }

        .google-style .fc-daygrid-event:hover {
          filter: brightness(0.9);
        }

        /* HIDE ANY REMAINING NOW INDICATOR ARTIFACTS */
        .fc-timegrid-now-indicator-line, 
        .fc-timegrid-now-indicator-arrow,
        .google-style .fc-timegrid-now-indicator-line,
        .google-style .fc-timegrid-now-indicator-arrow {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `}</style>
    </div>
  );
};
