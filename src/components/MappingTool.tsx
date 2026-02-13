
import React from 'react';
import { ColumnMapping } from '../types';

interface MappingToolProps {
  headers: { label: string; value: number }[];
  headerRowOptions: { label: string; value: number }[];
  headerRowIndex: number;
  onHeaderRowChange: (idx: number) => void;
  columnMap: ColumnMapping;
  setColumnMap: (map: ColumnMapping) => void;
  onApply: () => void;
  isLoading: boolean;
}

export const MappingTool: React.FC<MappingToolProps> = ({
  headers,
  headerRowOptions,
  headerRowIndex,
  onHeaderRowChange,
  columnMap,
  setColumnMap,
  onApply,
  isLoading
}) => {
  const fields: { key: keyof ColumnMapping; label: string; icon: string }[] = [
    { key: 'date', label: 'Ngày', icon: '📅' },
    { key: 'time', label: 'Thời gian', icon: '⏰' },
    { key: 'task', label: 'Nhiệm vụ / Đề tài', icon: '📝' },
    { key: 'person', label: 'Giảng viên', icon: '👤' },
    { key: 'location', label: 'Phòng', icon: '📍' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* 
         Removed Header Row Selector as per user request (Admin handles rows).
         Now focus only on Column Mapping.
      */}

      {/* Column Mapping Grid */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ánh xạ cột dữ liệu</h3>
          <button
            onClick={onApply}
            disabled={isLoading}
            className="px-6 h-10 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 active:scale-95 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none text-xs uppercase tracking-tight"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                ÁP DỤNG
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {[
            { key: 'date', label: 'NGÀY', icon: '📅' },
            { key: 'time', label: 'THỜI GIAN', icon: '⏰' },
            { key: 'task', label: 'NHIỆM VỤ / ĐỀ TÀI', icon: '📝' }, // ✅ Added Task
            { key: 'person', label: 'GIẢNG VIÊN', icon: '👤' },      // ✅ Renamed Person
            { key: 'location', label: 'PHÒNG', icon: '📍' },
          ].map((field) => (
            <div key={field.key} className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2 text-[9px] font-bold text-slate-400 ml-1 uppercase tracking-[0.15em] min-h-[1.5rem] leading-tight">
                <span className="text-xs">{field.icon}</span>
                {field.label}
              </label>
              <div className="relative group">
                <select
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F27024] outline-none text-[11px] font-semibold text-slate-600 appearance-none group-hover:border-slate-300 pointer-events-auto cursor-pointer relative z-10"
                  value={columnMap[field.key as keyof ColumnMapping] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setColumnMap({ ...columnMap, [field.key]: val === '' ? undefined : parseInt(val) });
                  }}
                >
                  <option value="">-- Chọn cột --</option>
                  {headers.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-3 text-slate-300 pointer-events-none group-focus-within:text-[#F27024]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
