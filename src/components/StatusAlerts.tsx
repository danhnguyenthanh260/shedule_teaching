import React, { useState, useEffect } from 'react';
import { SyncResult } from '../types';

interface StatusAlertsProps {
  error: string | null;
  result: SyncResult | null;
  onClose: () => void;
  onForceSync?: () => void;
  onConflictResolve?: (mode: 'insert' | 'keep_old' | 'replace') => void;
  conflicts?: any[];
}

export const StatusAlerts: React.FC<StatusAlertsProps> = ({ error, result, onClose, onForceSync, onConflictResolve, conflicts = [] }) => {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Auto-close effect for Result (Success)
  useEffect(() => {
    const isFullSuccess = result && (result.created > 0 || (result.updated ?? 0) > 0) && result.failed === 0;
    const isClean = result?.type === 'clear';
    
    if ((isFullSuccess || isClean) && !error) {
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
  }, [result, error, onClose]);

  if (!error && !result) return null;

  const errorText = error || '';
  const isConflict = errorText.includes('xung đột') || errorText.includes('Xung đột') || errorText.toLowerCase().includes('conflict');
  const isAuthError = errorText.includes('401') || errorText.toLowerCase().includes('unauthenticated') || errorText.toLowerCase().includes('invalid credentials');
  const hasTimeConflicts = isConflict && conflicts.length > 0;

  // Format time helper
  const fmtTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };
  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-2xl px-6 animate-in slide-in-from-bottom-8 duration-500 ease-out">
      {/* 🚨 ERROR ALERT */}
      {error && (
        <div className={`bg-white/95 backdrop-blur-xl border p-5 rounded-[2rem] shadow-2xl mb-3 animate-in fade-in zoom-in-95 duration-300 border-b-4 ${
          hasTimeConflicts ? 'border-orange-100 border-b-orange-200' : 
          isConflict ? 'border-orange-100 border-b-orange-200' : 
          isAuthError ? 'border-purple-100 border-b-purple-200 shadow-purple-500/10' :
          'border-rose-100 border-b-rose-200'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
              isConflict ? 'bg-orange-50 text-orange-500' : 
              isAuthError ? 'bg-purple-50 text-purple-500' :
              'bg-rose-50 text-rose-500'
            }`}>
              {isAuthError ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-1 ${
                isConflict ? 'text-orange-500' : 
                isAuthError ? 'text-purple-500' :
                'text-rose-500'
              }`}>
                {hasTimeConflicts ? 'Phát hiện xung đột thời gian' : isConflict ? 'Phát hiện xung đột' : isAuthError ? 'Hết hạn truy cập' : 'Gặp lỗi hệ thống'}
              </h4>
              <p className="text-sm font-bold text-slate-800 leading-tight">
                {isAuthError ? 'Phiên đăng nhập Google đã hết hạn. Hãy bấm Cấp lại quyền để tiếp tục.' : error}
              </p>

              {/* 📋 Chi tiết xung đột thời gian */}
              {hasTimeConflicts && (
                <div className="mt-3 max-h-28 overflow-y-auto pr-2 custom-scrollbar border-t border-orange-50 pt-2">
                  {conflicts.slice(0, 5).map((c: any, idx: number) => (
                    <div key={idx} className="text-[11px] text-orange-600 font-medium mb-1.5 flex gap-2 items-start">
                      <span className="shrink-0 mt-0.5">⏰</span>
                      <span>
                        <b>{fmtDate(c.newStart)} {fmtTime(c.newStart)}–{fmtTime(c.newEnd)}</b>: &quot;{c.newEvent}&quot; trùng với &quot;{c.oldEvent}&quot;
                      </span>
                    </div>
                  ))}
                  {conflicts.length > 5 && (
                    <div className="text-[9px] text-orange-400 italic font-bold">... và {conflicts.length - 5} xung đột khác.</div>
                  )}
                </div>
              )}

              {/* 🎯 3 Nút lựa chọn xử lý xung đột */}
              {hasTimeConflicts && onConflictResolve && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-orange-50">
                  <button 
                    onClick={() => onConflictResolve('insert')}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-emerald-500 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider hover:bg-emerald-600 active:scale-95 shadow-lg shadow-emerald-100 transition-all whitespace-nowrap"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v12m6-6H6" /></svg>
                    Chèn vô chung
                  </button>
                  <button 
                    onClick={() => onConflictResolve('keep_old')}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-blue-500 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider hover:bg-blue-600 active:scale-95 shadow-lg shadow-blue-100 transition-all whitespace-nowrap"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Giữ lịch cũ
                  </button>
                  <button 
                    onClick={() => onConflictResolve('replace')}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-orange-500 text-white rounded-xl font-bold text-[9px] uppercase tracking-wider hover:bg-orange-600 active:scale-95 shadow-lg shadow-orange-100 transition-all whitespace-nowrap"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Thay thế lịch mới
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {isAuthError && onForceSync && (
                <button 
                  onClick={onForceSync}
                  className="px-5 py-2.5 bg-purple-500 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-purple-600 active:scale-95 shadow-lg shadow-purple-100"
                >
                  Cấp lại quyền
                </button>
              )}
              <button 
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-xl transition-all text-slate-300 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 RESULT CARD */}
      {result && (
        <div className={`bg-white/95 backdrop-blur-xl border p-6 rounded-[2.5rem] flex flex-col sm:flex-row items-center justify-between shadow-2xl animate-in fade-in zoom-in-95 duration-500 border-b-4 ${
          result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.skipped > 0 
            ? 'border-blue-100 border-b-blue-100/50 shadow-blue-500/10' 
            : result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.failed > 0
            ? 'border-rose-100 border-b-rose-100/50 shadow-rose-500/10'
            : 'border-emerald-100 border-b-emerald-100/50 shadow-emerald-500/10'
        }`}>
          <div className="flex items-center gap-5 w-full sm:w-auto mb-4 sm:mb-0">
            <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center shadow-inner ${
               result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.skipped > 0 
               ? 'bg-blue-50 text-blue-500' 
               : result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.failed > 0
               ? 'bg-rose-50 text-rose-500'
               : 'bg-emerald-50 text-emerald-500'
            }`}>
              {result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.failed > 0 ? (
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
                result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.skipped > 0 
                  ? 'text-blue-500' 
                  : result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.failed > 0
                  ? 'text-rose-500'
                  : 'text-emerald-500'
              }`}>
                <span className={`w-2 h-2 rounded-full animate-pulse shadow-sm ${
                  result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.skipped > 0 
                    ? 'bg-blue-400 shadow-blue-400/50' 
                    : result.type === 'sync' && result.created === 0 && (result.updated ?? 0) === 0 && result.failed > 0
                    ? 'bg-rose-400 shadow-rose-400/50'
                    : 'bg-emerald-400 shadow-emerald-400/50'
                }`} />
                {result.type === 'clear' 
                  ? 'Đã xóa tất cả sự kiện' 
                  : (result.created > 0 ? 'Đồng bộ thành công' : ((result.updated ?? 0) > 0 ? 'Đã thay thế thành công' : (result.failed > 0 ? 'Đồng bộ thất bại' : 'Lịch đã có sẵn')))}
              </h4>
              
              {result.type === 'sync' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Đã tạo mới</span>
                        <span className={`text-sm font-extrabold ${result.created > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{result.created}</span>
                    </div>
                    {(result.updated ?? 0) > 0 && (
                      <>
                        <div className="w-px h-6 bg-slate-100 self-end" />
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Đã cập nhật</span>
                            <span className="text-sm font-extrabold text-orange-500">{result.updated}</span>
                        </div>
                      </>
                    )}
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

                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar border-t border-slate-50 pt-2">
                       {result.errors.slice(0, 5).map((err, idx) => (
                         <div key={idx} className="text-[10px] text-rose-400 font-medium mb-1 flex gap-2">
                            <span className="shrink-0">•</span>
                            <span className="line-clamp-2"><b>{err.title}:</b> {err.message}</span>
                         </div>
                       ))}
                       {result.errors.length > 5 && (
                         <div className="text-[9px] text-slate-400 italic font-bold">... và {result.errors.length - 5} lỗi khác.</div>
                       )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-extrabold text-slate-800 leading-tight">
                    {result.logs && result.logs.length > 0 
                      ? result.logs[0] 
                      : 'Đã dọn dẹp sạch sẽ các sự kiện trên lịch của bạn.'}
                  </p>
                  {result.logs && result.logs.length > 1 && (
                    <p className="text-[10px] font-medium text-slate-400">
                      {result.logs[1]}
                    </p>
                  )}
                </div>
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
