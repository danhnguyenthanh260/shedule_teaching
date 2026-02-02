/**
 * Auto-detect header row in Excel sheet
 * Algorithm:
 * 1. Check first 5 rows only
 * 2. Calculate score based on:
 *    - Fill rate (% non-empty cells)
 *    - Text cells count (headers are usually text, not numbers)
 *    - Average text length (headers are usually longer than data)
 * 3. Return row with highest score
 */

export interface HeaderDetectionResult {
  rowIndex: number;
  confidence: number; // 0-100
  preview: string[]; // First 3 header values
}

/**
 * Detect which row is most likely the header row
 */
export function detectHeaderRow(rows: any[][]): HeaderDetectionResult {
  if (!rows || rows.length === 0) {
    return { rowIndex: 0, confidence: 0, preview: [] };
  }

  let bestRowIndex = 0;
  let maxScore = 0;
  
  const maxRowsToCheck = Math.min(5, rows.length);

  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Count non-empty cells
    const nonEmptyCells = row.filter(cell => {
      const value = cell?.toString().trim();
      return value && value.length > 0;
    });

    if (nonEmptyCells.length === 0) continue;

    const fillRate = nonEmptyCells.length / row.length;

    // Count text cells (not pure numbers or dates)
    const textCells = nonEmptyCells.filter(cell => {
      const value = cell?.toString().trim();
      if (!value) return false;
      
      // Check if it's a pure number
      const isNumber = !isNaN(Number(value)) && value.length < 10;
      
      // Check if it looks like a date
      const isDate = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value);
      
      return !isNumber && !isDate && value.length >= 2;
    }).length;

    // Calculate average text length (headers are usually longer)
    const avgLength = nonEmptyCells.reduce((sum, cell) => {
      return sum + (cell?.toString().length || 0);
    }, 0) / nonEmptyCells.length;

    // Calculate score:
    // - Fill rate: 0-100 points (higher = better)
    // - Text cells: 0-50 points (more text = likely header)
    // - Avg length: 0-30 points (longer text = likely header)
    const score = 
      fillRate * 100 + 
      (textCells / row.length) * 50 + 
      Math.min(avgLength / 2, 30);

    if (score > maxScore) {
      maxScore = score;
      bestRowIndex = i;
    }
  }

  // Calculate confidence (normalize score to 0-100)
  const confidence = Math.min(Math.round((maxScore / 180) * 100), 100);

  // Get preview of first 3 headers
  const headerRow = rows[bestRowIndex] || [];
  const preview = headerRow
    .filter(cell => cell?.toString().trim())
    .slice(0, 3)
    .map(cell => cell.toString().trim());

  return {
    rowIndex: bestRowIndex,
    confidence,
    preview
  };
}

/**
 * Get all available header rows with their previews (for dropdown)
 */
export function getAllHeaderOptions(rows: any[][], maxRows: number = 5): Array<{
  index: number;
  preview: string;
}> {
  const options: Array<{ index: number; preview: string }> = [];
  const maxRowsToCheck = Math.min(maxRows, rows.length);

  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];
    if (!row || row.length === 0) {
      options.push({ index: i, preview: '(Dòng trống)' });
      continue;
    }

    // Get first 3 non-empty cells as preview
    const preview = row
      .filter(cell => cell?.toString().trim())
      .slice(0, 3)
      .map(cell => {
        const str = cell.toString().trim();
        return str.length > 20 ? str.substring(0, 20) + '...' : str;
      })
      .join(' | ');

    options.push({
      index: i,
      preview: preview || '(Dòng không có dữ liệu)'
    });
  }

  return options;
}

/**
 * Save header row selection to localStorage
 */
export function saveHeaderRowPreference(fileId: string, rowIndex: number): void {
  try {
    const key = `headerRow_${fileId}`;
    localStorage.setItem(key, rowIndex.toString());
  } catch (error) {
    console.error('Failed to save header row preference:', error);
  }
}

/**
 * Load header row selection from localStorage
 */
export function loadHeaderRowPreference(fileId: string): number | null {
  try {
    const key = `headerRow_${fileId}`;
    const value = localStorage.getItem(key);
    return value ? parseInt(value, 10) : null;
  } catch (error) {
    console.error('Failed to load header row preference:', error);
    return null;
  }
}
