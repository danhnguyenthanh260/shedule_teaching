/**
 * Detect merged header structure using Google Sheets merged cell info
 * Structure: REVIEW 1 (merged J:S) | REVIEW 2 (merged T:AB) | REVIEW 3 (merged AC:AL)
 */

export interface ReviewBlock {
  name: string; // "REVIEW 1", "REVIEW 2", "REVIEW 3"
  startCol: number; // Column index (0-based)
  endCol: number; // Column index (0-based)
  columns: string[]; // Sub-header columns
}

export interface MergedHeaderStructure {
  hasReviewStructure: boolean;
  reviewBlocks: ReviewBlock[];
  headerRowIndex: number;
  detailRowIndex: number;
  confidence: number; // 0-100
}

/**
 * Detect merged header structure from raw rows
 * Checks both data array and mergedCells info
 */
export function detectMergedHeaderStructure(
  allRows: any[][],
  mergedCellInfo?: any,
  maxRowsToCheck: number = 5
): MergedHeaderStructure {
  const result: MergedHeaderStructure = {
    hasReviewStructure: false,
    reviewBlocks: [],
    headerRowIndex: -1,
    detailRowIndex: -1,
    confidence: 0
  };

  if (!allRows || allRows.length < 2) {
    return result;
  }

  // Strategy 1: Look for merged cells containing "REVIEW" in row data
  for (let i = 0; i < Math.min(maxRowsToCheck, allRows.length); i++) {
    const row = allRows[i];
    if (!row || row.length === 0) continue;

    // Count cells containing "REVIEW"
    const reviewMatches = row.filter(
      cell => cell && cell.toString().toUpperCase().includes('REVIEW')
    ).length;

    console.log(`Row ${i}: ${reviewMatches} REVIEW cells out of ${row.length} total`, 
      `First 10: [${row.slice(0, 10).map((c, idx) => `${idx}:"${c}"`).join(', ')}]`);

    // If found multiple REVIEW keywords, analyze structure
    if (reviewMatches >= 2) {
      console.log(`✅ Row ${i} has ${reviewMatches} REVIEW markers`);
      
      // Parse review blocks from this row
      const blocks = parseReviewBlocksFromRow(row);

      if (blocks.length >= 2) {
        // Found valid review structure!
        result.headerRowIndex = i;
        result.detailRowIndex = i + 1;
        result.reviewBlocks = blocks;
        result.hasReviewStructure = true;
        result.confidence = Math.min(100, 50 + blocks.length * 15);

        console.log('✅ Detected review structure:', {
          headerRow: i,
          detailRow: i + 1,
          blocks: blocks.map(b => ({ name: b.name, range: `Col${b.startCol}-${b.endCol}` })),
          confidence: result.confidence
        });

        return result;
      }
    }

    // Also check if this row has detail headers that repeat (sign of multi-block structure)
    // E.g., [Code, Count, Reviewer1, ..., Code, Count, Reviewer1, ...]
    if (i > 0) {
      const detailPattern = detectRepeatingPattern(row);
      if (detailPattern.isRepeating && detailPattern.repetitions >= 2) {
        console.log(`✅ Row ${i} has repeating detail pattern (${detailPattern.repetitions}x repetition)`);
        
        // This row likely contains repeated block headers
        // The previous row (i-1) should have the REVIEW headers
        if (i > 0) {
          const prevRow = allRows[i - 1];
          const reviewMatches2 = prevRow?.filter(
            cell => cell && cell.toString().toUpperCase().includes('REVIEW')
          ).length || 0;
          
          if (reviewMatches2 >= 2) {
            const blocks = parseReviewBlocksFromRow(prevRow);
            if (blocks.length >= 2) {
              result.headerRowIndex = i - 1;
              result.detailRowIndex = i;
              result.reviewBlocks = blocks;
              result.hasReviewStructure = true;
              result.confidence = 75;
              
              console.log('✅ Detected via repeating pattern:', {
                headerRow: i - 1,
                detailRow: i,
                blocks: blocks.map(b => ({ name: b.name, range: `Col${b.startCol}-${b.endCol}` })),
                confidence: result.confidence
              });
              
              return result;
            }
          }
        }
      }
    }
  }

  console.log('❌ No merged review structure detected');
  return result;
}

/**
 * Detect if row has repeating pattern (sign of multi-block detail headers)
 * E.g., [Code, Count, Reviewer1, ..., Code, Count, Reviewer1, ...]
 */
function detectRepeatingPattern(row: any[]): { isRepeating: boolean; repetitions: number; patternSize: number } {
  if (row.length < 9) return { isRepeating: false, repetitions: 0, patternSize: 0 };

  // Common pattern: [Code, Count, Reviewer1, Reviewer2, Conflict, Date, DayOfWeek, Slot, Room]
  // Try to detect this repeating 9-element pattern
  const patternSizes = [5, 7, 9, 10]; // Common repetition sizes

  for (const patternSize of patternSizes) {
    let isRepeating = true;
    let repetitions = 0;

    for (let i = 0; i + patternSize <= row.length; i += patternSize) {
      const pattern = row.slice(i, i + patternSize);
      const nextPattern = row.slice(i + patternSize, i + patternSize * 2);

      // Check if patterns have same content (ignoring case and trim)
      if (nextPattern.length === patternSize) {
        const match = pattern.every((cell, idx) => {
          const cell1 = (cell?.toString() || '').trim().toLowerCase();
          const cell2 = (nextPattern[idx]?.toString() || '').trim().toLowerCase();
          return cell1 === cell2;
        });

        if (match) {
          repetitions++;
          i += patternSize;
        }
      }
    }

    if (repetitions >= 2) {
      console.log(`✅ Detected repeating pattern: size=${patternSize}, repetitions=${repetitions + 1}x`);
      return { isRepeating: true, repetitions: repetitions + 1, patternSize };
    }
  }

  return { isRepeating: false, repetitions: 0, patternSize: 0 };
}

/**
 * Parse review blocks from header row
 * Identifies each REVIEW block and its column range
 */
function parseReviewBlocksFromRow(headerRow: any[]): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];
  let currentReview: string | null = null;
  let startCol = 0;
  let columnBuffer: string[] = [];

  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i]?.toString().trim() || '';
    const cellUpper = cell.toUpperCase();

    // Check if this cell is a REVIEW header
    if (cellUpper.includes('REVIEW')) {
      // Save previous review if exists
      if (currentReview && columnBuffer.length > 0) {
        blocks.push({
          name: currentReview,
          startCol: startCol,
          endCol: i - 1,
          columns: [...columnBuffer]
        });
        columnBuffer = [];
      }

      // Start new review
      currentReview = cell;
      startCol = i;
      console.log(`Found REVIEW block "${currentReview}" at column ${i}`);
    } else if (currentReview && cell && !cellUpper.includes('REVIEW')) {
      // This is a detail column under current review
      columnBuffer.push(cell);
    }
  }

  // Save last review
  if (currentReview && columnBuffer.length > 0) {
    blocks.push({
      name: currentReview,
      startCol: startCol,
      endCol: headerRow.length - 1,
      columns: [...columnBuffer]
    });
  }

  console.log(`✅ Parsed ${blocks.length} review blocks:`, 
    blocks.map(b => `${b.name} (${b.columns.join(', ')})`));

  return blocks;
}



/**
 * Get detail headers from second row of review structure
 */
export function getDetailHeaders(
  allRows: any[][],
  detailRowIndex: number
): string[] {
  if (!allRows[detailRowIndex]) {
    return [];
  }

  const detailRow = allRows[detailRowIndex];
  return detailRow.map(cell => cell?.toString().trim() || '').filter(Boolean);
}

/**
 * Expand single row into multiple rows (one per review block)
 * Input: [Code, Count, Rev1-Col1, Rev1-Col2, ..., Rev2-Col1, Rev2-Col2, ..., Rev3-Col1, Rev3-Col2, ...]
 * Output: 3 rows, each containing [Code, Count, Review-Data]
 */
export function expandRowByReviewBlocks(
  row: any[],
  reviewBlocks: ReviewBlock[]
): any[][] {
  const expandedRows: any[][] = [];

  // Get common columns (before first review block)
  const commonStartCol = reviewBlocks.length > 0 ? reviewBlocks[0].startCol : 0;
  const commonCols = row.slice(0, commonStartCol);

  // For each review block, create a new row
  for (const block of reviewBlocks) {
    const blockData = row.slice(block.startCol, block.endCol + 1);
    const expandedRow = [...commonCols, ...blockData];
    expandedRows.push(expandedRow);
  }

  return expandedRows.length > 0 ? expandedRows : [row];
}

/**
 * Process all data rows to expand by review blocks
 */
export function expandAllDataRows(
  allRows: any[][],
  structure: MergedHeaderStructure,
  dataStartIndex: number
): any[][] {
  if (!structure.hasReviewStructure || structure.reviewBlocks.length === 0) {
    return allRows.slice(dataStartIndex);
  }

  const dataRows = allRows.slice(dataStartIndex);
  const expandedRows: any[][] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const expanded = expandRowByReviewBlocks(row, structure.reviewBlocks);
    expandedRows.push(...expanded);
  }

  return expandedRows;
}
