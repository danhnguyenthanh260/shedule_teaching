
/**
 * Persist State Service
 * Simplifies saving/restoring App state to/from localStorage
 */

import { secureGetItem, secureSetItem, secureRemoveItem } from './crypto';

const STORAGE_KEY_PREFIX = 'fptu_sync_';

// Sensitive keys that require encryption
const SENSITIVE_KEYS = [
  'allRows', 
  'fullRows', 
  'sheetMeta', 
  'columnMap', 
  'sheetUrl',
  'fullHeaders',
  'fullDetailHeaders',
  'titleRow'
];

/**
 * Get current user UID from localStorage (persistent between secure calls)
 */
function getUID(): string {
  return localStorage.getItem('userUID') || 'anonymous';
}

export const persistStateService = {
  /**
   * Save partial state to localStorage (encrypted if sensitive)
   */
  async saveState(partialState: Record<string, any>) {
    const uid = getUID();
    
    try {
      for (const [key, value] of Object.entries(partialState)) {
        const fullKey = STORAGE_KEY_PREFIX + key;
        
        if (value === undefined || value === null) {
          localStorage.removeItem(fullKey);
          continue;
        }

        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        if (SENSITIVE_KEYS.includes(key)) {
          // ✅ ENCRYPT sensitive data
          await secureSetItem(fullKey, stringValue, uid);
        } else {
          // Use standard plain text for non-sensitive UI state
          localStorage.setItem(fullKey, stringValue);
        }
      }
    } catch (e) {
      console.error('❌ Failed to save state to localStorage', e);
    }
  },

  /**
   * Restore all relevant state keys from localStorage
   */
  async restoreState(): Promise<Record<string, any>> {
    const uid = getUID();
    const keys = [
      'sheetUrl', 'tabName', 'sheetMeta', 'headerRowIndex', 
      'columnMap', 'personFilter', 'allRows', 'fullHeaders', 
      'fullDetailHeaders', 'titleRow', 'fullRows', 'selectedIds',
      'startRow', 'columnsConfig', 'dateFormat', 'searchColumnIndices', 'selectedSemesterId'
    ];
    
    const state: Record<string, any> = {};
    
    for (const key of keys) {
      try {
        const fullKey = STORAGE_KEY_PREFIX + key;
        let value: string | null = null;
        
        if (SENSITIVE_KEYS.includes(key)) {
          // ✅ DECRYPT sensitive data
          value = await secureGetItem(fullKey, uid);
        } else {
          value = localStorage.getItem(fullKey);
        }

        if (value) {
          // Attempt to parse JSON strictly for objects/arrays
          if (value.startsWith('{') || value.startsWith('[')) {
            state[key] = JSON.parse(value);
          } else {
            // Primitive values
            if (value === 'true') state[key] = true;
            else if (value === 'false') state[key] = false;
            else if (!isNaN(Number(value)) && value.trim() !== '') state[key] = Number(value);
            else state[key] = value;
          }
        }
      } catch (e) {
        console.warn(`⚠️ Failed to parse/decrypt persisted key: ${key}`, e);
      }
    }

    return state;
  },

  /**
   * Clear all persisted state
   */
  clearState() {
    const keys = [
      'sheetUrl', 'tabName', 'sheetMeta', 'headerRowIndex', 
      'columnMap', 'personFilter', 'allRows', 'fullHeaders', 
      'fullDetailHeaders', 'titleRow', 'fullRows', 'selectedIds',
      'startRow', 'columnsConfig', 'dateFormat', 'searchColumnIndices', 'selectedSemesterId'
    ];
    keys.forEach(key => localStorage.removeItem(STORAGE_KEY_PREFIX + key));
  }
};
