import { collection, query, where, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../src/config/firebase';

export interface SyncHistoryRecord {
    id: string;
    userId: string;
    sheetId: string;
    tabName: string;
    rowCount: number;
    createdCount: number;
    updatedCount: number;
    failedCount: number;
    syncedAt: Date;
}

export class FirestoreSyncHistoryService {
    private collectionName = 'syncHistory';

    /**
     * Lấy lịch sử sync của user hiện tại
     */
    async getUserSyncHistory(userId: string, maxRecords: number = 50): Promise<SyncHistoryRecord[]> {
        try {
            const historyRef = collection(db, this.collectionName);
            const q = query(
                historyRef,
                where('userId', '==', userId),
                orderBy('syncedAt', 'desc'),
                limit(maxRecords)
            );

            const querySnapshot = await getDocs(q);
            const records: SyncHistoryRecord[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                records.push({
                    id: doc.id,
                    userId: data.userId,
                    sheetId: data.sheetId,
                    tabName: data.tabName,
                    rowCount: data.rowCount || 0,
                    createdCount: data.createdCount || 0,
                    updatedCount: data.updatedCount || 0,
                    failedCount: data.failedCount || 0,
                    syncedAt: data.syncedAt?.toDate() || new Date(data.syncedAt)
                });
            });

            return records;
        } catch (error: any) {
            console.error('Failed to fetch sync history:', error);
            throw new Error(`Không thể tải lịch sử: ${error.message}`);
        }
    }

    /**
     * Lọc lịch sử theo sheet ID
     */
    async getSheetSyncHistory(userId: string, sheetId: string): Promise<SyncHistoryRecord[]> {
        try {
            const historyRef = collection(db, this.collectionName);
            const q = query(
                historyRef,
                where('userId', '==', userId),
                where('sheetId', '==', sheetId),
                orderBy('syncedAt', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const records: SyncHistoryRecord[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                records.push({
                    id: doc.id,
                    userId: data.userId,
                    sheetId: data.sheetId,
                    tabName: data.tabName,
                    rowCount: data.rowCount || 0,
                    createdCount: data.createdCount || 0,
                    updatedCount: data.updatedCount || 0,
                    failedCount: data.failedCount || 0,
                    syncedAt: data.syncedAt?.toDate() || new Date(data.syncedAt)
                });
            });

            return records;
        } catch (error: any) {
            console.error('Failed to fetch sheet sync history:', error);
            throw new Error(`Không thể tải lịch sử sheet: ${error.message}`);
        }
    }

    /**
     * Lưu kết quả sync vào Firestore
     */
    async saveSyncResult(
        userId: string,
        sheetId: string,
        tabName: string,
        rowCount: number,
        createdCount: number,
        updatedCount: number,
        failedCount: number
    ): Promise<void> {
        try {
            const historyRef = collection(db, this.collectionName);
            await addDoc(historyRef, {
                userId,
                sheetId,
                tabName,
                rowCount,
                createdCount,
                updatedCount,
                failedCount,
                syncedAt: new Date()
            });
        } catch (error: any) {
            console.error('Failed to save sync history:', error);
            // Non-critical error, don't throw
        }
    }
}

export const firestoreSyncHistoryService = new FirestoreSyncHistoryService();
