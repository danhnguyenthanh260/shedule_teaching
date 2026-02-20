
import { useState, useCallback } from 'react';
import { syncEventsToCalendar, clearCalendar } from '../services/appsScriptService';
import { RowNormalized, SyncResult } from '../types';

interface UseCalendarSyncProps {
  accessToken: string | null;
}

export const useCalendarSync = ({ accessToken }: UseCalendarSyncProps) => {
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncToCalendar = useCallback(async (rowsToSync: RowNormalized[], force: boolean = false) => {
    if (!accessToken || rowsToSync.length === 0) {
      setSyncError("Thiếu token truy cập hoặc chưa chọn mục nào.");
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
            // Heuristic for dd/mm/yyyy or m/d/yyyy
            if (parts[2]?.length === 4) {
              // Guess: parts[0]=day, parts[1]=month if day > 12
              const p0 = parseInt(parts[0]);
              const p1 = parseInt(parts[1]);
              if (p0 > 12) { day = p0; month = p1; } 
              else { day = p0; month = p1; } // Fallback to VN format dd/MM
              year = parseInt(parts[2]);
            } else if (parts[0]?.length === 4) {
              year = parseInt(parts[0]);
              month = parseInt(parts[1]);
              day = parseInt(parts[2]);
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

        return {
          title: r.person,
          start: isoStart,
          end: isoEnd,
          location: r.location || '',
          resources: r.resources || [r.person, r.location].filter(Boolean),
          description: `Đồng bộ từ FPT Scheduler\nNội dung: ${r.person}\nPhòng: ${r.location}`,
          signature: r.id
        };
      });

      console.log("📦 Payload events sample:", events[0]);
      if (events.length > 0) {
        console.log(`🕒 Event 1 details: Start=${events[0].start}, End=${events[0].end}`);
      }
      const res = await syncEventsToCalendar(events, undefined, force, accessToken);
      console.log("✅ API Response:", res);
      if (res.data?.availableCalendars) {
        console.log("📅 Available calendars in this GAS session:", res.data.availableCalendars);
      }

      const successCount = res.data?.success ?? 0;
      const failedCount = res.data?.failed ?? 0;
      const skippedCount = res.data?.skipped ?? 0;

      const result: SyncResult = {
        type: 'sync',
        created: successCount,
        updated: 0,
        failed: failedCount,
        skipped: skippedCount,
        errors: res.data?.errors || [],
        logs: [
          res.message,
          res.data?.calendarName ? `Lịch: ${res.data.calendarName}` : null,
          res.data?.calendarId ? `ID: ${res.data.calendarId}` : null
        ].filter(Boolean) as string[]
      };

      setSyncResult(result);
      return result;
    } catch (err: any) {
      console.error("❌ Sync error details:", err);
      let errorMsg = err.message || "Lỗi không xác định khi đồng bộ";
      
      // Clarify conflict message
      if (errorMsg.includes('xung đột')) {
        errorMsg = "Phát hiện xung đột: Dữ liệu này đã tồn tại trong Database của hệ thống (nhưng có thể chưa hiện trên Calendar của bạn). Hãy dùng nút 'Ghi đè' để đồng bộ lại.";
      }
      
      setSyncError("Lỗi đồng bộ: " + errorMsg);
      throw new Error(errorMsg);
    } finally {
      setSyncing(false);
    }
  }, [accessToken]);

  const clearAppEvents = useCallback(async () => {
    setClearing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const res = await clearCalendar(undefined, accessToken);
      const result: SyncResult = {
        type: 'clear',
        created: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        logs: [res.message || "Đã xóa sạch lịch"]
      };
      setSyncResult(result);
      return result;
    } catch (err: any) {
      console.error("Clear error:", err);
      setSyncError("Lỗi xóa lịch: " + err.message);
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
    clearAppEvents
  };
};
