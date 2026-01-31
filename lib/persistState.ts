/**
 * Service để lưu và khôi phục state của app qua F5/reload
 * Sử dụng localStorage để persist data
 */

import { ColumnMapping } from '../types';

const KEYS = {
  SHEET_URL: 'sheet_url',
  SHEET_TAB: 'sheet_tab',
  SHEET_META: 'sheet_meta',
  HEADER_ROW_INDEX: 'header_row_index',
  COLUMN_MAP: 'column_map',
  PERSON_FILTER: 'person_filter',
  ALL_ROWS: 'all_rows',
  FULL_HEADERS: 'full_headers',
  FULL_DETAIL_HEADERS: 'full_detail_headers',
  FULL_ROWS: 'full_rows',
  SELECTED_IDS: 'selected_ids',
};

export interface PersistedState {
  sheetUrl: string;
  tabName: string;
  sheetMeta: { sheetId: string; tab: string; headerRowIndex: number } | null;
  headerRowIndex: number;
  columnMap: ColumnMapping;
  personFilter: string;
  allRows: string[][];
  fullHeaders: string[];
  fullDetailHeaders: string[];
  fullRows: string[][];
  selectedIds: string[];
}

export const persistStateService = {
  /**
   * Lưu toàn bộ state quan trọng vào localStorage
   */
  saveState(state: Partial<PersistedState>) {
    try {
      if (state.sheetUrl !== undefined) {
        localStorage.setItem(KEYS.SHEET_URL, state.sheetUrl);
      }
      if (state.tabName !== undefined) {
        localStorage.setItem(KEYS.SHEET_TAB, state.tabName);
      }
      if (state.sheetMeta !== undefined) {
        localStorage.setItem(KEYS.SHEET_META, JSON.stringify(state.sheetMeta));
      }
      if (state.headerRowIndex !== undefined) {
        localStorage.setItem(KEYS.HEADER_ROW_INDEX, String(state.headerRowIndex));
      }
      if (state.columnMap !== undefined) {
        localStorage.setItem(KEYS.COLUMN_MAP, JSON.stringify(state.columnMap));
      }
      if (state.personFilter !== undefined) {
        localStorage.setItem(KEYS.PERSON_FILTER, state.personFilter);
      }
      if (state.allRows !== undefined) {
        // Chỉ lưu nếu dữ liệu không quá lớn (< 5MB)
        const serialized = JSON.stringify(state.allRows);
        if (serialized.length < 5 * 1024 * 1024) {
          localStorage.setItem(KEYS.ALL_ROWS, serialized);
        }
      }
      if (state.fullHeaders !== undefined) {
        localStorage.setItem(KEYS.FULL_HEADERS, JSON.stringify(state.fullHeaders));
      }
      if (state.fullDetailHeaders !== undefined) {
        localStorage.setItem(KEYS.FULL_DETAIL_HEADERS, JSON.stringify(state.fullDetailHeaders));
      }
      if (state.fullRows !== undefined) {
        const serialized = JSON.stringify(state.fullRows);
        if (serialized.length < 5 * 1024 * 1024) {
          localStorage.setItem(KEYS.FULL_ROWS, serialized);
        }
      }
      if (state.selectedIds !== undefined) {
        localStorage.setItem(KEYS.SELECTED_IDS, JSON.stringify(state.selectedIds));
      }
    } catch (error) {
      console.error('Error saving state to localStorage:', error);
    }
  },

  /**
   * Khôi phục state từ localStorage
   */
  restoreState(): Partial<PersistedState> {
    try {
      const state: Partial<PersistedState> = {};

      const sheetUrl = localStorage.getItem(KEYS.SHEET_URL);
      if (sheetUrl) state.sheetUrl = sheetUrl;

      const tabName = localStorage.getItem(KEYS.SHEET_TAB);
      if (tabName) state.tabName = tabName;

      const sheetMeta = localStorage.getItem(KEYS.SHEET_META);
      if (sheetMeta) {
        try {
          state.sheetMeta = JSON.parse(sheetMeta);
        } catch (e) {
          console.error('Error parsing sheetMeta:', e);
        }
      }

      const headerRowIndex = localStorage.getItem(KEYS.HEADER_ROW_INDEX);
      if (headerRowIndex) state.headerRowIndex = Number(headerRowIndex);

      const columnMap = localStorage.getItem(KEYS.COLUMN_MAP);
      if (columnMap) {
        try {
          state.columnMap = JSON.parse(columnMap);
        } catch (e) {
          console.error('Error parsing columnMap:', e);
        }
      }

      const personFilter = localStorage.getItem(KEYS.PERSON_FILTER);
      if (personFilter) state.personFilter = personFilter;

      const allRows = localStorage.getItem(KEYS.ALL_ROWS);
      if (allRows) {
        try {
          state.allRows = JSON.parse(allRows);
        } catch (e) {
          console.error('Error parsing allRows:', e);
        }
      }

      const fullHeaders = localStorage.getItem(KEYS.FULL_HEADERS);
      if (fullHeaders) {
        try {
          state.fullHeaders = JSON.parse(fullHeaders);
        } catch (e) {
          console.error('Error parsing fullHeaders:', e);
        }
      }

      const fullDetailHeaders = localStorage.getItem(KEYS.FULL_DETAIL_HEADERS);
      if (fullDetailHeaders) {
        try {
          state.fullDetailHeaders = JSON.parse(fullDetailHeaders);
        } catch (e) {
          console.error('Error parsing fullDetailHeaders:', e);
        }
      }

      const fullRows = localStorage.getItem(KEYS.FULL_ROWS);
      if (fullRows) {
        try {
          state.fullRows = JSON.parse(fullRows);
        } catch (e) {
          console.error('Error parsing fullRows:', e);
        }
      }

      const selectedIds = localStorage.getItem(KEYS.SELECTED_IDS);
      if (selectedIds) {
        try {
          state.selectedIds = JSON.parse(selectedIds);
        } catch (e) {
          console.error('Error parsing selectedIds:', e);
        }
      }

      return state;
    } catch (error) {
      console.error('Error restoring state from localStorage:', error);
      return {};
    }
  },

  /**
   * Xóa toàn bộ state đã lưu (dùng khi logout)
   */
  clearState() {
    try {
      Object.values(KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      console.log('✓ Cleared all persisted state');
    } catch (error) {
      console.error('Error clearing state:', error);
    }
  },

  /**
   * Xóa chỉ data (giữ lại URL và tab)
   */
  clearDataOnly() {
    try {
      localStorage.removeItem(KEYS.SHEET_META);
      localStorage.removeItem(KEYS.HEADER_ROW_INDEX);
      localStorage.removeItem(KEYS.COLUMN_MAP);
      localStorage.removeItem(KEYS.ALL_ROWS);
      localStorage.removeItem(KEYS.FULL_HEADERS);
      localStorage.removeItem(KEYS.FULL_DETAIL_HEADERS);
      localStorage.removeItem(KEYS.FULL_ROWS);
      localStorage.removeItem(KEYS.SELECTED_IDS);
      console.log('✓ Cleared data state (kept URL and tab)');
    } catch (error) {
      console.error('Error clearing data state:', error);
    }
  },
};
