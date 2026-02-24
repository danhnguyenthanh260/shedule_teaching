import React, { useState, useMemo } from 'react';
import { RowNormalized } from '../types';

/**
 * Một "nhóm xung đột" = nhiều event trùng khung giờ nhau
 */
interface ConflictGroup {
  timeSlot: string; // e.g. "23/02 07:00–09:15"
  events: RowNormalized[];
}

interface InternalConflictModalProps {
  isOpen: boolean;
  conflictGroups: ConflictGroup[];
  onAcceptAll: () => void; // Đồng ý sync tất cả
  onSyncSelected: (selectedEvents: RowNormalized[]) => void; // Sync chỉ events đã chọn
  onClose: () => void;
}

// Helper: format time từ ISO hoặc raw string
const fmtTime = (t: string) => {
  try {
    if (t.includes('T')) {
      const d = new Date(t);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return t;
  } catch { return t; }
};

const fmtDate = (t: string) => {
  try {
    if (t.includes('T')) {
      const d = new Date(t);
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }
    return t;
  } catch { return t; }
};

export const InternalConflictModal: React.FC<InternalConflictModalProps> = ({
  isOpen, conflictGroups, onAcceptAll, onSyncSelected, onClose
}) => {
  // Step 1: Thông báo + 2 nút | Step 2: Dropdown chọn
  const [step, setStep] = useState<1 | 2>(1);
  
  // Mỗi group → user chọn event nào giữ lại (index trong group.events)
  const [selections, setSelections] = useState<Record<number, number>>({});

  // Reset khi modal đóng/mở
  React.useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelections({});
    }
  }, [isOpen]);

  // Tổng event bị trùng
  const totalConflicting = useMemo(() => {
    return conflictGroups.reduce((sum, g) => sum + g.events.length, 0);
  }, [conflictGroups]);

  // Kiểm tra đã chọn hết chưa
  const allSelected = Object.keys(selections).length === conflictGroups.length;

  // Lấy danh sách events đã chọn (+ events không bị trùng sẽ được thêm ở parent)
  const handleConfirmSelection = () => {
    const selectedEvents: RowNormalized[] = [];
    conflictGroups.forEach((group, groupIdx) => {
      const selectedIdx = selections[groupIdx];
      if (selectedIdx !== undefined && selectedIdx >= 0) {
        selectedEvents.push(group.events[selectedIdx]);
      }
    });
    onSyncSelected(selectedEvents);
  };

  if (!isOpen || conflictGroups.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl max-h-[85vh] overflow-hidden animate-in zoom-in-95 fade-in duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-orange-100 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-extrabold text-slate-800">
              Phát hiện {totalConflicting} event trùng khung giờ
            </h3>
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">
              {conflictGroups.length} khung giờ bị trùng • {step === 1 ? 'Bước 1/2' : 'Bước 2/2'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/80 text-slate-400 hover:text-slate-600 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[55vh] custom-scrollbar">
          {step === 1 ? (
            /* ========= STEP 1: Liệt kê xung đột ========= */
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Các event sau đây có <b>cùng khung giờ</b>. Bạn muốn xử lý thế nào?
              </p>
              
              {conflictGroups.map((group, gIdx) => (
                <div key={gIdx} className="bg-orange-50/50 border border-orange-100 rounded-2xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold bg-orange-200 text-orange-700 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                      ⏰ {group.timeSlot}
                    </span>
                    <span className="text-[10px] text-orange-400 font-bold">
                      {group.events.length} event trùng
                    </span>
                  </div>
                  {group.events.map((ev, eIdx) => (
                    <div key={eIdx} className="flex items-center gap-2 py-1.5 border-t border-orange-50 first:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-300 shrink-0" />
                      <span className="text-[11px] font-semibold text-slate-700 flex-1 truncate">
                        {ev.person} {ev.task ? `— ${ev.task}` : ''}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {ev.location || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* ========= STEP 2: Dropdown chọn cho từng khung giờ ========= */
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Chọn <b>event muốn giữ lại</b> cho từng khung giờ bị trùng:
              </p>
              
              {conflictGroups.map((group, gIdx) => (
                <div key={gIdx} className={`border rounded-2xl p-4 transition-all ${
                  selections[gIdx] !== undefined 
                    ? 'bg-emerald-50/50 border-emerald-200' 
                    : 'bg-slate-50/50 border-slate-200'
                }`}>
                  <label className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                      {gIdx + 1}/{conflictGroups.length}
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      ⏰ {group.timeSlot}
                    </span>
                    {selections[gIdx] !== undefined && (
                      <svg className="w-4 h-4 text-emerald-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </label>
                  
                  <select
                    value={selections[gIdx] ?? ''}
                    onChange={(e) => {
                      setSelections(prev => ({
                        ...prev,
                        [gIdx]: parseInt(e.target.value)
                      }));
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="" disabled>— Chọn event muốn giữ —</option>
                    {group.events.map((ev, eIdx) => (
                      <option key={eIdx} value={eIdx}>
                        {ev.person} {ev.task ? `(${ev.task})` : ''} — {ev.location || 'Không có phòng'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-3">
          {step === 1 ? (
            <>
              <button
                onClick={onAcceptAll}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-100 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                Đồng ý, sync tất cả
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-orange-500 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-orange-600 active:scale-[0.98] shadow-lg shadow-orange-100 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                Chọn lại từng khung giờ
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className="px-5 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-white active:scale-[0.98] transition-all"
              >
                ← Quay lại
              </button>
              <button
                onClick={handleConfirmSelection}
                disabled={!allSelected}
                className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-[11px] uppercase tracking-wider shadow-lg transition-all active:scale-[0.98] ${
                  allSelected 
                    ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-blue-100' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {allSelected 
                  ? `Xác nhận (${Object.keys(selections).length} event đã chọn)` 
                  : `Còn ${conflictGroups.length - Object.keys(selections).length} khung giờ chưa chọn`
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Hàm phát hiện event trùng nội bộ
 * Trả về { groups: ConflictGroup[], nonConflicting: RowNormalized[] }
 */
export function detectInternalOverlaps(rows: RowNormalized[]): {
  groups: ConflictGroup[];
  nonConflicting: RowNormalized[];
} {
  // Chuyển tất cả event thành timestamp
  const parsed = rows.map(r => {
    let startMs = 0, endMs = 0;
    try {
      if (r.startTime?.includes('T')) {
        startMs = new Date(r.startTime).getTime();
        endMs = new Date(r.endTime).getTime();
      }
    } catch { /* ignore */ }
    return { row: r, startMs, endMs };
  });

  // Nhóm events theo định danh duy nhất: Giờ + Tên + Tiêu đề
  const slotMap = new Map<string, RowNormalized[]>();
  parsed.forEach(({ row, startMs, endMs }) => {
    if (!startMs || !endMs) return;
    // 🛡️ CHỈ COI LÀ TRÙNG NỘI BỘ NẾU: Giờ + Tên + Nhiệm vụ giống hệt (Nghi ngờ dòng rác/trùng)
    const key = `${startMs}-${endMs}-${row.person}-${row.task || ''}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key)!.push(row);
  });

  const groups: ConflictGroup[] = [];
  const conflictingIds = new Set<string>();

  slotMap.forEach((events, key) => {
    if (events.length > 1) {
      // Có trùng!
      const sample = events[0];
      const timeSlot = `${fmtDate(sample.startTime)} ${fmtTime(sample.startTime)}–${fmtTime(sample.endTime)}`;
      groups.push({ timeSlot, events });
      events.forEach(e => conflictingIds.add(e.id));
    }
  });

  const nonConflicting = rows.filter(r => !conflictingIds.has(r.id));

  return { groups, nonConflicting };
}
