import { db } from '../config/firebase';
import { collection, addDoc, Timestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';

export interface SyncRecord {
  userId: string;
  fileId: string;
  eventCount: number;
  status: 'pending' | 'success' | 'failed';
  errorMessage?: string;
  createdAt: Timestamp;
}

/**
 * Add sync record to Firestore
 * @param userId - User ID
 * @param fileId - File ID
 * @param eventCount - Number of events synced
 * @param status - Sync status
 * @param errorMessage - Optional error message
 */
export const addSyncRecord = async (
  userId: string,
  fileId: string,
  eventCount: number,
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> => {
  try {
    const syncRef = collection(db, 'users', userId, 'syncHistory');
    await addDoc(syncRef, {
      userId,
      fileId,
      eventCount,
      status,
      errorMessage: errorMessage || null,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error adding sync record:', error);
    throw error;
  }
};

/**
 * Get latest sync records for a user
 * @param userId - User ID
 * @param maxRecords - Maximum number of records to retrieve (default: 10)
 * @returns Array of SyncRecord
 */
export const getUserSyncHistory = async (
  userId: string,
  maxRecords: number = 10
): Promise<SyncRecord[]> => {
  try {
    const syncRef = collection(db, 'users', userId, 'syncHistory');
    const q = query(syncRef, orderBy('createdAt', 'desc'), limit(maxRecords));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as SyncRecord);
  } catch (error) {
    console.error('Error getting sync history:', error);
    throw error;
  }
};
