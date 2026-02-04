
import { useState, useMemo, useCallback, useEffect } from 'react';
import { googleService } from '../services/googleService';
import { syncEventsToCalendar } from '../services/appsScriptService';
import { firestoreSyncHistoryService } from '../services/firestoreSyncHistoryService';
import { logInfo, logSuccess, logWarning, logError } from '../utils/logger';
import { RowNormalized, SyncResult, ColumnMapping } from '../types';
import { 
  mergeHeaderRows, 
  fillForwardHeaders 
} from '../utils/sheetUtils';

interface UseSheetLogicProps {
  sheetUrl: string;
  tabName: string;
  firebaseAccessToken: string | null;
  firebaseUser: any;
  columnMap: ColumnMapping;
  setColumnMap: (map: ColumnMapping) => void;
  allRows: string[][];
  setAllRows: (rows: string[][]) => void;
  sheetMeta: any;
  setSheetMeta: (meta: any) => void;
  headerRowIndex: number;
  setHeaderRowIndex: (idx: number) => void;
  fullHeaders: string[];
  setFullHeaders: (headers: string[]) => void;
  fullDetailHeaders: string[];
  setFullDetailHeaders: (headers: string[]) => void;
  titleRow: string[];
  setTitleRow: (row: string[]) => void;
  fullRows: string[][];
  setFullRows: (rows: string[][]) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  personFilter: string;
}

export const useSheetLogic = ({
  sheetUrl,
  tabName,
  firebaseAccessToken,
  firebaseUser,
  columnMap,
  setColumnMap,
  allRows,
  setAllRows,
  sheetMeta,
  setSheetMeta,
  headerRowIndex,
  setHeaderRowIndex,
  fullHeaders,
  setFullHeaders,
  fullDetailHeaders,
  setFullDetailHeaders,
  titleRow,
  setTitleRow,
  fullRows,
  setFullRows,
  selectedIds,
  setSelectedIds,
  personFilter
}: UseSheetLogicProps) => {
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'test1' | 'review' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState<RowNormalized[]>([]);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const updateSelections = useCallback((data: RowNormalized[], filterValue?: string) => {
    const filterLower = (filterValue !== undefined ? filterValue : personFilter).toLowerCase();
    if (!filterLower || filterLower === '') {
      setSelectedIds(new Set(data.map(r => r.id)));
      return;
    }
    const matches = data.filter(r =>
      r.person.toLowerCase().includes(filterLower) ||
      (r.groupName && r.groupName.toLowerCase().includes(filterLower))
    );
    setSelectedIds(new Set(matches.map(m => m.id)));
  }, [personFilter, setSelectedIds]);

  const applyHeaderRow = useCallback((idx: number, rowsData: string[][], meta?: { sheetId: string; tab: string }) => {
    if (!rowsData || rowsData.length === 0) return;
    setHeaderRowIndex(idx);

    const titleR = rowsData[0] || [];
    const primaryHeaders = rowsData[idx - 1] || [];
    const secondaryHeaders = rowsData[idx] || [];

    const merged = mergeHeaderRows(primaryHeaders, secondaryHeaders);
    const filled = fillForwardHeaders(merged);

    setTitleRow(titleR);
    setFullHeaders(filled);
    setFullDetailHeaders(secondaryHeaders);
    setFullRows(rowsData.slice(idx + 1));
    
    if (meta) {
      setSheetMeta({ ...meta, headerRowIndex: idx });
    }
  }, [setHeaderRowIndex, setTitleRow, setFullHeaders, setFullDetailHeaders, setFullRows, setSheetMeta]);

  const applyMapping = useCallback((mapping: ColumnMapping, isDataMau: boolean) => {
    if (!allRows || allRows.length === 0) return;

    setLoading(true);
    try {
      let normalized: RowNormalized[] = [];
      if (isDataMau) {
        normalized = googleService.normalizeRowsWithGrouping({
          sheetId: sheetMeta?.sheetId || '',
          tab: tabName,
          groupHeaders: fullHeaders,
          detailHeaders: fullDetailHeaders,
          rawRows: allRows.slice(headerRowIndex + 1),
          mapping,
          headerRowIndex
        });
      } else {
        normalized = googleService.normalizeRows({
          sheetId: sheetMeta?.sheetId || '',
          tab: tabName,
          headers: fullHeaders,
          rawRows: allRows.slice(headerRowIndex + 1),
          mapping,
          headerRowIndex
        });
      }
      setRows(normalized);
      updateSelections(normalized);
      showToast(`✓ Đã áp dụng mapping (${normalized.length} mục)`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [allRows, fullHeaders, fullDetailHeaders, headerRowIndex, sheetMeta, tabName, showToast, updateSelections]);

  const handleSync = useCallback(async () => {
    if (!firebaseAccessToken || !firebaseUser || selectedIds.size === 0) {
      setError("Thiếu token truy cập hoặc chưa chọn mục nào.");
      return;
    }

    setSyncing(true);
    setResult(null);
    setError(null);

    try {
      const rowsToSync = rows.filter(r => selectedIds.has(r.id));
      const events = rowsToSync.map(r => ({
        title: r.groupName ? `[${r.groupName}] ${r.person}` : r.person,
        start: r.startTime,
        end: r.endTime,
        location: r.location || '',
        description: `Đồng bộ từ Google Sheet\nGVHD: ${r.person}\nPhòng: ${r.location}\nNhóm: ${r.groupName || 'N/A'}`
      }));

      const res = await syncEventsToCalendar(events, undefined);
      const syncRes: SyncResult = {
        created: res.data?.success || 0,
        updated: 0,
        failed: res.data?.failed || 0,
        logs: [res.message]
      };

      setResult(syncRes);
      showToast(`Đồng bộ xong! Thành công: ${syncRes.created}, Lỗi: ${syncRes.failed}`);

      if (firebaseUser && sheetMeta) {
        firestoreSyncHistoryService.saveSyncResult(
          firebaseUser.uid,
          sheetMeta.sheetId,
          sheetMeta.tab,
          rowsToSync.length,
          syncRes.created,
          syncRes.updated,
          syncRes.failed
        ).catch(hErr => console.warn('Failed to save sync history:', hErr));
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      setError("Lỗi đồng bộ: " + err.message);
    } finally {
      setSyncing(false);
    }
  }, [firebaseAccessToken, firebaseUser, selectedIds, rows, showToast, sheetMeta]);

  const headerOptions = useMemo(() => {
    return fullHeaders.map((h, i) => ({
      label: h || `Column ${i + 1}`,
      value: i
    }));
  }, [fullHeaders]);

  const headerRowOptions = useMemo(() => {
    const startIndex = 1;
    const limit = Math.min(5, allRows.length);
    const options = [];
    for (let i = startIndex; i < limit; i++) {
      const preview = (allRows[i] || []).filter(Boolean).slice(0, 4).join(' | ');
      let label = `Row ${i + 1}`;
      if (i === 1) label += ' (Merged Headers)';
      else if (i === 2) label += ' (Detail Headers)';
      if (preview) label += `: ${preview}`;
      options.push({ label, value: i });
    }
    return options;
  }, [allRows]);

  const khongDau = (str: string) => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  };

  const filteredRows = useMemo(() => {
    if (!personFilter || personFilter.trim() === '') return rows;
    
    // Hỗ trợ tìm nhiều người cách nhau bằng dấu phẩy
    const filters = personFilter.split(',').map(f => khongDau(f)).filter(Boolean);
    
    return rows.filter(row => {
      const personND = khongDau(row.person);
      const groupND = row.groupName ? khongDau(row.groupName) : '';
      
      return filters.some(f => personND.includes(f) || groupND.includes(f));
    });
  }, [rows, personFilter]);

  return {
    loading, setLoading,
    loadingMode, setLoadingMode,
    syncing, setSyncing,
    rows, setRows,
    result, setResult,
    error, setError,
    toastMessage, setToastMessage,
    applyHeaderRow,
    applyMapping,
    handleSync,
    showToast,
    headerOptions,
    headerRowOptions,
    filteredRows,
    updateSelections
  };
};
