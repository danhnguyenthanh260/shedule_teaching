
import { useState, useCallback } from 'react';
import { syncEventsToCalendar, clearCalendar, globalRecallAppEvents } from '../services/appsScriptService';
import { RowNormalized, SyncResult } from '../types';

interface UseCalendarSyncProps {
  accessToken: string | null;
  reauthorizeGoogle: () => Promise<string | null>;
}

export const useCalendarSync = ({ accessToken, reauthorizeGoogle }: UseCalendarSyncProps) => {
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);

  const syncToCalendar = useCallback(async (
    rowsToSync: RowNormalized[], 
    force: boolean = false, 
    conflictMode?: 'insert' | 'keep_old' | 'replace',
    isRetry: boolean = false,
    overrideSheetType?: 'council' | 'review'
  ) => {
    let currentToken = accessToken;

    // 🚀 AUTO RE-AUTH: If token is missing, try to get it automatically
    if (!currentToken) {
      console.log("🔑 Token missing, triggering auto re-auth...");
      try {
        currentToken = await reauthorizeGoogle();
        if (!currentToken) {
          setSyncError("Hết hạn truy cập: Không thể lấy quyền Google Calendar. Vui lòng đăng nhập lại.");
          return null;
        }
      } catch (err) {
        setSyncError("Lỗi xác thực: Không thể kết nối với Google.");
        return null;
      }
    }
    
    if (rowsToSync.length === 0) {
      setSyncError("Chưa chọn mục nào để đồng bộ.");
      return null;
    }

    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      console.log(`📡 Bắt đầu đồng bộ ${rowsToSync.length} mục lên Google Calendar... (Force: ${force})`);
      
      const events = rowsToSync.map(r => {
        // 🛠️ Robust Date Formatter
        const formatToISO = (dateStr: string, timeStr: string) => {
          if (!dateStr || !timeStr) return '';
          
          // 1. Clean date - remove any prefix like "Ngày "
          let cleanDate = dateStr.replace(/ngày\s*/i, '').trim();
          
          // 2. Simple split to extract YMD
          let year, month, day;
          if (cleanDate.includes('/')) {
            const parts = cleanDate.split('/');
            if (parts.length === 3) {
              const p0 = parseInt(parts[0]);
              const p1 = parseInt(parts[1]);
              const p2 = parseInt(parts[2]);
              
              if (p2 > 100) { // e.g. 1/25/2026 or 25/1/2026
                year = p2;
                // Heuristic: If one is > 12, it must be the day
                if (p0 > 12) { day = p0; month = p1; }
                else if (p1 > 12) { day = p1; month = p0; }
                else { 
                  // Ambiguous: Assume VN format DD/MM if first part is small
                  day = p0; month = p1; 
                }
              } else if (p0 > 100) { // e.g. 2026/01/25
                year = p0; month = p1; day = p2;
              }
            }
          } else if (cleanDate.includes('-')) {
            const parts = cleanDate.split('-');
            if (parts[0]?.length === 4) {
              year = parseInt(parts[0]);
              month = parseInt(parts[1]);
              day = parseInt(parts[2]);
            } else {
              day = parseInt(parts[0]);
              month = parseInt(parts[1]);
              year = parseInt(parts[2]);
            }
          }

          if (!year || !month || !day) return '';

          const yyyy = year;
          const mm = month.toString().padStart(2, '0');
          const dd = day.toString().padStart(2, '0');
          
          const fixTime = (t: string) => {
             const clean = t.replace(/h/i, ':').trim();
             if (clean.includes(':')) {
                const [h, m] = clean.split(':');
                return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
             }
             return `${clean.padStart(2, '0')}:00`;
          };

          return `${yyyy}-${mm}-${dd}T${fixTime(timeStr)}:00+07:00`;
        };

        const isoStart = r.startTime?.includes('T') ? r.startTime : formatToISO(r.date, r.startTime);
        const isoEnd = r.endTime?.includes('T') ? r.endTime : formatToISO(r.date, r.endTime);

        // 🚀 CLEAN TITLE MERGE (Unified for Council and Review)
        let eventTitle = r.person;
        
        if (r.isGrouped) {
           const names = r.reviewers && r.reviewers.length > 0 ? r.reviewers : [r.person];
           const timePart = r.timeRaw ? ` - Slot(${r.timeRaw})` : '';
           eventTitle = `${names.join(' & ')}${timePart}`.trim();
        } else {
           // For Council or simple rows: "Name - Task/Topic"
           const taskPart = r.task && r.task !== 'Nhiệm vụ' && r.task !== 'Review' ? ` - ${r.task}` : '';
           eventTitle = `${r.person}${taskPart}`;
        }

        return {
          title: eventTitle || "Sự kiện không tên",
          start: isoStart || new Date().toISOString(),
          end: isoEnd || new Date().toISOString(),
          location: r.location || '',
          guests: r.email || '', // 📧 NEW: Hỗ trợ truyền email khách mời
          resources: [r.person, r.location].filter(Boolean) as string[],
          description: r.raw?.description || `Đồng bộ từ FPT Scheduler\nGV: ${r.person || 'N/A'}\nNhiệm vụ: ${r.task || 'N/A'}\nPhòng: ${r.location || 'N/A'}\n[ID: ${r.id}]`,
          signature: r.id,
          colorId: r.sheetType === 'review' ? '9' : '11', // 🎨 Review: Blue (9), Council: Red (11)
          subEvents: r.subEvents // 📧 NEW: Truyền danh sách các buổi lẻ
        };
      });

      console.log("📦 Payload events sample:", events[0]);
      if (events.length > 0) {
        console.log(`🕒 Event 1 details: Start=${events[0].start}, End=${events[0].end}`);
      }

      // 🔍 Detect sheetType from the first non-null row or use override
      const rawType = overrideSheetType || rowsToSync.find(r => r.sheetType)?.sheetType || 'council';
      const detectedType = (rawType === 'review' ? 'review' : 'council') as 'council' | 'review';
      console.log(`📊 Syncing with sheetType: ${detectedType}`);

      let res;
      try {
        res = await syncEventsToCalendar(events, undefined, force, currentToken || '', conflictMode, detectedType);
      } catch (err: any) {
        // 🔄 AUTO-RETRY ON 401: If first attempt fails with Auth error, try re-auth and retry ONCE
        if ((err.message.includes('401') || err.message.toLowerCase().includes('unauthenticated')) && !isRetry) {
          console.warn("⚠️ Sync failed with 401, trying auto re-auth retry...");
          const newToken = await reauthorizeGoogle();
          if (newToken) {
            return syncToCalendar(rowsToSync, force, conflictMode, true, detectedType); // Recursive retry
          }
        }
        throw err;
      }
      
      console.log("✅ API Response:", res);
      if (res.data?.availableCalendars) {
        console.log("📅 Available calendars in this GAS session:", res.data.availableCalendars);
      }

      // 🔍 ROBUST EXTRACTION: Try both nested and flat structure
      const dataPayload: any = res.data || res || {};
      const successCount = Number(dataPayload.success ?? 0);
      const failedCount = Number(dataPayload.failed ?? 0);
      const skippedCount = Number(dataPayload.skipped ?? 0);

      console.log(`📊 Sync Result Processed: Success=${successCount}, Skipped=${skippedCount}, Failed=${failedCount}`);

      // 🚨 CONFLICT DETECTION: Backend trả về conflicts khi có time overlap
      const conflictsData = dataPayload.conflicts || [];
      if (conflictsData.length > 0 && !conflictMode) {
        setConflicts(conflictsData);
        const conflictMsg = `Xung đột thời gian: ${conflictsData.length} mục bị trùng khung giờ với lịch hiện có.`;
        throw new Error(conflictMsg);
      }
      setConflicts([]);

      const updatedCount = Number(dataPayload.updated ?? 0);

      const result: SyncResult = {
        type: 'sync',
        created: successCount,
        updated: updatedCount,
        failed: failedCount,
        skipped: skippedCount,
        errors: dataPayload.errors || [],
        logs: [
          res.message,
          dataPayload.calendarName ? `Lịch: ${dataPayload.calendarName}` : null,
          dataPayload.calendarId ? `ID: ${dataPayload.calendarId}` : null
        ].filter(Boolean) as string[]
      };

      setSyncResult(result);
      return result;
    } catch (err: any) {
      console.error("❌ Sync error details:", err);
      let errorMsg = err.message || "Lỗi không xác định khi đồng bộ";
      
      // Clarify conflict message (Optional: you can keep it more generic or just use the original message)
      // We remove the hardcoded overwrite to preserve detailed conflict info if available
      // if (errorMsg.includes('xung đột') || errorMsg.includes('tồn tại')) {
      //   errorMsg = "Xung đột: Dữ liệu đã có sẵn. Bạn muốn ghi đè không?";
      // }
      
      // Don't add long prefix for conflicts/auth
      const prefix = (errorMsg.includes('xung đột') || errorMsg.includes('401')) ? "" : "Lỗi đồng bộ: ";
      setSyncError(prefix + errorMsg);
      throw new Error(errorMsg);
    } finally {
      setSyncing(false);
    }
  }, [accessToken]);

  const clearAppEvents = useCallback(async (sheetType?: 'council' | 'review', sendUpdates: boolean = true, calendarName?: string, retryCount: number = 0) => {
    setClearing(true);
    setSyncError(null);
    setSyncResult(null);

    let currentToken = accessToken;
    if (!currentToken) {
      console.log("🔑 Token missing for clear, triggering auto re-auth...");
      currentToken = await reauthorizeGoogle();
      if (!currentToken) {
        setSyncError("Hết hạn truy cập: Không thể lấy quyền Google Calendar.");
        setClearing(false);
        return null;
      }
    }

    try {
      const res: any = await clearCalendar(calendarName, currentToken || '', sheetType, sendUpdates);
      const deletedCount = res.data?.deletedCount ?? res.deletedCount ?? 0;
      
      const result: SyncResult = {
        type: 'clear',
        created: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        logs: [`Đã xóa ${deletedCount} sự kiện trên lịch ${calendarName || 'mặc định'}.`]
      };
      setSyncResult(result);
      return result;
    } catch (err: any) {
      console.error("Clear error:", err);
      // 🔄 AUTO-RETRY ON 401 (Limit to 1 retry)
      const isAuthError = err.message && (err.message.includes('401') || err.message.toLowerCase().includes('unauthenticated'));
      if (isAuthError && retryCount < 1) {
        console.warn("⚠️ Clear failed with 401, trying auto re-auth retry (Attempt 1)...");
        const newToken = await reauthorizeGoogle();
        if (newToken) {
          return clearAppEvents(sheetType, sendUpdates, calendarName, retryCount + 1);
        }
      }
      setSyncError("Lỗi hệ thống: " + (err.message || "Không xác định"));
      throw err;
    } finally {
      setClearing(false);
    }
  }, [accessToken, reauthorizeGoogle]);

  const globalRecallEvents = useCallback(async (sheetType?: 'council' | 'review') => {
    setClearing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const res: any = await globalRecallAppEvents(sheetType);
      
      const result: SyncResult = {
        type: 'clear',
        created: 0,
        updated: 0,
        failed: res.data?.silentFailed || 0,
        skipped: 0,
        logs: [
          `Thu hồi toàn hệ thống: Đã xử lý ${res.data?.totalProcessed || 0} giảng viên.`, 
          `Đã xóa: ${res.data?.silentCleared || 0} sự kiện cá nhân, ${res.data?.proxyCleared || 0} lời mời dự phòng.`
        ]
      };
      setSyncResult(result);
      return result;
    } catch (err: any) {
      console.error("Global Recall error:", err);
      setSyncError("Lỗi hệ thống thu hồi: " + (err.message || "Không xác định"));
      throw err;
    } finally {
      setClearing(false);
    }
  }, []);

  return {
    syncing,
    clearing,
    syncResult,
    setSyncResult,
    syncError,
    setSyncError,
    syncToCalendar,
    clearAppEvents,
    globalRecallEvents,
    conflicts,
    setConflicts
  };
};
