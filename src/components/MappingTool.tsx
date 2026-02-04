
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
    { key: 'person', label: 'Tên đề tài/Người dạy', icon: '📋' },
    { key: 'location', label: 'Phòng', icon: '📍' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header Row Selector & Apply Button */}
      <div className="flex flex-col lg:flex-row gap-4 items-end">
        <div className="flex-1 w-full bg-slate-50/50 p-4 rounded-2xl border border-slate-100 shadow-inner">
          <label className="block text-[10px] font-black text-slate-400 mb-2 ml-1 uppercase tracking-[0.2em]">Chọn dòng tiêu đề (Header)</label>
          <div className="relative group">
            <select
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F27024] outline-none text-xs font-black text-slate-700 transition-all shadow-sm appearance-none"
              value={headerRowIndex}
              onChange={(e) => onHeaderRowChange(parseInt(e.target.value))}
            >
              {headerRowOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="absolute right-3.5 top-3 text-slate-400 pointer-events-none group-focus-within:text-[#F27024]">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        <button
          onClick={onApply}
          disabled={isLoading}
          className="px-6 h-11 bg-slate-700 text-white font-black rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:border-slate-200 border border-transparent text-xs uppercase tracking-tighter"
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

      {/* Column Mapping Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'date', label: 'NGÀY', icon: '📅' },
          { key: 'time', label: 'THỜI GIAN', icon: '⏰' },
          { key: 'person', label: 'TÊN ĐỀ TÀI', icon: '📋' },
          { key: 'location', label: 'PHÒNG', icon: '📍' },
        ].map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 ml-1 uppercase tracking-[0.15em]">
              <span className="text-xs">{field.icon}</span>
              {field.label}
            </label>
            <div className="relative group">
              <select
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F27024] outline-none text-[11px] font-bold text-slate-600 transition-all shadow-sm appearance-none"
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
  );
};
