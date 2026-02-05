
import { useState, useCallback } from 'react';
import { syncEventsToCalendar } from '../services/appsScriptService';
import { RowNormalized, SyncResult } from '../types';

interface UseCalendarSyncProps {
  accessToken: string | null;
}

export const useCalendarSync = ({ accessToken }: UseCalendarSyncProps) => {
  const [syncing, setSyncing] = useState(false);
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
      const events = rowsToSync.map(r => ({
        title: r.person,
        start: r.startTime.includes('+') ? r.startTime : `${r.startTime}+07:00`,
        end: r.endTime.includes('+') ? r.endTime : `${r.endTime}+07:00`,
        location: r.location || '',
        description: `Đồng bộ từ FPT Scheduler\nNội dung: ${r.person}\nPhòng: ${r.location}`
      }));

      const res = await syncEventsToCalendar(events);

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
      console.error("Sync error:", err);
      const errorMsg = "Lỗi đồng bộ: " + err.message;
      setSyncError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setSyncing(false);
    }
  }, [accessToken]);

  return {
    syncing,
    syncResult,
    setSyncResult,
    syncError,
    setSyncError,
    syncToCalendar
  };
};
