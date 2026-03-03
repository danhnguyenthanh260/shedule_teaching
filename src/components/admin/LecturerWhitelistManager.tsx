import React from 'react';

interface LecturerWhitelistManagerProps {
    lecturers: Record<string, { name: string; code: string; email: string }>;
    newLecturer: { name: string; code: string; email: string };
    onNewLecturerChange: (data: any) => void;
    onAddLecturer: (e: React.FormEvent) => void;
    onDeleteLecturer: (key: string) => void;
    onEditLecturer: (key: string, data: any) => void;
    onImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
    confirmingDeleteKey: string | null;
    setConfirmingDeleteKey: (key: string | null) => void;
    editingKey: string | null;
    onCancelEdit: () => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    loading: boolean;
}

export const LecturerWhitelistManager: React.FC<LecturerWhitelistManagerProps> = ({
    lecturers,
    newLecturer,
    onNewLecturerChange,
    onAddLecturer,
    onDeleteLecturer,
    onEditLecturer,
    onImportExcel,
    confirmingDeleteKey,
    setConfirmingDeleteKey,
    editingKey,
    onCancelEdit,
    fileInputRef,
    loading
}) => {
    return (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <h2 className="text-[11px] font-bold text-[#F27024] flex items-center gap-3 uppercase tracking-[0.2em] font-heading">
                    <span className="w-8 h-8 bg-orange-50 text-[#F27024] rounded-lg flex items-center justify-center text-xs font-bold border border-orange-100/50">🎓</span>
                    Danh sách Giảng viên
                </h2>
                
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-500 hover:text-white transition-all shadow-sm text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 border border-emerald-100 active:scale-[0.98]"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                    Nhập từ Excel
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".xlsx, .xls"
                    onChange={onImportExcel}
                />
            </div>
            
            <form onSubmit={onAddLecturer} className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl mb-10">
                <div className="grid grid-cols-12 gap-5 mb-6">
                    <div className="col-span-12 md:col-span-7 lg:col-span-8">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 ml-1">Họ và Tên</label>
                        <input
                            type="text"
                            placeholder="Tên giảng viên..."
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all shadow-sm"
                            value={newLecturer.name}
                            onChange={(e) => onNewLecturerChange({ name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="col-span-12 md:col-span-5 lg:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 ml-1">Mã Giảng viên</label>
                        <input
                            type="text"
                            placeholder="Mã (HoangNT)..."
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all shadow-sm"
                            value={newLecturer.code}
                            onChange={(e) => onNewLecturerChange({ code: e.target.value })}
                            required
                        />
                    </div>
                </div>
                <div className="flex gap-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-3.5 bg-[#F27024] text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/10 text-[10px] uppercase tracking-widest disabled:opacity-50 active:scale-[0.98]"
                    >
                        {editingKey ? 'Lưu thay đổi' : 'Thêm Giảng viên'}
                    </button>
                    {editingKey && (
                        <button
                            type="button"
                            onClick={onCancelEdit}
                            className="px-8 py-3.5 bg-white text-slate-500 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all text-[10px] uppercase tracking-widest active:scale-[0.98]"
                        >
                            Hủy
                        </button>
                    )}
                </div>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-200">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200">
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[33%]">Họ và tên</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[22%]">Mã giảng viên</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[33%]">Mail FPT</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[12%] text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.entries(lecturers).map(([key, lec]) => (
                                <tr key={key} className="hover:bg-orange-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-semibold text-slate-700 truncate block">{(lec as any).name}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider border border-slate-200/50">
                                            {(lec as any).code}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-slate-500 font-medium font-mono truncate block">{(lec as any).email}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {confirmingDeleteKey === key ? (
                                            <div className="flex items-center justify-end gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                                                <button
                                                    onClick={() => onDeleteLecturer(key)}
                                                    className="px-3 py-1 bg-rose-500 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-rose-600 transition-colors"
                                                >
                                                    Xóa
                                                </button>
                                                <button
                                                    onClick={() => setConfirmingDeleteKey(null)}
                                                    className="px-3 py-1 bg-white text-slate-400 border border-slate-200 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-50 transition-colors"
                                                >
                                                    Hủy
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-1 transition-opacity">
                                                <button
                                                    onClick={() => onEditLecturer(key, lec)}
                                                    className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Chỉnh sửa"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => setConfirmingDeleteKey(key)}
                                                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                    title="Xóa"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {Object.keys(lecturers).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-20 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-2xl shadow-inner">👨‍🏫</div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] max-w-xs leading-relaxed">
                                                Chưa có danh sách giảng viên.<br/>Hãy nhập từ Excel hoặc thêm thủ công.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
