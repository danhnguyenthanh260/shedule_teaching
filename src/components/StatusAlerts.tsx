import React, { useState, useEffect } from 'react';
import { SyncResult } from '../types';

interface StatusAlertsProps {
  error: string | null;
  result: SyncResult | null;
  onClose: () => void;
}

export const StatusAlerts: React.FC<StatusAlertsProps> = ({ error, result, onClose }) => {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Auto-close effect for Result (Success)
  useEffect(() => {
    if (result) {
      setCountdown(8);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev !== null && prev <= 1) {
            clearInterval(timer);
            onClose();
            return 0;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setCountdown(null);
    }
  }, [result, onClose]);

  if (!error && !result) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-2xl px-6 animate-in slide-in-from-bottom-8 duration-500 ease-out">
      {error && (
        <div className="bg-white/95 backdrop-blur-xl border border-rose-100 p-5 rounded-[2rem] flex items-center justify-between shadow-[0_20px_50px_rgba(244,63,94,0.15)] mb-3 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 shadow-inner">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
               </svg>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.2em] mb-0.5">Lỗi hệ thống</h4>
              <p className="text-sm font-bold text-slate-800 leading-tight">{error}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center hover:bg-rose-50 rounded-xl transition-all text-slate-300 hover:text-rose-500 active:scale-90"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {result && (
        <div className={`bg-white/95 backdrop-blur-xl border p-6 rounded-[2.5rem] flex flex-col sm:flex-row items-center justify-between shadow-2xl animate-in fade-in zoom-in-95 duration-500 border-b-4 ${
          result.type === 'sync' && result.created === 0 && result.skipped > 0 
            ? 'border-blue-100 border-b-blue-100/50 shadow-blue-500/10' 
            : result.type === 'sync' && result.created === 0 && result.failed > 0
            ? 'border-rose-100 border-b-rose-100/50 shadow-rose-500/10'
            : 'border-emerald-100 border-b-emerald-100/50 shadow-emerald-500/10'
        }`}>
          <div className="flex items-center gap-5 w-full sm:w-auto mb-4 sm:mb-0">
            <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center shadow-inner ${
               result.type === 'sync' && result.created === 0 && result.skipped > 0 
               ? 'bg-blue-50 text-blue-500' 
               : result.type === 'sync' && result.created === 0 && result.failed > 0
               ? 'bg-rose-50 text-rose-500'
               : 'bg-emerald-50 text-emerald-500'
            }`}>
              {result.type === 'sync' && result.created === 0 && result.failed > 0 ? (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div>
              <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-1.5 flex items-center gap-2 ${
                result.type === 'sync' && result.created === 0 && result.skipped > 0 
                  ? 'text-blue-500' 
                  : result.type === 'sync' && result.created === 0 && result.failed > 0
                  ? 'text-rose-500'
                  : 'text-emerald-500'
              }`}>
                <span className={`w-2 h-2 rounded-full animate-pulse shadow-sm ${
                  result.type === 'sync' && result.created === 0 && result.skipped > 0 
                    ? 'bg-blue-400 shadow-blue-400/50' 
                    : result.type === 'sync' && result.created === 0 && result.failed > 0
                    ? 'bg-rose-400 shadow-rose-400/50'
                    : 'bg-emerald-400 shadow-emerald-400/50'
                }`} />
                {result.type === 'clear' 
                  ? 'Dọn dẹp hoàn tất' 
                  : (result.created > 0 ? 'Đồng bộ thành công' : (result.failed > 0 ? 'Đồng bộ thất bại' : 'Lịch đã có sẵn'))}
              </h4>
              
              {result.type === 'sync' ? (
                <div className="flex flex-wrap gap-3">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Đã tạo mới</span>
                      <span className={`text-sm font-extrabold ${result.created > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{result.created}</span>
                   </div>
                   <div className="w-px h-6 bg-slate-100 self-end" />
                   <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Đã tồn tại</span>
                      <span className={`text-sm font-extrabold ${result.skipped > 0 ? 'text-blue-500' : 'text-slate-800'}`}>{result.skipped}</span>
                   </div>
                   <div className="w-px h-6 bg-slate-100 self-end" />
                   <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Gặp lỗi</span>
                      <span className={`text-sm font-extrabold ${result.failed > 0 ? 'text-rose-500' : 'text-slate-800'}`}>{result.failed}</span>
                   </div>
                </div>
              ) : (
                <p className="text-sm font-extrabold text-slate-800 leading-tight">
                  Đã dọn dẹp sạch sẽ các sự kiện trên lịch FPT của bạn.
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
            <a 
              href="https://calendar.google.com" 
              target="_blank" 
              rel="noreferrer" 
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-[10px] transition-all shadow-lg active:scale-95 hover:-translate-y-0.5 uppercase tracking-widest whitespace-nowrap text-white ${
                result.type === 'sync' && result.created === 0 && result.failed > 0
                ? 'bg-rose-500 shadow-rose-100'
                : 'bg-[#F27024] shadow-orange-100'
              }`}
            >
              Xem Lịch
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>

            <div className="flex items-center gap-1 bg-slate-50 rounded-2xl p-1 shadow-inner">
              {countdown !== null && (
                <div className="flex items-center justify-center min-w-[36px] h-9 px-2 text-slate-400 text-[10px] font-bold">
                  {countdown}s
                </div>
              )}
              
              <button 
                onClick={onClose} 
                className="w-9 h-9 flex items-center justify-center hover:bg-white rounded-xl transition-all text-slate-300 hover:text-slate-600 active:scale-90 shadow-sm"
                title="Đóng ngay"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
