
import React from 'react';
import { SyncResult } from '../../types';

interface StatusAlertsProps {
  error: string | null;
  result: SyncResult | null;
}

export const StatusAlerts: React.FC<StatusAlertsProps> = ({ error, result }) => {
  return (
    <>
      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg text-rose-700 text-sm font-medium flex items-center gap-3 shadow-sm animate-in shake duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-lg flex items-center justify-between shadow-sm animate-in slide-in-from-top-4 duration-300">
          <div>
            <h4 className="font-bold text-emerald-900 text-base">✓ Đồng bộ hoàn tất!</h4>
            <p className="text-emerald-700 text-sm font-medium mt-1">
              Thêm: <span className="font-bold">{result.created}</span> |
              Cập nhật: <span className="font-bold">{result.updated}</span> |
              Lỗi: <span className="font-bold">{result.failed}</span>
            </p>
          </div>
          <a 
            href="https://calendar.google.com" 
            target="_blank" 
            rel="noreferrer" 
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap ml-4"
          >
            Xem Calendar
          </a>
        </div>
      )}
    </>
  );
};
