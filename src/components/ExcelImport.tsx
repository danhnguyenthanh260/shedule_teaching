
import React, { useState } from 'react';
import { googleService } from '../services/googleService';

interface ExcelImportProps {
  onDataLoaded: (data: {
    rawRows: string[][];
    sheetId: string;
    tabName: string;
    headerRowIndex: number;
    isDataMau: boolean;
  }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  sheetUrl: string;
  setSheetUrl: (url: string) => void;
  tabName: string;
  setTabName: (tab: string) => void;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({
  onDataLoaded,
  setLoading,
  setError,
  sheetUrl,
  setSheetUrl,
  tabName,
  setTabName
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImport = async (overrideTab?: string) => {
    if (!sheetUrl) {
      setError('Vui lòng nhập URL Google Sheet');
      return;
    }

    const targetTab = overrideTab || tabName;

    setIsProcessing(true);
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('google_access_token');
      if (!token) {
        throw new Error('Bạn cần đăng nhập lại để thực hiện thao tác này.');
      }

      const result = await googleService.loadSheet(sheetUrl, targetTab, token);
      
      onDataLoaded({
        rawRows: result.rawRows,
        sheetId: result.sheetId,
        tabName: targetTab,
        headerRowIndex: result.headerRowIndex,
        isDataMau: (result as any).isDataMau || false
      });
      
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Không thể tải dữ liệu từ Google Sheet');
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 items-end">
      <div className="flex-1 w-full">
        <label className="block text-[10px] font-black text-slate-400 mb-1.5 ml-1 uppercase tracking-widest">Google Sheet URL</label>
        <div className="relative group">
          <input
            type="text"
            placeholder="Dán link Google Sheet vào đây..."
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs text-slate-600 placeholder:text-slate-300 font-bold h-11 shadow-inner group-focus-within:bg-white"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <div className="absolute right-3.5 top-3 text-slate-300 group-focus-within:text-indigo-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 10-5.656-5.656-1.102 1.101" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex-none flex gap-2">
        <button 
          onClick={() => {
            setTabName('test1');
            setTimeout(() => handleImport('test1'), 10);
          }}
          disabled={isProcessing || !sheetUrl}
          className="px-5 h-11 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-xl hover:from-indigo-600 hover:to-indigo-800 active:scale-95 transition-all font-black shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-30 text-xs uppercase tracking-tighter"
        >
          <span className="opacity-60 text-[9px] font-black">TAB</span>
          <span>test1</span>
        </button>
        
        <button 
          onClick={() => {
            setTabName('Review');
            setTimeout(() => handleImport('Review'), 10);
          }}
          disabled={isProcessing || !sheetUrl}
          className="px-5 h-11 bg-gradient-to-br from-violet-500 to-violet-700 text-white rounded-xl hover:from-violet-600 hover:to-violet-800 active:scale-95 transition-all font-black shadow-lg shadow-violet-100 flex items-center justify-center gap-2 disabled:opacity-30 text-xs uppercase tracking-tighter"
        >
          <span className="opacity-60 text-[9px] font-black">TAB</span>
          <span>Review</span>
        </button>
      </div>
    </div>
  );
};
