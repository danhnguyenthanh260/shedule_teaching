
import { Timestamp } from 'firebase/firestore';

export type ColumnType = 'date' | 'time' | 'person' | 'task' | 'location' | 'email' | 'unknown';

export interface InferredSchema {
  mapping: Record<ColumnType, number>; // Mapping Type -> Index của cột
  confidence: number; // 0 to 1
  isReliable: boolean;
}

export interface ColumnMapping {
  date?: number;
  time?: number;
  person?: number;
  task?: number;
  location?: number;
  email?: number;
}

export interface RowNormalized {
  id: string; // sheetRowId + reviewGroupName (for flattened events)
  groupName?: string; // 'REVIEW 1', 'REVIEW 2', etc. (for nested mapping)
  sourceRowId?: string; // Original sheet row ID (for tracking)
  date: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  person: string;
  email?: string;
  task: string;
  location?: string;
  raw: Record<string, string>; // Lưu data gốc để làm description
  status?: 'pending' | 'synced' | 'failed';
  error?: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  failed: number;
  logs: string[];
}

export interface UserProfile {
  name: string;
  email: string;
  image?: string;
}

// Firebase Types
export interface FirebaseColumnMapping {
  titleCol: number;
  dateCol: number;
  startTimeCol: number;
  endTimeCol: number;
  locationCol: number;
}

export interface FirebaseUserMapping {
  userId: string;
  fileId: string;
  mapping: FirebaseColumnMapping;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FirebaseSyncRecord {
  userId: string;
  fileId: string;
  eventCount: number;
  status: 'pending' | 'success' | 'failed';
  errorMessage?: string;
  createdAt: Timestamp;
}
