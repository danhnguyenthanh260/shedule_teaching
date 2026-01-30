import React from 'react';
import { NormalizedSheet } from '../utils/excelParser';

interface MergeAnalysisViewerProps {
  sheet: NormalizedSheet;
}

export const MergeAnalysisViewer: React.FC<MergeAnalysisViewerProps> = ({ sheet }) => {
  if (!sheet.mergeInfo || sheet.mergeInfo.totalMerges === 0) {
    return <div className="no-merges">✓ Không có merged cells</div>;
  }

  const { mergeInfo } = sheet;

  return (
    <div className="merge-analysis">
      <h4>Phân tích Merged Cells</h4>
      
      <div className="summary">
        <p><strong>Tổng merged cells:</strong> {mergeInfo.totalMerges}</p>
      </div>

      {mergeInfo.headerMerges.length > 0 && (
        <div className="section">
          <h5>Header Merges ({mergeInfo.headerMerges.length}):</h5>
          <ul>
            {mergeInfo.headerMerges.map((merge: any, idx: number) => (
              <li key={idx}>
                Row {merge.startRow + 1}-{merge.endRow + 1}, 
                Col {String.fromCharCode(65 + merge.startCol)}-{String.fromCharCode(65 + merge.endCol)}: 
                <strong> {merge.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mergeInfo.dataMerges.length > 0 && (
        <div className="section">
          <h5>Data Merges ({mergeInfo.dataMerges.length}):</h5>
          <ul>
            {mergeInfo.dataMerges.map((merge: any, idx: number) => (
              <li key={idx}>
                Row {merge.startRow + 1}-{merge.endRow + 1}, 
                Col {String.fromCharCode(65 + merge.startCol)}-{String.fromCharCode(65 + merge.endCol)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mergeInfo.mergedCols.length > 0 && (
        <div className="section">
          <h5>Column Merges ({mergeInfo.mergedCols.length}):</h5>
          <p className="info">Các cột được gộp lại</p>
        </div>
      )}

      {mergeInfo.mergedRows.length > 0 && (
        <div className="section">
          <h5>Row Merges ({mergeInfo.mergedRows.length}):</h5>
          <p className="info">Các dòng được gộp lại</p>
        </div>
      )}

      {mergeInfo.mergedBoth.length > 0 && (
        <div className="section">
          <h5>Both Row & Col Merges ({mergeInfo.mergedBoth.length}):</h5>
          <p className="warning">⚠️ Gộp cả row và col - phức tạp nhất</p>
        </div>
      )}
    </div>
  );
};
