
import React, { useMemo, useRef, useEffect } from 'react';
import { RowNormalized } from '../types';

interface ScheduleTableProps {
  rows: RowNormalized[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  columnLabels?: {
    date?: string;
    time?: string;
    person?: string;
    task?: string;
    location?: string;
  };
  // ✅ NEW: Support dynamic columns from Admin config
  columnsConfig?: string;
  headers?: string[];
  isPreview?: boolean;
  allRows?: string[][];
  headerRowIndex?: number;
}

export const ScheduleTable: React.FC<ScheduleTableProps> = ({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  columnLabels,
  columnsConfig,
  headers: allHeaders = [],
  isPreview = false,
  allRows = [],
  headerRowIndex = 0
}) => {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Handle indeterminate state for header checkbox
  useEffect(() => {
    if (headerCheckboxRef.current) {
      const isAllSelected = selectedIds.size === rows.length && rows.length > 0;
      const isNoneSelected = selectedIds.size === 0;
      headerCheckboxRef.current.indeterminate = !isAllSelected && !isNoneSelected;
    }
  }, [selectedIds, rows]);

  // Parse columns config string into array
  const configCols = useMemo(() => {
    if (!columnsConfig) return [];
    return columnsConfig.split(',').map(c => c.trim()).filter(Boolean);
  }, [columnsConfig]);

  // Map config column names to indices in the rawRow
  const colMapping = useMemo(() => {
    if (configCols.length === 0 || allHeaders.length === 0) return null;

    return configCols.map(colName => {
      const index = allHeaders.findIndex(h => h.trim().toLowerCase() === colName.toLowerCase());
      return { name: colName, index };
    });
  }, [configCols, allHeaders]);

  const displayRows = rows;

  if (displayRows.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 font-bold">
          ?
        </div>
        <p className="text-slate-500 font-medium italic">Không có dữ liệu khớp với bộ lọc</p>
      </div>
    );
  }

  // Determine which columns to show: Dynamic or Default
  const showDynamic = colMapping && colMapping.length > 0;

  return (
    <div className="lg:h-full min-h-0 lg:overflow-auto bg-white">
      {/* 📱 MOBILE VIEW: PREMIUM CARDS */}
      <div className="block lg:hidden p-3 space-y-4 pb-20">
        {/* Sticky Mobile Selection bar - Premium Glassmorphism */}
        <div className="sticky top-2 z-[60] -mx-1 mb-6 px-5 py-3.5 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/60 flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
           <div className="flex items-center gap-4">
              <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                  checked={selectedIds.size === displayRows.length && displayRows.length > 0}
                  onChange={onToggleAll}
              />
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-none mb-0.5">Tất cả {displayRows.length}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Chọn nhanh toàn bộ danh sách</span>
              </div>
           </div>
           <div className="bg-indigo-600 px-4 py-1.5 rounded-full shadow-lg shadow-indigo-100 flex items-center gap-1.5">
              <span className="text-[10px] font-black text-white uppercase tracking-wider">{selectedIds.size}</span>
           </div>
        </div>

        {displayRows.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16m-7 6h7" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </div>
            <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">Trống dữ liệu</p>
          </div>
        ) : (
          displayRows.map((row) => (
            <div 
              key={row.id}
              onClick={() => onToggleSelect(row.id)}
              className={`p-5 rounded-[2rem] border-2 transition-all duration-300 cursor-pointer relative overflow-hidden group ${
                selectedIds.has(row.id)
                  ? 'bg-indigo-50/30 border-indigo-600 shadow-xl shadow-indigo-100/50'
                  : 'bg-white border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:border-slate-300'
              }`}
            >
              <div className="flex flex-col gap-4 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] leading-none">
                      {row.dateRaw || row.date}
                    </span>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span className="text-[10px] font-bold uppercase tracking-widest">{row.locationRaw || row.location || 'N/A'}</span>
                    </div>
                  </div>
                  
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                    selectedIds.has(row.id) ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-slate-50 border-slate-200'
                  }`}>
                    {selectedIds.has(row.id) && (
                      <svg className="w-3.5 h-3.5 text-white animate-in zoom-in duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                   <h4 className="text-[15px] font-black text-slate-900 leading-snug uppercase tracking-tight">
                     {row.task || '-'}
                   </h4>
                   <div className="flex flex-wrap items-center gap-2">
                     <span className="text-[11px] font-black text-slate-600 bg-slate-100/50 px-3 py-1 rounded-xl uppercase tracking-tighter">
                       {row.personRaw || row.person}
                     </span>
                     {row.groupName && (
                        <span className="text-[9px] font-black text-white bg-[#F27024] px-2.5 py-0.5 rounded-lg uppercase tracking-widest">
                          {row.groupName}
                        </span>
                     )}
                   </div>
                </div>

                <div className="pt-4 mt-2 border-t border-slate-100/50 flex items-center justify-between">
                   <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none">THỜI GIAN ĐỒNG BỘ</span>
                   <div className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[11px] font-black tracking-[0.15em] shadow-lg shadow-slate-200">
                      {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : 'N/A')}
                   </div>
                </div>
              </div>
              
              {/* Subtle background decoration */}
              <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-32 h-32 bg-indigo-50/20 rounded-full blur-3xl group-hover:bg-indigo-100/30 transition-all duration-700"></div>
            </div>
          ))
        )}
      </div>

      {/* 🖥️ DESKTOP VIEW: CLEAN TABLE */}
      <table className="hidden lg:table w-full text-left border-collapse relative">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="pl-6 py-4 w-16 sticky top-0">
              <div className="flex items-center justify-center">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-300 text-[#F27024] focus:ring-[#F27024] cursor-pointer"
                  checked={selectedIds.size === displayRows.length && displayRows.length > 0}
                  onChange={onToggleAll}
                />
              </div>
            </th>

            {(isPreview ? (showDynamic ? colMapping.map(c => c.name) : ['Ngày', 'Thời gian', 'Tiêu đề', 'Phòng']) : [columnLabels?.date || 'Ngày', columnLabels?.time || 'Thời gian', columnLabels?.task || 'Nhiệm vụ', columnLabels?.person || 'Đối tượng', columnLabels?.location || 'Phòng']).map((h, i) => (
              <th key={i} className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onToggleSelect(row.id)}
              className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                selectedIds.has(row.id) ? 'bg-orange-50/50' : 'bg-white'
              }`}
            >
              <td className="pl-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-[#F27024] focus:ring-[#F27024] pointer-events-none"
                    checked={selectedIds.has(row.id)}
                    readOnly
                  />
                </div>
              </td>

              {!isPreview ? (
                <>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-[13px] text-slate-600 font-bold uppercase tracking-tight">{row.dateRaw || row.date}</span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-[13px] text-slate-900 font-bold tracking-widest whitespace-nowrap">
                      {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : '')}
                    </span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    {columnLabels?.task && (columnLabels.task.toLowerCase().includes('reviewer') || columnLabels.task.toLowerCase().includes('gv')) ? (
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-slate-600 uppercase tracking-tight">{row.task || '-'}</span>
                        <span className="text-[9px] font-bold text-[#F27024] mt-1 uppercase tracking-tighter">REVIEW 1</span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-slate-600 font-bold uppercase tracking-tight block max-w-xs truncate">{row.task || '-'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 uppercase tracking-tight">{row.personRaw || row.person}</span>
                      {row.groupName &&
                        row.groupName.toLowerCase().trim() !== (row.personRaw || row.person).toLowerCase().trim() && (
                          <span className="text-[9px] font-bold text-[#F27024] mt-1 uppercase tracking-tighter">{row.groupName}</span>
                        )}
                    </div>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-[13px] font-bold text-slate-600 uppercase tracking-tight">{row.locationRaw || row.location}</span>
                  </td>
                </>
              ) : showDynamic ? (
                colMapping.map((col, i) => {
                  let cellValue = '-';
                  if (row.rawRow) {
                    let targetIndex = col.index;
                    if (row.isGrouped && row.blockStart !== undefined && row.blockEnd !== undefined && col.name) {
                       const lowName = col.name.trim().toLowerCase();
                       const blockMatch = allHeaders.findIndex((h, idx) => 
                         idx >= row.blockStart! && idx <= row.blockEnd! && h.trim().toLowerCase() === lowName
                       );
                       if (blockMatch !== -1) targetIndex = blockMatch;
                       else if (row.reviewAreaStart !== undefined && targetIndex >= row.reviewAreaStart) targetIndex = -1;
                    }
                    cellValue = targetIndex !== -1 ? (row.rawRow[targetIndex] || '') : '-';
                  }

                  return (
                    <td key={i} className="px-6 py-4 border-b border-slate-100">
                      <span className="text-[13px] text-slate-800 font-bold">{cellValue}</span>
                    </td>
                  );
                })
              ) : (
                <>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-[13px] text-slate-600 font-bold uppercase tracking-tight">{row.dateRaw || row.date}</span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-[13px] text-slate-900 font-bold tracking-widest whitespace-nowrap">
                      {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : '')}
                    </span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-slate-900 uppercase tracking-tight">{row.personRaw || row.person}</span>
                       {row.groupName && (
                          <span className="text-[9px] font-bold text-[#F27024] mt-1 uppercase tracking-tighter">{row.groupName}</span>
                       )}
                    </div>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                     <span className="text-[13px] font-bold text-slate-600 uppercase tracking-tight">{row.locationRaw || row.location}</span>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
