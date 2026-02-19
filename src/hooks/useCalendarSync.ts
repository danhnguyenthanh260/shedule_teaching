
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

  const syncToCalendar = useCallback(async (rowsToSync: RowNormalized[]) => {
    if (!accessToken || rowsToSync.length === 0) {
      setSyncError("Thiếu token truy cập hoặc chưa chọn mục nào.");
      return null;
    }

    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      console.log(`📡 Bắt đầu đồng bộ ${rowsToSync.length} mục lên Google Calendar...`);
      const events = rowsToSync.map(r => {
        // Fix leading zeros for hours if single digit (e.g., "1" -> "01")
        const fixTime = (t: string) => t.length === 1 ? `0${t}:00` : t.includes(':') ? t : `${t}:00`;
        const isoStart = r.date && r.startTime ? (r.startTime.includes('T') ? r.startTime : `${r.date}T${fixTime(r.startTime)}:00+07:00`) : '';
        const isoEnd = r.date && r.endTime ? (r.endTime.includes('T') ? r.endTime : `${r.date}T${fixTime(r.endTime)}:00+07:00`) : '';

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
      const res = await syncEventsToCalendar(events);
      console.log("✅ API Response:", res);

      const successCount = res.data?.success ?? 0;
      const failedCount = res.data?.failed ?? 0;
      const skippedCount = res.data?.skipped ?? 0;

      const result: SyncResult = {
        created: successCount,
        updated: 0,
        failed: failedCount,
        skipped: skippedCount,
        logs: [res.message]
      };

      setSyncResult(result);
      return result;
    } catch (err: any) {
      console.error("❌ Sync error details:", err);
      const errorMsg = err.message || "Lỗi không xác định khi đồng bộ";
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
      const res = await clearCalendar();
      const result: SyncResult = {
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
