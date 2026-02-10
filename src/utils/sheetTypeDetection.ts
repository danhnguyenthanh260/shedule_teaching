/**
 * Sheet type detection and column filtering utilities
 */

export type SheetType = 'review' | 'council' | 'test1';

export interface SheetTypeInfo {
    type: SheetType;
    displayName: string;
    color: string;
    icon: string;
}

/**
 * Detect sheet type based on file name or sheet name
 */
export const detectSheetType = (fileName: string): SheetTypeInfo => {
    const lowerName = fileName.toLowerCase();

    if (lowerName.includes('test1') || lowerName.includes('test 1')) {
        return {
            type: 'test1',
            displayName: 'Test Mode',
            color: 'bg-blue-100 text-blue-700 border-blue-300',
            icon: '📝'
        };
    }

    if (lowerName.includes('sheet1') || lowerName.includes('review')) {
        return {
            type: 'review',
            displayName: 'Chế độ chấm review',
            color: 'bg-purple-100 text-purple-700 border-purple-300',
            icon: '📊'
        };
    }

    return {
        type: 'council',
        displayName: 'Chế độ chấm hội đồng',
        color: 'bg-slate-100 text-slate-700 border-slate-300',
        icon: '📄'
    };
};

/**
 * Filter columns based on sheet type
 * @param headers - Array of column headers
 * @param sheetType - Detected sheet type
 * @returns Array of column indices to display
 */
export const filterColumnsByType = (headers: string[], sheetType: SheetType): number[] => {
    if (sheetType === 'test1') {
        // Test1: Show all columns (no filtering)
        return headers.map((_, index) => index);
    }

    if (sheetType === 'review') {
        // Review: Only show Review columns and basic info
        // Dynamic detection: Check if columns A-I contain "Project Info" garbage
        // Only skip if we detect keywords like "STT", "Mã nhóm", "GVHD" in the first few columns
        const firstColumns = headers.slice(0, 9).map(h => String(h || '').toLowerCase().trim());
        const projectInfoKeywords = ['stt', 'mã nhóm', 'mã đề tài', 'tên đề tài', 'gvhd'];
        const hasProjectInfoGarbage = firstColumns.filter(h =>
            projectInfoKeywords.some(k => h.includes(k))
        ).length >= 2; // Require at least 2 matches to be sure

        const reviewIndices: number[] = [];

        headers.forEach((header, index) => {
            // ✅ SMART RULE: Only ignore columns A-I if we detected garbage there
            if (hasProjectInfoGarbage && index < 9) return;

            const lowerHeader = String(header || '').toLowerCase().trim();

            // Include basic info columns (Vietnamese & English)
            if (
                lowerHeader.includes('mã') ||
                lowerHeader.includes('họ') ||
                lowerHeader.includes('tên') ||
                lowerHeader.includes('student') ||
                lowerHeader.includes('name') ||
                lowerHeader.includes('code') ||
                lowerHeader.includes('count') ||
                lowerHeader === 'day' ||
                lowerHeader.includes('day of week') ||
                lowerHeader.includes('slot') ||
                lowerHeader.includes('room') ||
                lowerHeader.includes('date') ||
                lowerHeader.includes('time')
            ) {
                reviewIndices.push(index);
                return;
            }

            // Include Review & Supervisor columns
            if (
                lowerHeader.includes('review') ||
                lowerHeader.includes('reviewer') ||
                lowerHeader.includes('đánh giá') ||
                lowerHeader.includes('supervisor') ||
                lowerHeader.includes('gvhd') ||
                lowerHeader.includes('hd') ||
                lowerHeader.includes('pb') || // Phản biện
                lowerHeader.includes('conflict') ||
                lowerHeader.includes('result') ||
                lowerHeader.includes('state')
            ) {
                reviewIndices.push(index);
                return;
            }
        });

        return reviewIndices;
    }

    // Council: Show all columns
    return headers.map((_, index) => index);
};

/**
 * Get filtered headers based on sheet type
 */
export const getFilteredHeaders = (headers: string[], sheetType: SheetType): string[] => {
    const indices = filterColumnsByType(headers, sheetType);
    return indices.map(i => headers[i]);
};

/**
 * Filter row data based on column indices
 */
export const filterRowData = (row: any[], columnIndices: number[]): any[] => {
    return columnIndices.map(i => row[i] || '');
};
