
import React from 'react';

interface SheetSelectorProps {
  sheetUrl: string;
  setSheetUrl: (url: string) => void;
  tabName: string;
  setTabName: (name: string) => void;
  personFilter: string;
  setPersonFilter: (filter: string) => void;
  loadingMode: 'test1' | 'review' | null;
  onLoadTest1: () => void;
  onLoadReview: () => void;
}

export const SheetSelector: React.FC<SheetSelectorProps> = ({
  sheetUrl,
  setSheetUrl,
  tabName,
  setTabName,
  personFilter,
  setPersonFilter,
  loadingMode,
  onLoadTest1,
  onLoadReview
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-linear-to-r from-slate-50 to-transparent">
        <h2 className="text-lg font-bold text-slate-900">Tải dữ liệu từ Google Sheet</h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">Nhập URL Sheet và chọn tab để bắt đầu</p>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-5">
          <label className="block text-sm font-semibold text-slate-900 mb-2">Google Sheet URL</label>
          <input
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 placeholder-slate-400"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-slate-900 mb-2">Tên Tab</label>
          <input
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900"
            value={tabName}
            onChange={e => setTabName(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm font-semibold text-slate-900 mb-2">Lọc theo GVHD</label>
          <input
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 placeholder-slate-400"
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            placeholder="Nhập tên GVHD"
          />
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            onClick={onLoadTest1}
            disabled={loadingMode !== null}
            className="flex-1 h-10.5 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm"
            title="Cấu trúc phẳng: Header dòng 1, range A1:BE"
          >
            {loadingMode === 'test1' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <span className="flex items-center gap-1">
                <span>📄</span> test1
              </span>
            )}
          </button>
          <button
            onClick={onLoadReview}
            disabled={loadingMode !== null}
            className="flex-1 h-10.5 flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm"
            title="Cấu trúc phức tạp: Header dòng 3, range J1:BE"
          >
            {loadingMode === 'review' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <span className="flex items-center gap-1">
                <span>📊</span> Review
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
