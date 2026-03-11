import { ColumnMapping } from '../types';
import { looksLikeDataRow } from './sheetUtils';

/**
 * Filter and generate header options, applying specific logic for Review Mode
 */
export const generateHeaderOptions = (
  fullDetailHeaders: string[],
  isReviewMode: boolean,
  isUserAdmin: boolean,
  currentMapping: ColumnMapping = {}
) => {
  const options: { label: string; value: number }[] = [];
  const seen = new Set<string>();
  const labelCountsInReview = new Map<string, number>();
  const firstOccurrencesInReview = new Map<string, number>();

  // 1. Identify triplets in the Review Area (index >= 9)
  fullDetailHeaders.forEach((h, i) => {
    let label = String(h || "").trim();
    if (!label || label.startsWith('Column_')) return;

    if (i >= 9) {
      labelCountsInReview.set(label, (labelCountsInReview.get(label) || 0) + 1);
      if (!firstOccurrencesInReview.has(label)) {
        firstOccurrencesInReview.set(label, i);
      }
    }
  });

  // 2. Filter and build options
  fullDetailHeaders.forEach((h, i) => {
    let label = String(h || "").trim();
    if (!label || label.startsWith('Column_')) return;

    if (isReviewMode) {
      if (!isUserAdmin) {
        // 🎓 LECTURER in Review Mode: Keyword filtering
        const isMapped = Object.values(currentMapping).includes(i);
        if (!isMapped) {
          const allowedKeywords = [
            "code", "reviewer", "date", "slot", "room", "time", "gvhd",
            "ngay", "ngày", "gio", "giờ", "thời gian", "phong", "phòng", "địa điểm", 
            "nhiệm vụ", "đề tài", "giang vien", "giảng viên", "phân công", "lớp", "mã", "tên"
          ];
          const lowerLabel = label.toLowerCase();
          const isAllowed = allowedKeywords.some(kw => lowerLabel.includes(kw));
          if (!isAllowed) return;
        }
      }
      // For Admin, we KEEP ALL columns! No early return dropping columns!
    }

    // 🕵️ Handle Duplicate Labels
    let finalLabel = label;
    
    // Add (column index) suffix if duplicate label exists, so Admin can differentiate Date of Rev1 vs Rev2
    if (seen.has(label)) {
      finalLabel = `${label} (${i + 1})`; // 1-indexed for display
    }

    if (!looksLikeDataRow([label])) {
      seen.add(label);
      options.push({ label: finalLabel, value: i });
    }
  });

  return options.length > 0 ? options : [{ label: '-- Chọn cột --', value: -1 }];
};
