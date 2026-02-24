
import { Timestamp } from 'firebase/firestore';

export type ColumnType = 'date' | 'time' | 'person' | 'task' | 'location' | 'email' | 'unknown';

export type DateFormat = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd' | 'dd-MM-yyyy';

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
  sourceRowIndex?: number; // ✅ NEW: Original row index in rawRows (for filtering fullRows)
  date: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  person: string;
  resources?: string[];
  email?: string;
  task?: string;
  location?: string;
  code?: string;
  raw?: Record<string, string>; // Lưu data gốc để làm description
  rawRow?: any[]; // ✅ NEW: Lưu data gốc dạng array (string[])
  status?: 'pending' | 'synced' | 'failed';
  error?: string;
  // ✅ For grouped events (from flattenRow)
  isGrouped?: boolean; // True if this event is from grouped structure (Data Mẫu/Review)
  sheetType?: 'council' | 'review'; // 🚀 NEW: For sheet isolation
  reviewers?: string[]; // [reviewer1, reviewer2] for search filtering
  // ✅ Raw mapped values for preview consistency
  dateRaw?: string;
  timeRaw?: string;
  personRaw?: string;
  locationRaw?: string;
  // ✅ Block range for search isolation
  blockStart?: number;
  blockEnd?: number;
  reviewAreaStart?: number; // Boundary index (A-I vs J+)
}

export interface SyncError {
  index: number;
  title: string;
  message: string;
}

export interface SyncResult {
  type: 'sync' | 'clear';
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  logs: string[];
  errors?: SyncError[];
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
