
import React, { useMemo } from 'react';
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
    location?: string;
  };
  // ✅ NEW: Support dynamic columns from Admin config
  columnsConfig?: string;
  headers?: string[];
}

export const ScheduleTable: React.FC<ScheduleTableProps> = ({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  columnLabels,
  columnsConfig,
  headers: allHeaders = []
}) => {
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

  if (rows.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
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
            <th className="pl-8 py-4 w-12 bg-slate-50 sticky top-0">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-[#F27024] focus:ring-[#F27024] cursor-pointer"
                checked={selectedIds.size === rows.length && rows.length > 0}
                onChange={onToggleAll}
              />
            </th>

            {showDynamic ? (
              colMapping.map((col, i) => (
                <th key={i} className={`px-4 py-4 text-[10px] font-black text-black uppercase tracking-wider bg-slate-50 text-center sticky top-0 border-r border-slate-100/50 min-w-[120px]`}>
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
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`hover:bg-orange-50/30 transition-all group ${selectedIds.has(row.id) ? 'bg-orange-50/50' : ''}`}
            >
              <td className="pl-8 py-4">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded-lg border-slate-200 text-[#F27024] focus:ring-[#F27024] cursor-pointer transition-all hover:scale-110 shadow-sm"
                  checked={selectedIds.has(row.id)}
                  onChange={() => onToggleSelect(row.id)}
                />
              </td>

              {showDynamic ? (
                colMapping.map((col, i) => (
                  <td key={i} className="px-4 py-4 text-center border-r border-slate-50/50">
                    <span className="text-xs font-medium text-slate-700 block">
                      {col.index !== -1 ? (row.rawRow?.[col.index] || '') : '-'}
                    </span>
                  </td>
                ))
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
                      <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-none group-hover:bg-white group-hover:shadow-sm transition-all">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-[#F27024] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
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
