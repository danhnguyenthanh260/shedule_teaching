
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
    const options: { label: string; value: number }[] = [];
    const seen = new Set<string>();
    const labelCountsInReview = new Map<string, number>();
    const firstOccurrencesInReview = new Map<string, number>();
    const isReview = isReviewMode;

    // 🎯 Only count occurrences in the Review Area (index >= 9) to identify true triplets
    fullDetailHeaders.forEach((h, i) => {
      let label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;
      
      if (i >= 9) {
        labelCountsInReview.set(label, (labelCountsInReview.get(label) || 0) + 1);
        if (!firstOccurrencesInReview.has(label)) {
          firstOccurrencesInReview.set(label, i);
        }
      }
    });

    fullDetailHeaders.forEach((h, i) => {
      let label = (h || "").trim();
      if (!label || label.startsWith('Column_')) return;

      const isStaticArea = i < 9;
      const countInReview = labelCountsInReview.get(label) || 0;
      const isMapped = Object.values(currentMapping).includes(i);
      const isFirstTriplet = i === firstOccurrencesInReview.get(label) && countInReview === 3;

      if (isReview && isUserAdmin) {
        // 🏛️ ADMIN in Review Mode:
        // 1. Static Area: Always show
        if (isStaticArea) {
           // Proceed to label decoration
        }
        // 2. Review Area: Only show triplets (representative) or mapped columns
        else if (isFirstTriplet || isMapped) {
           // Proceed to label decoration, but Triplets get CLEAN labels
        } else {
           // Skip everything else in Review Area for Admin
           return;
        }
      } 
      // 🎓 LECTURER (or Non-Admin) in Review Mode: Apply keyword filter
      else if (isReview && !isUserAdmin && !isMapped) {
        const allowedKeywords = [
          "code", "reviewer", "date", "slot", "room", "time", "gvhd",
          "ngay", "ngày", "gio", "giờ", "thời gian", "phong", "phòng", "địa điểm", 
          "nhiệm vụ", "đề tài", "giang vien", "giảng viên", "phân công", "lớp", "mã", "tên"
        ];
        const lowerLabel = label.toLowerCase();
        const isAllowed = allowedKeywords.some(kw => lowerLabel.includes(kw));
        
        if (!isAllowed) {
          return;
        }
      }

      // 🕵️ Handle Duplicate Labels & Clean Triplet Labels
      let finalLabel = label;
      
      // Triplets in Admin mode should be CLEAN (no "(Cột X)") to represent the group
      const shouldBeClean = isReview && isUserAdmin && isFirstTriplet;

      if (!shouldBeClean && seen.has(label)) {
        finalLabel = `${label} (${i + 1})`;
      }

      if (!looksLikeDataRow([label])) {
        seen.add(label); // Cache the raw label for duplicate detection
        options.push({ label: finalLabel, value: i });
      }
    });

    console.log(`📊 [Parser] Generated ${options.length} options. Review Triplet Logic Applied.`);
    return options.length > 0 ? options : [{ label: '-- Chọn cột --', value: -1 }];
  }, [fullDetailHeaders, isReviewMode, isUserAdmin, currentMapping]);

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
