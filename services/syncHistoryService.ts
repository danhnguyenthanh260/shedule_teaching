import { RowNormalized, SyncResult } from '../types';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5000';

export class SyncHistoryService {
  /**
   * Lưu sync result vào database
   * Giúp track lịch sử sync và prevent data loss
   */
  async saveSyncResult(
    sheetId: string,
    tabName: string,
    rows: RowNormalized[],
    syncResult: SyncResult,
    token: string
  ): Promise<any> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/sync-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sheetId,
          tabName,
          rowCount: rows.length,
          createdCount: syncResult.created,
          updatedCount: syncResult.updated,
          failedCount: syncResult.failed,
          rowHashes: rows.map(r => this.hashRow(r)),
          syncedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save sync history: ${response.statusText}`);
      }

      return await response.json();
    } catch (e: any) {
      console.warn('Failed to save sync history (non-critical):', e.message);
      // Don't throw - sync to calendar already succeeded
      return null;
    }
  }

  /**
   * Lấy lịch sử sync để kiểm tra duplicates
   */
  async getSyncHistory(sheetId: string, tabName: string, token: string): Promise<any[]> {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/sync-history?sheetId=${sheetId}&tabName=${tabName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get sync history: ${response.statusText}`);
      }

      return await response.json();
    } catch (e: any) {
      console.warn('Failed to get sync history:', e.message);
      return [];
    }
  }

  private hashRow(row: RowNormalized): string {
    const rowString = `${row.date}|${row.startTime}|${row.person}|${row.task}|${row.location}`;
    let hash = 0;
    for (let i = 0; i < rowString.length; i++) {
      const char = rowString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export const syncHistoryService = new SyncHistoryService();
