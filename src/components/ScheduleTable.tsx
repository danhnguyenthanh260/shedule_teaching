
import React from 'react';
import { RowNormalized } from '../types';

interface ScheduleTableProps {
  rows: RowNormalized[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
}

export const ScheduleTable: React.FC<ScheduleTableProps> = ({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleAll
}) => {
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

  return (
    <div className="h-full overflow-auto -mx-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent border-t border-slate-100">
      <table className="w-full text-left border-collapse relative">
        <thead className="sticky top-0 z-20 bg-white shadow-sm">
          <tr className="bg-slate-50 border-y border-slate-100">
            <th className="pl-6 py-4 w-12 bg-slate-50">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                checked={selectedIds.size === rows.length && rows.length > 0}
                onChange={onToggleAll}
              />
            </th>
            <th className="px-4 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Ngày</th>
            <th className="px-4 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Thời gian</th>
            <th className="px-4 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Review</th>
            <th className="px-4 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Phòng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr 
              key={row.id} 
              className={`hover:bg-indigo-50/20 transition-all group ${selectedIds.has(row.id) ? 'bg-indigo-50/40' : ''}`}
            >
              <td className="pl-6 py-4">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded-lg border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer transition-all hover:scale-110 shadow-sm"
                  checked={selectedIds.has(row.id)}
                  onChange={() => onToggleSelect(row.id)}
                />
              </td>
              <td className="px-4 py-4">
                 <span className="text-sm font-bold text-slate-700 block">{row.date}</span>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-sm font-black text-slate-800 tracking-tighter">
                      {row.startTime.split('T')[1]} - {row.endTime.split('T')[1]}
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-indigo-900 tracking-tight">{row.person}</span>
                  {row.groupName && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black bg-violet-100 text-violet-700 border border-violet-200 w-fit mt-1.5 uppercase tracking-wider shadow-sm">
                      {row.groupName}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-none group-hover:bg-white group-hover:shadow-sm transition-all">
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-slate-500">{row.location}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
