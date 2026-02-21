
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
    const cached = sheetCacheService.getFull(sheetId, tabName);
    return cached ? cached.data : null;
  },

  getFull: (sheetId: string, tabName: string): CachedSheetData | null => {
    try {
      const key = `${CACHE_PREFIX}${sheetId}_${tabName}`;
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsed: CachedSheetData = JSON.parse(cached);
      
      if (Date.now() - parsed.timestamp > MAX_CACHE_AGE) {
        localStorage.removeItem(key);
        return null;
      }

      return parsed;
    } catch (e) {
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
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      sheetCacheService.clearAll();
      try {
        const key = `${CACHE_PREFIX}${sheetId}_${tabName}`;
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
      } catch (e2) {}
    }
  },

  remove: (sheetId: string, tabName: string) => {
    try {
      const key = `${CACHE_PREFIX}${sheetId}_${tabName}`;
      localStorage.removeItem(key);
    } catch (e) {}
  },

  clearAll: () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
};
