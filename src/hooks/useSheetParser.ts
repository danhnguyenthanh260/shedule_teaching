
import { useState, useMemo, useCallback } from 'react';
import { googleService } from '../services/googleService';
import { ColumnMapping, RowNormalized, DateFormat } from '../types';
import {
  mergeHeaderRows,
  fillForwardHeaders,
  looksLikeDataRow
} from '../utils/sheetUtils';
import { khongDau } from '../utils/stringUtils';
import { logWarning } from '../utils/logger';

interface UseSheetParserProps {
  allRows: string[][];
  tabName: string;
  sheetMeta: any;
  setSheetMeta: (meta: any) => void;
  headerRowIndex: number;
  setHeaderRowIndex: (idx: number) => void;
  setFullHeaders: (headers: string[]) => void;
  setFullDetailHeaders: (headers: string[]) => void;
  setTitleRow: (row: string[]) => void;
  setFullRows: (rows: string[][]) => void;
  fullHeaders: string[];
  fullDetailHeaders: string[];
  dateFormat: DateFormat;
  searchColumnIndices: number[];
  setSearchColumnIndices: (indices: number[]) => void;
}

export const useSheetParser = ({
  allRows,
  tabName,
  sheetMeta,
  setSheetMeta,
  headerRowIndex,
  setHeaderRowIndex,
  setFullHeaders,
  setFullDetailHeaders,
  setTitleRow,
  setFullRows,
  fullHeaders,
  fullDetailHeaders,
  dateFormat,
  searchColumnIndices,
  setSearchColumnIndices
}: UseSheetParserProps) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RowNormalized[]>([]);
  const [error, setError] = useState<string | null>(null);

  const applyHeaderRow = useCallback((idx: number, rowsData: string[][], meta?: { sheetId: string; tab: string }) => {
    if (!rowsData || rowsData.length === 0) return;
    setHeaderRowIndex(idx);

    const titleR = rowsData[0] || [];
    const primaryHeaders = idx > 0 ? rowsData[idx - 1] : [];
    const secondaryHeaders = rowsData[idx] || [];

    const isReview = (meta as any)?.isDataMau || tabName.toLowerCase().includes('review') || (meta as any)?.sheetType?.type === 'review';
    const merged = (idx > 0 && !isReview) ? mergeHeaderRows(primaryHeaders, secondaryHeaders) : secondaryHeaders;
    const filled = fillForwardHeaders(merged);

    setTitleRow(titleR);
    setFullHeaders(idx > 0 && isReview ? fillForwardHeaders(primaryHeaders) : filled);
    setFullDetailHeaders(secondaryHeaders);
    setFullRows(rowsData.slice(idx + 1));

    if (meta) {
      setSheetMeta({ ...meta, isDataMau: isReview, headerRowIndex: idx });
    }
    setError(null);
  }, [tabName, setHeaderRowIndex, setTitleRow, setFullHeaders, setFullDetailHeaders, setFullRows, setSheetMeta]);

  const applyMapping = useCallback((mapping: ColumnMapping, isDataMauParam: boolean, overriddenRows?: string[][]) => {
    const rowsToUse = overriddenRows || allRows;
    if (!rowsToUse || rowsToUse.length === 0) return;

    setLoading(true);
    setError(null);
    setRows([]);
    try {
      // 🛡️ Proactive Mode Detection (to avoid React state desync bugs)
      const looksLikeReview = (tabName || "").toLowerCase().includes('review') || 
                              fullDetailHeaders.filter(h => (h || "").toLowerCase().includes('code')).length >= 3;
      
      const isReviewMode = !!isDataMauParam || looksLikeReview; 

      let normalized: RowNormalized[] = [];
      if (isReviewMode) {
        console.log('[Parser] applyMapping: Review Mode (Proactive), normalizing with grouping...');
        normalized = googleService.normalizeRowsWithGrouping({
          sheetId: sheetMeta?.sheetId || '',
          tab: tabName,
          groupHeaders: fullHeaders,
          detailHeaders: fullDetailHeaders,
          rawRows: rowsToUse,
          mapping,
          headerRowIndex,
          isDataMau: true,
          preferredFormat: dateFormat
        });
      } else {
        console.log('[Parser] applyMapping: Council Mode, normal normalization...');
        normalized = googleService.normalizeRows({
          sheetId: sheetMeta?.sheetId || '',
          tab: tabName,
          headers: fullHeaders,
          rawRows: rowsToUse,
          mapping,
          headerRowIndex,
          preferredFormat: dateFormat
        });
      }
      setRows(normalized);
      setSheetMeta((prev: any) => ({ ...prev, mapping, isDataMau: isReviewMode }));
      if (normalized.length === 0) {
        logWarning("Không tìm thấy dữ liệu sau khi mapping");
      }
      setLoading(false);
      return normalized;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      // setLoading(false) is now handled in the try block for success path
      // and implicitly by returning from catch block for error path.
      // No need for a separate finally block for setLoading(false).
    }
  }, [allRows, fullHeaders, fullDetailHeaders, headerRowIndex, sheetMeta, tabName, dateFormat]);

  const headerOptions = useMemo(() => {
    const options: { label: string; value: number }[] = [];
    const seen = new Set<string>();
    const labelCounts = new Map<string, number>();
    const isReview = sheetMeta?.isDataMau;

    fullDetailHeaders.forEach((h) => {
      let label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    });

    fullDetailHeaders.forEach((h, i) => {
      let label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;

      if (isReview) {
        // Restricted list for Review Mode as requested by user
        const allowed = ["code", "reviewer 1", "reviewer 2", "date", "slot", "room"];
        if (!allowed.includes(label.toLowerCase())) {
          return;
        }
      }

      if (!seen.has(label) && !looksLikeDataRow([label])) {
        seen.add(label);
        options.push({ label: label, value: i });
      }
    });

    return options.length > 0 ? options : [{ label: '-- Chọn cột --', value: -1 }];
  }, [fullDetailHeaders, sheetMeta?.isDataMau]);

  const headerRowOptions = useMemo(() => {
    const limit = Math.min(6, allRows.length);
    const options = [];
    for (let i = 0; i < limit; i++) {
      const preview = (allRows[i] || []).filter(Boolean).slice(0, 4).join(' | ');
      let label = `Row ${i + 1}`;
      if (i === 1) label += ' (Merged Headers)';
      else if (i === 2) label += ' (Detail Headers)';
      if (preview) label += `: ${preview}`;
      options.push({ label, value: i });
    }
    return options;
  }, [allRows]);

  const inferredSearchIndices = useMemo(() => {
    const keywords = [
      'ho va ten', 'thanh vien hoi dong', 'reviewer', 'reviewer 1', 'reviewer 2',
      'chu tich', 'thu ky', 'uy vien', 'can bo', 'giang vien', 'giang vien 1', 'giang vien 2'
    ];
    return fullHeaders.reduce((acc, header, index) => {
      const h = khongDau(header);
      if (keywords.some(k => h.includes(k))) {
        acc.push(index);
      }
      return acc;
    }, [] as number[]);
  }, [fullHeaders]);

  const effectiveSearchColumns = useMemo(() => {
    // 🛡️ In Review Mode, strictly only search columns mapped in Step 2
    // to avoid matching Supervisor/Project info columns.
    if (sheetMeta?.isDataMau) {
      const mappedIndices = Object.values(sheetMeta.mapping || {}).filter((idx): idx is number => typeof idx === 'number' && idx !== -1);
      return mappedIndices.length > 0 ? mappedIndices : inferredSearchIndices;
    }

    if (searchColumnIndices && searchColumnIndices.length > 0) {
      return searchColumnIndices;
    }
    return inferredSearchIndices;
  }, [searchColumnIndices, inferredSearchIndices, sheetMeta?.isDataMau, sheetMeta?.mapping]);

  return {
    loading,
    rows,
    setRows,
    error,
    setError,
    applyHeaderRow,
    applyMapping,
    headerOptions,
    headerRowOptions,
    effectiveSearchColumns
  };
};
