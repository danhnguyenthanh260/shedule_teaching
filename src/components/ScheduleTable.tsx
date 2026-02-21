
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
    <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent rounded-t-2xl border-t border-slate-200">
      <table className="w-full text-left border-collapse relative">
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
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[200px] border-r border-slate-100/50">{columnLabels?.task || 'Nhiệm vụ'}</th>
                <th className="px-4 py-4 text-[11px] font-bold text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 min-w-[200px] border-r border-slate-100/50">{columnLabels?.person || 'Giảng viên'}</th>
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
                {/* Selection Accent - Full Cell Height Orange Bar instead of just absolute div if preferred, 
                    but the border-l-4 on TR is even more robust. */}
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
                       if (blockMatch !== -1) targetIndex = blockMatch;
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
