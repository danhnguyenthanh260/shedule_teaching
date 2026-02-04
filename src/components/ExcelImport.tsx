
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
  accessToken: string | null;
}

export const ExcelImport: React.FC<ExcelImportProps> = ({
  onDataLoaded,
  setLoading,
  setError,
  sheetUrl,
  setSheetUrl,
  tabName,
  setTabName,
  accessToken
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
      const token = accessToken || localStorage.getItem('google_access_token');
      if (!token) {
        throw new Error('Bạn cần đăng nhập lại để thực hiện thao tác này.');
      }

      const result = await googleService.loadSheet(sheetUrl, targetTab, token);
      
      const isReviewTab = targetTab.toLowerCase().includes('review');
      
      onDataLoaded({
        rawRows: result.rawRows,
        sheetId: result.sheetId,
        tabName: targetTab,
        headerRowIndex: result.headerRowIndex,
        isDataMau: isReviewTab || result.isDataMau
      });
      
    } catch (err: any) {
      console.error('Import error:', err);
      // Detailed error for 403 Forbidden to help users
      if (err.message?.includes('permission') || err.message?.includes('403')) {
        setError(`Lỗi phân quyền: Tài khoản đang đăng nhập không có quyền truy cập File Sheets này. Hãy đảm bảo bạn đã Share file này cho email hiện tại.`);
      } else {
        setError(err.message || 'Không thể tải dữ liệu từ Google Sheet');
      }
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-3 items-end">
      <div className="flex-1 w-full">
        <label className="block text-[10px] font-black text-slate-400 mb-1.5 ml-1 uppercase tracking-widest">Google Sheet URL</label>
        <div className="relative group">
          <input
            type="text"
            placeholder="Dán link Google Sheet vào đây..."
            className="w-full pl-4 pr-12 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-fpt-orange outline-none transition-all text-xs text-slate-600 placeholder:text-slate-300 font-bold h-11 shadow-inner group-focus-within:bg-white"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <div className="absolute right-3.5 top-3 text-slate-300 group-focus-within:text-fpt-orange transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 10-5.656-5.656-1.102 1.101" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex-none flex items-center gap-2">
        <button 
          onClick={() => handleImport('test1')}
          disabled={isProcessing || !sheetUrl}
          className="px-6 h-11 bg-[#F27024] text-white rounded-xl hover:bg-orange-600 active:scale-95 transition-all font-black shadow-lg shadow-orange-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:border-slate-200 border border-transparent text-xs uppercase tracking-tighter"
        >
          <span className="opacity-60 text-[9px] font-black font-mono">TAB</span>
          <span>test1</span>
        </button>
        
        <button 
          onClick={() => handleImport('Review')}
          disabled={isProcessing || !sheetUrl}
          className="px-6 h-11 bg-slate-700 text-white rounded-xl hover:bg-slate-800 active:scale-95 transition-all font-black shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:border-slate-200 border border-transparent text-xs uppercase tracking-tighter"
        >
          <span className="opacity-60 text-[9px] font-black font-mono">TAB</span>
          <span>Review</span>
        </button>
      </div>
    </div>
  );
};
