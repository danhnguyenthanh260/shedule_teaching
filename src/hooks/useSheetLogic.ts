
import { useState, useMemo, useCallback, useEffect } from 'react';
import { googleService } from '../services/googleService';
import { syncEventsToCalendar } from '../services/appsScriptService';
import { syncToGoogleCalendarAPI } from '../services/calendarApiService';
import { firestoreSyncHistoryService } from '../services/firestoreSyncHistoryService';
import { logInfo, logSuccess, logWarning, logError } from '../utils/logger';
import { RowNormalized, SyncResult, ColumnMapping } from '../types';
import {
  mergeHeaderRows,
  fillForwardHeaders,
  looksLikeDataRow
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



  const khongDau = (str: any) => {
    if (!str) return "";
    return str
      .toString()
      .normalize('NFD') // Tách dấu ra khỏi chữ cái
      .replace(/[\u0300-\u036f]/g, '') // Xóa các dấu vừa tách
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  };

  const examinerColumnIndices = useMemo(() => {
    const keywords = [
      'ho va ten', 'thanh vien hoi dong', 'reviewer', 'reviewer 1', 'reviewer 2',
      'chu tich', 'thu ky', 'uy vien', 'can bo', 'giang vien'
    ];
    return fullHeaders.reduce((acc, header, index) => {
      const h = khongDau(header);
      if (keywords.some(k => h.includes(k))) {
        acc.push(index);
      }
      return acc;
    }, [] as number[]);
  }, [fullHeaders]);

  const updateSelections = useCallback((data: RowNormalized[], filterValue?: string) => {
    const fValue = filterValue !== undefined ? filterValue : personFilter;
    const rawFilter = (fValue || '').trim();

    if (!rawFilter) {
      setSelectedIds(new Set(data.map(r => r.id)));
      return;
    }

    const filters = rawFilter.split(',').map(f => khongDau(f)).filter(Boolean);
    const matches = data.filter(row => {
      // CHỈ lọc trên các cột chấm thi
      const searchValues = examinerColumnIndices.map(idx => row.rawRow[idx] || "");
      const searchSpace = [
        ...searchValues,
        row.person,
        row.groupName
      ].map(v => khongDau(v)).join(' ');

      return filters.some(f => searchSpace.includes(f));
    });

    setSelectedIds(new Set(matches.map(m => m.id)));
  }, [personFilter, setSelectedIds, examinerColumnIndices]);

  const applyHeaderRow = useCallback((idx: number, rowsData: string[][], meta?: { sheetId: string; tab: string }) => {
    if (!rowsData || rowsData.length === 0) return;
    setHeaderRowIndex(idx);

    const titleR = rowsData[0] || [];
    const primaryHeaders = idx > 0 ? rowsData[idx - 1] : [];
    const secondaryHeaders = rowsData[idx] || [];

    // Logic: Nếu là sheet Review (DataMau), KHÔNG merge để giữ đúng ranh giới khối.
    const isReview = (meta as any)?.isDataMau || tabName.toLowerCase().includes('review');
    const merged = (idx > 0 && !isReview) ? mergeHeaderRows(primaryHeaders, secondaryHeaders) : secondaryHeaders;
    const filled = fillForwardHeaders(merged);

    setTitleRow(titleR);
    setFullHeaders(idx > 0 && isReview ? fillForwardHeaders(primaryHeaders) : filled); // Row 2 headers for groups
    setFullDetailHeaders(secondaryHeaders); // Row 3 headers for details
    setFullRows(rowsData.slice(idx + 1));

    if (meta) {
      setSheetMeta({ ...meta, headerRowIndex: idx });
    }
    setResult(null);
    setError(null);
  }, [setHeaderRowIndex, setTitleRow, setFullHeaders, setFullDetailHeaders, setFullRows, setSheetMeta]);

  const applyMapping = useCallback((mapping: ColumnMapping, isDataMau: boolean, overriddenRows?: string[][]) => {
    const rowsToUse = overriddenRows || allRows;
    if (!rowsToUse || rowsToUse.length === 0) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setRows([]); // Clear old rows to show update
    try {
      let normalized: RowNormalized[] = [];
      if (isDataMau) {
        normalized = googleService.normalizeRowsWithGrouping({
          sheetId: sheetMeta?.sheetId || '',
          tab: tabName,
          groupHeaders: fullHeaders,
          detailHeaders: fullDetailHeaders,
          rawRows: rowsToUse,
          mapping,
          headerRowIndex,
          isDataMau: true
        });
      } else {
        normalized = googleService.normalizeRows({
          sheetId: sheetMeta?.sheetId || '',
          tab: tabName,
          headers: fullHeaders,
          rawRows: rowsToUse,
          mapping,
          headerRowIndex
        });
      }
      setRows(normalized);
      updateSelections(normalized);
      if (normalized.length > 0) {
        showToast(`✓ Đã áp dụng mapping (${normalized.length} mục)`);
      } else {
        logWarning("Không tìm thấy dữ liệu sau khi mapping");
      }
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
        title: r.person, // Lấy trực tiếp thông tin người dùng chọn làm tiêu đề
        start: r.startTime.includes('+') ? r.startTime : `${r.startTime}+07:00`,
        end: r.endTime.includes('+') ? r.endTime : `${r.endTime}+07:00`,
        location: r.location || '',
        description: `Đồng bộ từ FPT Scheduler\nNội dung: ${r.person}\nPhòng: ${r.location}`
      }));

      // ✅ NEW: Direct Google API sync (Always goes to user's primary calendar)
      const res: any = await syncToGoogleCalendarAPI(events, firebaseAccessToken!);

      // Flexible result parsing (handle different possible GAS response structures)
      const successCount = res.data?.success ?? res.success ?? 0;
      const failedCount = res.data?.failed ?? res.failed ?? 0;
      const skippedCount = res.data?.skipped ?? res.skipped ?? 0;

      const syncRes: SyncResult = {
        created: successCount,
        updated: 0,
        failed: failedCount,
        skipped: skippedCount,
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
    const primary = headerRowIndex > 0 ? allRows[headerRowIndex - 1] : [];
    const options: { label: string; value: number }[] = [];
    const seen = new Set<string>();

    // Đếm số lần xuất hiện của mỗi label (cho chế độ Review)
    const labelCounts = new Map<string, number>();
    const isReview = sheetMeta?.isDataMau;

    fullDetailHeaders.forEach((h, i) => {
      let label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    });

    fullDetailHeaders.forEach((h, i) => {
      let label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;

      const count = labelCounts.get(label) || 0;

      // Nếu là sheet Review: 
      // - Chấp nhận cột xuất hiện 1 lần (Shared)
      // - Chấp nhận cột xuất hiện đúng 3 lần (Repeated)
      if (isReview && count !== 1 && count !== 3) return;

      // Logic "Tiêu đề lặp lại -> Hiện 1 lần"
      if (!seen.has(label) && !looksLikeDataRow([label])) {
        seen.add(label);
        options.push({ label: label, value: i });
      }
    });

    return options.length > 0 ? options : [{ label: '-- Chọn cột --', value: -1 }];
  }, [fullHeaders, allRows, headerRowIndex, sheetMeta?.isDataMau]);

  const headerRowOptions = useMemo(() => {
    const startIndex = 0; // Bắt đầu từ Row 1
    const limit = Math.min(6, allRows.length);
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

  const filteredRows = useMemo(() => {
    const rawFilter = (personFilter || '').trim();
    if (!rawFilter) return rows;

    const filters = rawFilter.split(',').map(f => khongDau(f)).filter(Boolean);

    return rows.filter(row => {
      // CHỈ lọc trên các cột chấm thi
      const searchValues = examinerColumnIndices.map(idx => row.rawRow[idx] || "");
      const searchSpace = [
        ...searchValues,
        row.person,
        row.groupName
      ].map(v => khongDau(v)).join(' ');

      return filters.some(f => searchSpace.includes(f));
    });
  }, [rows, personFilter, examinerColumnIndices]);



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
