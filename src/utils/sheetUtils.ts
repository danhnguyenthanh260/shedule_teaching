
/**
 * Utility functions for sheet data processing
 */

export const looksLikeDataRow = (row: string[]) => {
  const joined = row.join(' ').toLowerCase();
  const datePattern = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/;
  const timePattern = /\b\d{1,2}:\d{2}\b|\b\d{1,2}h\d{2}\b/;
  const numericCells = row.filter(v => v && /^\d+$/.test(v.trim())).length;
  const filledCells = row.filter(v => v && v.trim()).length;
  const dataSignals = (datePattern.test(joined) ? 1 : 0) + (timePattern.test(joined) ? 1 : 0) + (numericCells > 2 ? 1 : 0);
  return filledCells > 0 && dataSignals >= 1;
};

export const looksLikeHeaderRow = (row: string[]) => {
  const filledCells = row.filter(v => v && v.trim()).length;
  if (filledCells === 0) return false;
  const headerKeywords = ['ngành', 'mã', 'tên', 'đề tài', 'ngày', 'giờ', 'phòng', 'review', 'code', 'count', 'reviewer'];
  const joined = row.join(' ').toLowerCase();
  const keywordHits = headerKeywords.filter(k => joined.includes(k)).length;
  return keywordHits > 0 || filledCells >= Math.max(3, row.length * 0.2);
};

export const mergeHeaderRows = (primary: string[], secondary: string[]) => {
  const maxLen = Math.max(primary.length, secondary.length);
  return Array.from({ length: maxLen }, (_, i) => {
    const a = primary[i]?.trim() || '';
    const b = secondary[i]?.trim() || '';
    if (a && b && a !== b) return `${a} ${b}`;
    return a || b;
  });
};

export const trimLeadingEmptyRows = (rows: string[][]) => {
  let start = 0;
  while (start < rows.length && !rows[start].some(cell => cell && cell.trim())) {
    start += 1;
  }
  return rows.slice(start);
};

/**
 * Fill forward empty cells with last non-empty value (for merged cells)
 * Example: ["REVIEW 1", "", "", "REVIEW 2", "", ""] 
 *      → ["REVIEW 1", "REVIEW 1", "REVIEW 1", "REVIEW 2", "REVIEW 2", "REVIEW 2"]
 */
export const fillForwardHeaders = (headers: string[]): string[] => {
  const filled: string[] = [];
  let lastValue = "";
  for (let i = 0; i < headers.length; i++) {
    const cell = (headers[i] || "").toString().trim();
    if (cell) {
      lastValue = cell;
      filled[i] = cell;
    } else {
      // Empty cell - use last non-empty value (merged cell behavior)
      filled[i] = lastValue || `Column_${i + 1}`;
    }
  }
  return filled;
};
