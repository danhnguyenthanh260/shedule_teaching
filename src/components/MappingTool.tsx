
import React from 'react';
import { ColumnMapping } from '../types';

interface MappingToolProps {
  headers: { label: string; value: number }[];
  headerRowOptions: { label: string; value: number }[];
  headerRowIndex: number;
  onHeaderRowChange: (idx: number) => void;
  columnMap: ColumnMapping;
  setColumnMap: (map: ColumnMapping) => void;
  onApply?: () => void;
  isLoading?: boolean;
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
  const fields: { key: keyof ColumnMapping; label: string }[] = [
    { key: 'date', label: 'Ngày' },
    { key: 'time', label: 'Thời gian' },
    { key: 'task', label: 'Tiêu đề / Reviewer 1' },
    { key: 'person', label: 'Họ tên / Reviewer 2' },
    { key: 'location', label: 'Phòng' },
    { key: 'code', label: 'Mã GV' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 
         Removed Header Row Selector as per user request (Admin handles rows).
         Now focus only on Column Mapping.
      */}

      {/* Column Mapping Grid */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 leading-none">Cột dữ liệu</h3>
          {onApply && (
            <button
              onClick={onApply}
              disabled={isLoading}
              className="px-6 h-11 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 active:scale-95 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none text-[11px] uppercase tracking-widest"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>ÁP DỤNG</>
              )}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
          {[
            { key: 'date', label: 'NGÀY' },
            { key: 'time', label: 'THỜI GIAN' },
            { key: 'task', label: 'TIÊU ĐỀ / REVIEWER 1' },
            { key: 'person', label: 'HỌ TÊN / REVIEWER 2' },
            { key: 'location', label: 'PHÒNG' },
            { key: 'code', label: 'MÃ GIẢNG VIÊN' },
          ].map((field) => (
            <div key={field.key} className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2 text-[9px] font-bold text-slate-400 ml-1 uppercase tracking-[0.15em] min-h-[1.5rem] leading-tight">
                {field.label}
              </label>
              <div className="relative group">
                <select
                  className="w-full px-2 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F27024] outline-none text-[10px] font-semibold text-slate-600 appearance-none group-hover:border-slate-400 pointer-events-auto cursor-pointer relative z-10"
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
                <div className="absolute right-3.5 top-3.5 text-slate-300 pointer-events-none group-focus-within:text-[#F27024] text-[10px] font-bold">
                  V
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
