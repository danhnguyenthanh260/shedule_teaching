import React from 'react';

interface AdminWhitelistManagerProps {
    adminEmails: Record<string, string>;
    newAdminEmail: string;
    onNewAdminEmailChange: (email: string) => void;
    onAddAdmin: (e: React.FormEvent) => void;
    onDeleteAdmin: (key: string) => void;
    confirmingDeleteKey: string | null;
    setConfirmingDeleteKey: (key: string | null) => void;
}

export const AdminWhitelistManager: React.FC<AdminWhitelistManagerProps> = ({
    adminEmails,
    newAdminEmail,
    onNewAdminEmailChange,
    onAddAdmin,
    onDeleteAdmin,
    confirmingDeleteKey,
    setConfirmingDeleteKey
}) => {
    return (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-[11px] font-bold text-[#F27024] mb-8 flex items-center gap-3 uppercase tracking-[0.2em] font-heading">
                <span className="w-8 h-8 bg-orange-50 text-[#F27024] rounded-lg flex items-center justify-center text-xs font-bold border border-orange-100/50">🛡️</span>
                Quản lý Admin phụ
            </h2>

            <form onSubmit={onAddAdmin} className="flex flex-col sm:flex-row gap-4 mb-10">
                <input
                    type="email"
                    placeholder="Nhập email admin mới..."
                    className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-sm font-semibold transition-all placeholder:text-slate-300"
                    value={newAdminEmail}
                    onChange={(e) => onNewAdminEmailChange(e.target.value)}
                    required
                />
                <button
                    type="submit"
                    className="px-8 py-4 bg-[#F27024] text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/10 text-[10px] uppercase tracking-widest active:scale-[0.98]"
                >
                    Thêm Admin
                </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(adminEmails).map(([key, email]) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl group hover:border-orange-200/50 hover:bg-white transition-all">
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-semibold text-slate-700 truncate">{email}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 font-heading">Contributor</span>
                        </div>
                        
                        {confirmingDeleteKey === key ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-300">
                                <button
                                    onClick={() => onDeleteAdmin(key)}
                                    className="px-2.5 py-1.5 bg-rose-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-rose-600 transition-all shadow-sm"
                                >
                                    Xóa
                                </button>
                                <button
                                    onClick={() => setConfirmingDeleteKey(null)}
                                    className="px-2.5 py-1.5 bg-white text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:text-slate-600 transition-all"
                                >
                                    Hủy
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmingDeleteKey(key)}
                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        )}
                    </div>
                ))}

                {Object.keys(adminEmails).length === 0 && (
                    <div className="col-span-full py-12 bg-slate-50/30 rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] font-heading">Chưa có admin phụ nào được thêm</p>
                    </div>
                )}
            </div>
        </div>
    );
};
