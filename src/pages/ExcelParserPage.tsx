import React, { useState } from 'react';
import { NormalizedSheet } from '../utils/excelParser';
import { ExcelImport, DataTable, MergeAnalysisViewer, DateTimeTest } from '../components';
import '../styles/excelParser.css';

interface Tab {
  id: string;
  label: string;
}

export const ExcelParserPage: React.FC = () => {
  const [sheets, setSheets] = useState<NormalizedSheet[]>([]);
  const [activeTab, setActiveTab] = useState('import');
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);

  const tabs: Tab[] = [
    { id: 'import', label: '📤 Nhập dữ liệu' },
    { id: 'data', label: '📊 Xem dữ liệu' },
    { id: 'merge', label: '🔗 Phân tích Merged' },
    { id: 'datetime', label: '⏰ Test DateTime' }
  ];

  const handleDataParsed = (newSheets: NormalizedSheet[]) => {
    setSheets(newSheets);
    setActiveTab('data');
    setSelectedSheetIdx(0);
  };

  const currentSheet = sheets[selectedSheetIdx];

  return (
    <div className="excel-parser-page">
      <div className="page-header">
        <h1>Excel/Google Sheets Parser</h1>
        <p>Hệ thống xử lý Excel với merged cells và datetime auto-detect</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'import' && (
          <div className="tab-pane">
            <ExcelImport onDataParsed={handleDataParsed} />
          </div>
        )}

        {activeTab === 'data' && sheets.length > 0 && (
          <div className="tab-pane">
            {sheets.length > 1 && (
              <div className="sheet-selector">
                <label>Chọn sheet:</label>
                <select
                  value={selectedSheetIdx}
                  onChange={(e) => setSelectedSheetIdx(parseInt(e.target.value))}
                >
                  {sheets.map((sheet, idx) => (
                    <option key={idx} value={idx}>
                      {sheet.sheetName} ({sheet.data.length} dòng)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {currentSheet && <DataTable data={currentSheet} />}
          </div>
        )}

        {activeTab === 'merge' && sheets.length > 0 && (
          <div className="tab-pane">
            {sheets.length > 1 && (
              <div className="sheet-selector">
                <label>Chọn sheet:</label>
                <select
                  value={selectedSheetIdx}
                  onChange={(e) => setSelectedSheetIdx(parseInt(e.target.value))}
                >
                  {sheets.map((sheet, idx) => (
                    <option key={idx} value={idx}>
                      {sheet.sheetName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {currentSheet && <MergeAnalysisViewer sheet={currentSheet} />}
          </div>
        )}

        {activeTab === 'datetime' && (
          <div className="tab-pane">
            <DateTimeTest />
          </div>
        )}

        {activeTab !== 'import' && sheets.length === 0 && (
          <div className="empty-state">
            <p>Chưa có dữ liệu. Vui lòng nhập dữ liệu từ tab "Nhập dữ liệu"</p>
          </div>
        )}
      </div>

      {/* Stats */}
      {sheets.length > 0 && (
        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">{sheets.length}</div>
            <div className="stat-label">Sheets</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{sheets.reduce((sum, s) => sum + s.data.length, 0)}</div>
            <div className="stat-label">Tổng dòng</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{sheets.reduce((sum, s) => sum + s.headers.length, 0)}</div>
            <div className="stat-label">Tổng cột</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{sheets.reduce((sum, s) => sum + (s.mergeInfo?.totalMerges || 0), 0)}</div>
            <div className="stat-label">Merged Cells</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelParserPage;
