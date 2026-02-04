
/**
 * Persist State Service
 * Simplifies saving/restoring App state to/from localStorage
 */

const STORAGE_KEY_PREFIX = 'fptu_sync_';

export const persistStateService = {
  /**
   * Save partial state to localStorage
   */
  saveState(partialState: Record<string, any>) {
    try {
      Object.entries(partialState).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          localStorage.removeItem(STORAGE_KEY_PREFIX + key);
        } else {
          const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          localStorage.setItem(STORAGE_KEY_PREFIX + key, stringValue);
        }
      });
    } catch (e) {
      console.error('❌ Failed to save state to localStorage', e);
    }
  },

  /**
   * Restore all relevant state keys from localStorage
   */
  restoreState(): Record<string, any> {
    const keys = [
      'sheetUrl', 'tabName', 'sheetMeta', 'headerRowIndex', 
      'columnMap', 'personFilter', 'allRows', 'fullHeaders', 
      'fullDetailHeaders', 'titleRow', 'fullRows', 'selectedIds'
    ];
    
    const state: Record<string, any> = {};
    
    keys.forEach(key => {
      try {
        const value = localStorage.getItem(STORAGE_KEY_PREFIX + key);
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
        console.warn(`⚠️ Failed to parse persisted key: ${key}`, e);
      }
    });

    return state;
  },

  /**
   * Clear all persisted state
   */
  clearState() {
    const keys = [
      'sheetUrl', 'tabName', 'sheetMeta', 'headerRowIndex', 
      'columnMap', 'personFilter', 'allRows', 'fullHeaders', 
      'fullDetailHeaders', 'titleRow', 'fullRows', 'selectedIds'
    ];
    keys.forEach(key => localStorage.removeItem(STORAGE_KEY_PREFIX + key));
  }
};
