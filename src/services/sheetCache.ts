
/**
 * Simple service to cache raw sheet data in localStorage
 */

const CACHE_PREFIX = 'fptu_sheet_cache_';
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CachedSheetData {
  data: string[][];
  timestamp: number;
}

export const sheetCacheService = {
  get: (sheetId: string, tabName: string): string[][] | null => {
    try {
      const key = `${CACHE_PREFIX}${sheetId}_${tabName}`;
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp }: CachedSheetData = JSON.parse(cached);
      
      // Check if cache is too old (optional, but good for data integrity)
      if (Date.now() - timestamp > MAX_CACHE_AGE) {
        localStorage.removeItem(key);
        return null;
      }

      return data;
    } catch (e) {
      console.error('Failed to read from sheet cache:', e);
      return null;
    }
  },

  set: (sheetId: string, tabName: string, data: string[][]) => {
    try {
      const key = `${CACHE_PREFIX}${sheetId}_${tabName}`;
      const payload: CachedSheetData = {
        data,
        timestamp: Date.now()
      };
      
      // Simple strategy: if localStorage is full, clear old caches
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (e) {
        // Clear all caches if full and try again
        sheetCacheService.clearAll();
        localStorage.setItem(key, JSON.stringify(payload));
      }
    } catch (e) {
      console.error('Failed to save to sheet cache:', e);
    }
  },

  clearAll: () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
};
