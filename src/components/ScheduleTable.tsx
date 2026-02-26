
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
    <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent rounded-t-3xl border-t border-slate-100 bg-[#F8FAFC]">
      {/* 📱 MOBILE VIEW: PREMIUM CARDS (Compact) */}
      <div className="block lg:hidden p-3 space-y-3">
        {/* Solid Mobile Header (Sticky) - prevents content bleed through */}
        <div className="sticky top-0 z-30 -mt-3 -mx-3 mb-4 px-5 py-3.5 bg-white/98 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)]">
           <div className="flex items-center gap-3">
             <div className="relative flex items-center justify-center">
                <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="w-5 h-5 rounded border-slate-300 text-[#F27024] focus:ring-[#F27024] cursor-pointer transition-all"
                    checked={selectedIds.size === displayRows.length && displayRows.length > 0}
                    onChange={onToggleAll}
                />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none">Chọn tất cả</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{displayRows.length} sự kiện</span>
             </div>
           </div>
           <div className="flex items-center gap-2 bg-orange-50 px-2.5 py-1 rounded-xl border border-orange-100/50">
              <div className="w-1 h-1 rounded-full bg-[#F27024] animate-pulse" />
              <span className="text-[9px] font-black text-[#F27024] uppercase tracking-tighter">Đã chọn: {selectedIds.size}</span>
           </div>
        </div>

        {displayRows.map((row) => (
          <div 
            key={row.id}
            onClick={() => onToggleSelect(row.id)}
            className={`premium-card relative p-2.5 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${
              selectedIds.has(row.id)
                ? 'premium-card-selected border-orange-200 ring-1 ring-orange-100/50'
                : 'border-white shadow-sm hover:shadow-md'
            }`}
          >
            {/* Quick Select Checkbox (Compact) - Adjusted position to avoid room overlap */}
            <div className={`absolute -top-1.5 -right-1.5 p-1 transition-opacity z-10 ${selectedIds.has(row.id) ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
               <div className={`w-5 h-5 rounded-full flex items-center justify-center border shadow-sm ${selectedIds.has(row.id) ? 'bg-[#F27024] border-white' : 'border-slate-200 bg-white'}`}>
                  {selectedIds.has(row.id) && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                  )}
               </div>
            </div>

            <div className="flex flex-col gap-2">
              {/* Card Meta: Date & Room (Compact) */}
              <div className="flex items-center gap-2 pr-4">
                <div className="flex items-center gap-1.5 bg-slate-50 px-1.5 py-1 rounded-lg border border-slate-100/50">
                   <div className="w-4 h-4 rounded-md fpt-gradient flex items-center justify-center text-white shadow-sm">
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                   </div>
                   <span className="text-[9px] font-black text-slate-700 uppercase tracking-tight">{row.dateRaw || row.date}</span>
                </div>

                <div className="flex items-center gap-1.5 px-1.5 py-1 bg-blue-50/50 rounded-lg border border-blue-100/30">
                   <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                   <span className="text-[8px] font-black text-blue-600/80 uppercase tracking-widest">{row.locationRaw || row.location || 'PHÒNG TRỐNG'}</span>
                </div>
              </div>

              {/* Main Info Section (Compact) */}
              <div className="space-y-0.5">
                 <h4 className="text-[13px] font-black text-slate-800 leading-tight tracking-tight">
                   {row.personRaw || row.person}
                 </h4>
                 <div className="flex items-center gap-2 overflow-hidden">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide truncate">
                      {row.task || 'Nhiệm vụ chưa xác định'}
                    </p>
                    {row.groupName && row.groupName !== row.person && (
                       <span className="shrink-0 px-1 py-0.5 bg-orange-100 text-[#F27024] text-[7px] font-extrabold rounded-md uppercase tracking-tighter">
                         {row.groupName}
                       </span>
                    )}
                 </div>
              </div>

              {/* Footer Divider & Time (Compact) */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Dự kiến</span>
                 </div>
                 <div className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black shadow-md shadow-slate-200">
                    {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : 'N/A')}
                 </div>
              </div>
            </div>
          </div>
        ))}
        {/* Bottom padding for better scroll feel */}
        <div className="h-6" />
      </div>

      {/* 🖥️ DESKTOP VIEW: TABLE */}
      <table className="hidden lg:table w-full text-left border-collapse relative">
        <thead className="sticky top-0 z-20 bg-white shadow-sm">
          <tr className="border-b border-slate-200">
            <th className="pl-8 py-4 w-12 bg-slate-50 sticky top-0 border-b border-slate-200">
              <div className="flex items-center justify-center w-8 h-8">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="w-5 h-5 rounded-lg border-slate-300 text-[#F27024] focus:ring-[#F27024] cursor-pointer disabled:bg-slate-100 disabled:border-slate-300 transition-all shadow-sm"
                  checked={selectedIds.size === displayRows.length && displayRows.length > 0}
                  onChange={onToggleAll}
                  disabled={false}
                />
              </div>
            </th>

            {!isPreview ? (
              <>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[120px] border-r border-slate-100/50">{columnLabels?.date || 'Ngày'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[140px] border-r border-slate-100/50">{columnLabels?.time || 'Thời gian'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[200px] border-r border-slate-100/50">{columnLabels?.task || 'Tiêu đề / Reviewer 1'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[200px] border-r border-slate-100/50">{columnLabels?.person || 'Họ tên / Reviewer 2'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[150px]">{columnLabels?.location || 'Phòng'}</th>
              </>
            ) : showDynamic ? (
              colMapping.map((col, i) => (
                <th key={i} className={`px-4 py-4 text-[10px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 border-r border-slate-100/50 min-w-[120px]`}>
                  {col.name}
                </th>
              ))
            ) : (
              <>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[120px] border-r border-slate-100/50">{columnLabels?.date || 'Ngày'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[140px] border-r border-slate-100/50">{columnLabels?.time || 'Thời gian'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center pl-6 sticky top-0 min-w-[300px] border-r border-slate-100/50">{columnLabels?.person || 'Tên đề tài'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[150px]">{columnLabels?.location || 'Phòng'}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {displayRows.map((row) => (
            <tr
              key={row.id}
              className={`hover:bg-orange-50/40 transition-all group relative border-l-4 ${
                selectedIds.has(row.id) 
                  ? 'bg-orange-100/40 border-l-[#F27024] shadow-[inset_0_1px_0_0_rgba(242,112,36,0.1),inset_0_-1px_0_0_rgba(242,112,36,0.1)]' 
                  : 'border-l-transparent'
              }`}
            >
              <td className="pl-8 py-4 relative">
                {/* Selection Accent */}
                <label className="flex items-center justify-center w-8 h-8 cursor-pointer pointer-events-auto relative z-10 hover:bg-orange-100/50 rounded-xl transition-all">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-slate-300 text-[#F27024] focus:ring-[#F27024] cursor-pointer transition-all hover:scale-110 shadow-sm disabled:bg-slate-100 disabled:border-slate-200"
                    checked={selectedIds.has(row.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelect(row.id);
                    }}
                    disabled={false}
                  />
                </label>
              </td>

              {!isPreview ? (
                <>
                  <td className="px-4 py-4 text-center border-r border-slate-50/50">
                    <span className="text-sm font-medium text-slate-700 block">{row.dateRaw || row.date}</span>
                  </td>
                  <td className="px-4 py-4 border-r border-slate-50/50">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#F27024] animate-pulse" />
                        <span className="text-sm font-medium text-slate-800 tracking-tighter">
                          {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : '')}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center border-r border-slate-50/50">
                    <span className="text-sm font-medium text-slate-700 block">{row.task || '-'}</span>
                  </td>
                  <td className="px-4 py-4 text-center border-r border-slate-50/50">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium text-slate-900 tracking-tight">{row.personRaw || row.person}</span>
                      {row.groupName &&
                        row.groupName.toLowerCase().trim() !== (row.personRaw || row.person).toLowerCase().trim() && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200 w-fit mt-1.5 uppercase tracking-wider shadow-sm">
                            {row.groupName}
                          </span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-medium text-slate-500">{row.locationRaw || row.location}</span>
                    </div>
                  </td>
                </>
              ) : showDynamic ? (
                colMapping.map((col, i) => {
                  let cellValue = '-';
                  if (row.rawRow) {
                    let targetIndex = col.index;
                    // If row has block boundaries AND this is a Review/DataMau sheet
                    if (row.isGrouped && row.blockStart !== undefined && row.blockEnd !== undefined && col.name) {
                       const lowName = col.name.trim().toLowerCase();
                       const blockMatch = allHeaders.findIndex((h, idx) => 
                         idx >= row.blockStart! && idx <= row.blockEnd! && h.trim().toLowerCase() === lowName
                       );
                       
                       if (blockMatch !== -1) {
                         targetIndex = blockMatch;
                       } else if (row.reviewAreaStart !== undefined && targetIndex >= row.reviewAreaStart) {
                         // 🚨 Block match failed AND original mapping is in review area -> Clear the data
                         targetIndex = -1;
                       }
                    }
                    cellValue = targetIndex !== -1 ? (row.rawRow[targetIndex] || '') : '-';
                  }

                  return (
                    <td key={i} className="px-4 py-4 text-center border-r border-slate-50/50">
                      <span className="text-xs font-medium text-slate-700 block">
                        {cellValue}
                      </span>
                    </td>
                  );
                })
              ) : (
                <>
                  <td className="px-4 py-4 text-center border-r border-slate-50/50">
                    <span className="text-sm font-medium text-slate-700 block">{row.dateRaw || row.date}</span>
                  </td>
                  <td className="px-4 py-4 border-r border-slate-50/50">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#F27024] animate-pulse" />
                        <span className="text-sm font-medium text-slate-800 tracking-tighter">
                          {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : '')}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center border-r border-slate-50/50">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium text-slate-900 tracking-tight">{row.personRaw || row.person}</span>
                      {row.groupName &&
                        row.groupName.toLowerCase().trim() !== (row.personRaw || row.person).toLowerCase().trim() && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200 w-fit mt-1.5 uppercase tracking-wider shadow-sm">
                            {row.groupName}
                          </span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-medium text-slate-500">{row.locationRaw || row.location}</span>
                    </div>
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
