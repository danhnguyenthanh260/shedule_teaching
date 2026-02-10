
import { useCallback } from 'react';
import { firestoreSyncHistoryService } from '../services/firestoreSyncHistoryService';
import { SyncResult } from '../types';

interface SaveSyncLogProps {
  userId: string;
  sheetId: string;
  tabName: string;
  totalRows: number;
  syncResult: SyncResult;
}

export const useSyncLogs = () => {
  const saveSyncLog = useCallback(async ({
    userId,
    sheetId,
    tabName,
    totalRows,
    syncResult
  }: SaveSyncLogProps) => {
    try {
      await firestoreSyncHistoryService.saveSyncResult(
        userId,
        sheetId,
        tabName,
        totalRows,
        syncResult.created,
        syncResult.updated || 0,
        syncResult.failed
      );
      return true;
    } catch (error) {
      console.warn('Failed to save sync history:', error);
      return false;
    }
  }, []);

  return { saveSyncLog };
};
