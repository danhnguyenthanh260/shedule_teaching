
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
      setCountdown(5);
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-4 animate-in slide-in-from-bottom-6 duration-500">
      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-rose-700 text-sm font-bold flex items-center justify-between shadow-2xl shadow-rose-100 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 font-bold">
              !
            </div>
            <span>{error}</span>
          </div>
          <button onClick={onClose} className="px-2 py-1 hover:bg-rose-100 rounded-lg transition-colors text-rose-400 font-bold text-xs">
            X
          </button>
        </div>
      )}

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-3xl flex items-center justify-between shadow-2xl shadow-emerald-100 border-b-4 border-b-emerald-200">
          <div className="flex items-center gap-4 pl-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 font-bold">
              OK
            </div>
            <div>
              <h4 className="font-bold text-emerald-900 text-sm uppercase tracking-tight">Đồng bộ hoàn tất</h4>
              <p className="text-emerald-700 text-[10px] font-bold mt-0.5 uppercase tracking-wider opacity-60">
                Thêm: {result.created} | Bỏ qua: {result.skipped} | Lỗi: {result.failed}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <a 
              href="https://calendar.google.com" 
              target="_blank" 
              rel="noreferrer" 
              className="flex items-center gap-2 bg-[#F27024] hover:bg-orange-600 text-white px-5 py-2.5 rounded-2xl font-bold text-[10px] transition-all whitespace-nowrap shadow-lg shadow-orange-200 active:scale-95 uppercase tracking-wider"
            >
              Mở Lịch
            </a>

            <div className="flex items-center gap-1 bg-emerald-100/50 rounded-2xl p-1 ml-1">
              {countdown !== null && (
                <div className="flex items-center justify-center min-w-[32px] h-8 px-2 text-emerald-700 text-[11px] font-bold animate-pulse">
                  {countdown}s
                </div>
              )}
              
              <button 
                onClick={onClose} 
                className="w-8 h-8 flex items-center justify-center hover:bg-emerald-200/50 rounded-xl transition-all text-emerald-400 hover:text-emerald-600 font-bold text-xs"
                title="Đóng thông báo"
              >
                X
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
