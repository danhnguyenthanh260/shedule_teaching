
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
import { generateHeaderOptions } from '../utils/headerUtils';

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
  isReviewMode?: boolean;
  isUserAdmin?: boolean; // 🏛️ Admin should see all columns
  currentMapping?: ColumnMapping; // 🔒 Ensure mapped columns are never filtered out
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
  setSearchColumnIndices,
  isReviewMode = false,
  isUserAdmin = false,
  currentMapping = {}
}: UseSheetParserProps) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RowNormalized[]>([]);
  const [error, setError] = useState<string | null>(null);

  const applyHeaderRow = useCallback((idx: number, rowsData: string[][], meta?: { sheetId: string; tab: string }) => {
    if (!rowsData || rowsData.length === 0) return;
    setHeaderRowIndex(idx);
    setRows([]); // Clear rows immediately to avoid mismatch during header changes

    const titleR = rowsData[0] || [];
    const primaryHeaders = idx > 0 ? rowsData[idx - 1] : [];
    const secondaryHeaders = rowsData[idx] || [];

    const isReview = (meta as any)?.isDataMau || tabName.toLowerCase().includes('review') || (meta as any)?.sheetType?.type === 'review';
    
    // 🔒 Chỉ dùng primaryHeaders (row trên) làm group headers khi nó thực sự có repeating labels
    // Tránh nhầm metadata row (VD: "Date", "3", "1/20/2026") làm group headers
    const hasRepeatingLabels = (() => {
      if (idx <= 0) return false;
      const labels: Record<string, number> = {};
      primaryHeaders.forEach(h => {
        const lbl = (h || "").trim().toLowerCase();
        if (lbl && lbl.length > 1) {
          labels[lbl] = (labels[lbl] || 0) + 1;
        }
      });
      return Object.values(labels).some(count => count >= 2);
    })();
    const useGroupHeaders = isReview && hasRepeatingLabels;
    
    const merged = (idx > 0 && !isReview) ? mergeHeaderRows(primaryHeaders, secondaryHeaders) : secondaryHeaders;
    const filled = fillForwardHeaders(merged);

    setTitleRow(titleR);
    setFullHeaders(idx > 0 && useGroupHeaders ? fillForwardHeaders(primaryHeaders) : filled);
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
      // 🛡️ Proactive Mode Detection (Thắt chặt để tránh nhận nhầm Hội đồng -> Review)
      const hasReviewerHeaders = fullDetailHeaders.filter(h => {
        const low = (h || "").toLowerCase();
        return low.includes('reviewer 1') || low.includes('gv 1') || (low.includes('reviewer') && low.includes('1'));
      }).length >= 1;

      const looksLikeReview = (tabName || "").toLowerCase().includes('review') || hasReviewerHeaders;
      
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
      
      console.log(`[Parser] applyMapping DONE: Generated ${normalized.length} events (Mode: ${isReviewMode ? 'Review' : 'Council'})`);

      if (normalized.length === 0) {
        logWarning("Không tìm thấy dữ liệu sau khi mapping");
      }
      setLoading(false);
      return normalized;
    } catch (err: any) {
      setLoading(false);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [allRows, fullHeaders, fullDetailHeaders, headerRowIndex, sheetMeta, tabName, dateFormat]);

  const headerOptions = useMemo(() => {
    return generateHeaderOptions(
      fullDetailHeaders,
      isReviewMode,
      isUserAdmin,
      currentMapping
    );
  }, [fullDetailHeaders, isReviewMode, isUserAdmin, currentMapping]);

  const searchHeaderOptions = useMemo(() => {
    // If not review mode, just return same as headerOptions
    if (!isReviewMode) return headerOptions;

    // In Review Mode: 
    // 1. Only show headers that appear 3+ times in the Detail row (Triple Data)
    // 2. Only show the FIRST occurrence for each unique label
    const counts = new Map<string, number>();
    
    fullDetailHeaders.forEach((h) => {
      const label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    const seenLabels = new Set<string>();

    return headerOptions.filter(opt => {
      // Get base label (remove index suffix if added for Admins)
      const baseLabel = opt.label.split(' (')[0]; 
      const count = counts.get(baseLabel) || 0;
      
      // Rule 1: Must be a triplet (>= 3 occurrences)
      if (count < 3) return false;
      
      // Rule 2: Only 1 representative per label
      if (seenLabels.has(baseLabel)) return false;
      
      seenLabels.add(baseLabel);
      return true;
    });
  }, [headerOptions, isReviewMode, fullDetailHeaders]);

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
    // 🛡️ In Review Mode, search columns mapped in Step 2 
    // PLUS any siblings that share the same labels (to cover all blocks).
    if (sheetMeta?.isDataMau) {
      const mapping = sheetMeta.mapping || {};
      const mappedIndices = Object.values(mapping).filter((idx): idx is number => typeof idx === 'number' && idx !== -1);
      
      if (mappedIndices.length === 0) return inferredSearchIndices;

      // Find all labels that are currently mapped
      const mappedLabels = new Set<string>();
      mappedIndices.forEach(idx => {
        const label = (fullDetailHeaders[idx] || "").trim().toLowerCase();
        if (label && !label.startsWith('column_')) mappedLabels.add(label);
      });

      // Find ALL columns that share these labels
      const broadIndices = new Set<number>();
      fullDetailHeaders.forEach((h, i) => {
        const label = (h || "").trim().toLowerCase();
        if (mappedLabels.has(label)) broadIndices.add(i);
      });

      // Always include mapped indices just in case
      mappedIndices.forEach(idx => broadIndices.add(idx));

      return Array.from(broadIndices).sort((a, b) => a - b);
    }

    if (searchColumnIndices && searchColumnIndices.length > 0) {
      return searchColumnIndices;
    }
    return inferredSearchIndices;
  }, [searchColumnIndices, inferredSearchIndices, sheetMeta?.isDataMau, sheetMeta?.mapping, fullDetailHeaders]);

  return {
    loading,
    rows,
    setRows,
    error,
    setError,
    applyHeaderRow,
    applyMapping,
    headerOptions,
    searchHeaderOptions,
    headerRowOptions,
    effectiveSearchColumns
  };
};
