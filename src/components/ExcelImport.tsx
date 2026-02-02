import React, { useState } from 'react';
import { parseExcelFile, parseGoogleSheets, NormalizedSheet } from '../utils/excelParser';
import { validateGoogleSheetUrl } from '../utils/validators';

interface ExcelImportProps {
  onDataParsed: (sheets: NormalizedSheet[]) => void;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({ onDataParsed }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<NormalizedSheet[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      const results = await parseExcelFile(file);
      setPreview(results);
      onDataParsed(results);
    } catch (err) {
      setError('Lỗi: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 🔐 SECURITY: Validate URL before using
      if (!validateGoogleSheetUrl(url)) {
        throw new Error('URL không hợp lệ. Vui lòng nhập URL Google Sheets từ docs.google.com');
      }
      
      const results = await parseGoogleSheets(url);
      setPreview(results);
      onDataParsed(results);
    } catch (err) {
      setError('Lỗi: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="excel-import">
      <h3>Nhập Excel/Google Sheets</h3>
      
      <div className="upload-section">
        <label htmlFor="file-upload">Chọn file Excel:</label>
        <input
          id="file-upload"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={loading}
          className="file-input"
        />
      </div>

      <div className="divider">HOẶC</div>

      <form onSubmit={handleUrlSubmit} className="url-section">
        <label htmlFor="sheets-url">Paste link Google Sheets:</label>
        <div className="input-group">
          <input
            id="sheets-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            disabled={loading}
            className="url-input"
          />
          <button type="submit" disabled={loading || !url} className="btn-submit">
            {loading ? 'Đang xử lý...' : 'Nhập'}
          </button>
        </div>
      </form>

      {error && <div className="error-message">{error}</div>}

      {preview.length > 0 && (
        <div className="preview">
          <h4>Phát hiện {preview.length} sheet:</h4>
          <div className="sheet-list">
            {preview.map((sheet, idx) => (
              <div key={idx} className="sheet-info">
                <div className="sheet-name"><strong>{sheet.sheetName}</strong></div>
                <div className="sheet-details">
                  <span className="badge type">{sheet.detectedType}</span>
                  <span className="stat">{sheet.data.length} dòng</span>
                  <span className="stat">{sheet.headers.length} cột</span>
                  {sheet.mergeInfo?.totalMerges > 0 && (
                    <span className="stat merge">🔗 {sheet.mergeInfo.totalMerges} merged</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
