import React from 'react';
import { SemesterConfig } from '../../services/configService';

interface SemesterListProps {
    semesters: SemesterConfig[];
    onEdit: (semester: SemesterConfig) => void;
    onDelete: (id: string) => void;
    confirmingDeleteId: string | null;
    setConfirmingDeleteId: (id: string | null) => void;
    onSetupNotifications: (url: string, tabName?: string, semesterId?: string, currentStatus?: boolean) => void;
}

export const SemesterList: React.FC<SemesterListProps> = ({
    semesters,
    onEdit,
    onDelete,
    confirmingDeleteId,
    setConfirmingDeleteId,
    onSetupNotifications
}) => {
    return (
        <div className="space-y-4 pb-20">
            {semesters.map((sem) => (
                <div key={sem.id} className="group bg-white p-4 rounded-xl border border-slate-100 hover:border-orange-200 transition-all duration-300 shadow-sm hover:shadow-md relative overflow-hidden">
                    {/* Background Accent */}
                    <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-500 opacity-50"></div>
                    
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-bold text-slate-800 group-hover:text-[#F27024] transition-colors font-heading leading-tight truncate">{sem.semester}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[7px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border shadow-sm ${
                                        sem.sheetType === 'review' 
                                            ? 'bg-blue-50/50 text-blue-600 border-blue-100' 
                                            : 'bg-emerald-50/50 text-emerald-600 border-emerald-100'
                                    }`}>
                                        {sem.sheetType === 'review' ? 'Chấm Review' : 'Hội đồng'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 ml-4 shrink-0">
                                {confirmingDeleteId === sem.id ? (
                                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-300">
                                        <button
                                            onClick={() => onDelete(sem.id)}
                                            className="px-2 py-1 bg-rose-500 text-white rounded-md text-[8px] font-bold uppercase tracking-wider hover:bg-rose-600 transition-all shadow-sm"
                                        >
                                            Xóa
                                        </button>
                                        <button
                                            onClick={() => setConfirmingDeleteId(null)}
                                            className="px-2 py-1 bg-slate-100 text-slate-500 rounded-md text-[8px] font-bold uppercase tracking-wider hover:bg-slate-200 transition-all"
                                        >
                                            Hủy
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 transition-opacity">
                                        <button
                                            onClick={() => onEdit(sem)}
                                            className="p-1.5 bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500 rounded-lg transition-all border border-slate-100 hover:border-blue-100"
                                            title="Sửa học kỳ"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                        <button
                                            onClick={() => setConfirmingDeleteId(sem.id)}
                                            className="p-1.5 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all border border-slate-100 hover:border-rose-100"
                                            title="Xóa học kỳ"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>



                        <div className="grid grid-cols-2 gap-3 pb-3 mb-3 border-b border-slate-50">
                            <div>
                                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1 font-heading">Dòng bắt đầu</p>
                                <p className="text-[10px] font-bold text-slate-700">{sem.startRow}</p>
                            </div>
                            <div>
                                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1 font-heading">Tab / Sheet</p>
                                <p className="text-[10px] font-bold text-slate-700 truncate">{sem.tabName || 'Mặc định'}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-[9px] font-medium text-slate-400">
                            <div className="flex items-center gap-1.5 truncate flex-1 mr-4">
                                <svg className="w-2.5 h-2.5 opacity-30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                <span className="truncate opacity-60">...{sem.sheetUrl.slice(-25)}</span>
                            </div>
                            {sem.mapping && Object.keys(sem.mapping).length > 0 && (
                                <div className="flex items-center gap-1 text-orange-400 font-bold text-[7px] uppercase tracking-wider shrink-0 bg-orange-50/50 px-1.5 py-0.5 rounded-sm border border-orange-100/50">
                                    <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse"></span>
                                    Mapped
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {semesters.length === 0 && (
                <div className="py-20 bg-white rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-2xl shadow-inner shadow-slate-200/50">📭</div>
                    <h3 className="text-base font-bold text-slate-800 mb-2 font-heading">Chưa có học kỳ nào</h3>
                    <p className="text-xs font-medium text-slate-400 max-w-[180px] mx-auto">Vui lòng tạo học kỳ mới để bắt đầu.</p>
                </div>
            )}
        </div>
    );
};
