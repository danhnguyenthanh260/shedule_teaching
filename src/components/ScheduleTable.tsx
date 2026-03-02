
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
    <div className="h-full overflow-auto bg-white">
      {/* 📱 MOBILE VIEW: CLEAN CARDS */}
      <div className="block lg:hidden p-4 space-y-4">
        {/* Sticky Mobile Selection bar */}
        <div className="sticky top-0 z-[60] -mt-4 -mx-4 mb-4 px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm">
           <div className="flex items-center gap-3">
              <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-300 text-[#F27024] focus:ring-[#F27024]"
                  checked={selectedIds.size === displayRows.length && displayRows.length > 0}
                  onChange={onToggleAll}
              />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">Chọn tất cả ({displayRows.length})</span>
           </div>
           <div className="bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
              <span className="text-[10px] font-bold text-[#F27024] uppercase tracking-widest">{selectedIds.size} ĐÃ CHỌN</span>
           </div>
        </div>

        {displayRows.map((row) => (
          <div 
            key={row.id}
            onClick={() => onToggleSelect(row.id)}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedIds.has(row.id)
                ? 'bg-orange-50 border-[#F27024] shadow-md'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{row.locationRaw || row.location || 'N/A'}</span>
                <span className="text-[10px] font-bold text-[#F27024] uppercase tracking-widest">{row.dateRaw || row.date}</span>
              </div>

              <div className="space-y-1">
                 <h4 className="text-sm font-bold text-slate-800 leading-tight uppercase tracking-tight">
                   {row.personRaw || row.person}
                 </h4>
                 {columnLabels?.task && (columnLabels.task.toLowerCase().includes('reviewer') || columnLabels.task.toLowerCase().includes('gv')) ? (
                   <p className="text-xs text-slate-800 font-bold uppercase truncate">
                     {row.task || '-'}
                   </p>
                 ) : (
                   <p className="text-[11px] text-slate-500 font-medium uppercase truncate">
                     {row.task || 'Nhiệm vụ'}
                   </p>
                 )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                 <span className="text-[10px] font-bold text-slate-400 uppercase">Giờ bảo vệ</span>
                 <span className="px-3 py-1 bg-slate-800 text-white rounded-lg text-[10px] font-bold tracking-widest">
                    {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : 'N/A')}
                 </span>
              </div>
            </div>
          </div>
        ))}
        <div className="h-10" />
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
                    <span className="text-sm text-slate-700 font-medium">{row.dateRaw || row.date}</span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-sm text-slate-800 font-bold">
                      {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : '')}
                    </span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    {columnLabels?.task && (columnLabels.task.toLowerCase().includes('reviewer') || columnLabels.task.toLowerCase().includes('gv')) ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">{row.task || '-'}</span>
                        <span className="text-[9px] font-bold text-[#F27024] mt-1 uppercase tracking-tighter">REVIEW 1</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium max-w-xs truncate block">{row.task || '-'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">{row.personRaw || row.person}</span>
                      {row.groupName &&
                        row.groupName.toLowerCase().trim() !== (row.personRaw || row.person).toLowerCase().trim() && (
                          <span className="text-[9px] font-bold text-[#F27024] mt-1 uppercase tracking-tighter">{row.groupName}</span>
                        )}
                    </div>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{row.locationRaw || row.location}</span>
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
                      <span className="text-sm text-slate-700">{cellValue}</span>
                    </td>
                  );
                })
              ) : (
                <>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-sm text-slate-700 font-medium">{row.dateRaw || row.date}</span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <span className="text-sm text-slate-800 font-bold">
                      {row.timeRaw || (row.startTime?.includes('T') ? (row.startTime.split('T')[1].substring(0, 5) + ' - ' + row.endTime.split('T')[1].substring(0, 5)) : '')}
                    </span>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">{row.personRaw || row.person}</span>
                       {row.groupName && (
                          <span className="text-[9px] font-bold text-[#F27024] mt-1 uppercase tracking-tighter">{row.groupName}</span>
                       )}
                    </div>
                  </td>
                  <td className="px-6 py-4 border-b border-slate-100">
                     <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{row.locationRaw || row.location}</span>
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
