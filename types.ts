
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
  id: string; // sheetRowId
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
