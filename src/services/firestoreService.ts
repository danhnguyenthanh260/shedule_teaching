import { db } from '../config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
// Dùng đúng kiểu mapping của app (types.ts) để tránh lỗi ts(2345)
import type { ColumnMapping as AppColumnMapping } from '../../types';

/** Re-export để hook và App dùng chung một kiểu (date, time, person, task, location, email) */
export type ColumnMapping = AppColumnMapping;

export interface UserMapping {
  userId: string;
  fileId: string;
  mapping: AppColumnMapping;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Lưu mapping (config cột) cho user
 * @param userId - User ID từ Firebase Auth
 * @param fileId - File ID (hash của URL hoặc file name)
 * @param mapping - Column mapping configuration
 */
export const saveMappingPreset = async (
  userId: string,
  fileId: string,
  mapping: AppColumnMapping
): Promise<void> => {
  try {
    const mappingRef = doc(db, 'users', userId, 'mappings', fileId);
    await setDoc(mappingRef, {
      userId,
      fileId,
      mapping,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error saving mapping:', error);
    throw error;
  }
};

/**
 * Lấy mapping cũ (để auto-fill dropdown)
 * @param userId - User ID từ Firebase Auth
 * @param fileId - File ID
 * @returns ColumnMapping hoặc null nếu không tìm thấy
 */
export const getMappingPreset = async (
  userId: string,
  fileId: string
): Promise<AppColumnMapping | null> => {
  try {
    const mappingRef = doc(db, 'users', userId, 'mappings', fileId);
    const docSnap = await getDoc(mappingRef);

    if (docSnap.exists()) {
      return docSnap.data().mapping;
    }
    return null;
  } catch (error) {
    console.error('Error getting mapping:', error);
    throw error;
  }
};

/**
 * Lấy toàn bộ mappings của user
 * @param userId - User ID
 * @returns Array of UserMapping
 */
export const getUserMappings = async (userId: string): Promise<UserMapping[]> => {
  try {
    const mappingsRef = collection(db, 'users', userId, 'mappings');
    const snapshot = await getDocs(mappingsRef);
    return snapshot.docs.map((doc) => doc.data() as UserMapping);
  } catch (error) {
    console.error('Error getting user mappings:', error);
    throw error;
  }
};

/**
 * Update mapping
 * @param userId - User ID
 * @param fileId - File ID
 * @param mapping - New column mapping configuration
 */
export const updateMappingPreset = async (
  userId: string,
  fileId: string,
  mapping: AppColumnMapping
): Promise<void> => {
  try {
    const mappingRef = doc(db, 'users', userId, 'mappings', fileId);
    await updateDoc(mappingRef, {
      mapping,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating mapping:', error);
    throw error;
  }
};
