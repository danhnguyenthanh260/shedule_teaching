import React from 'react';
import { MappingTool } from '../MappingTool';
import { SemesterConfig } from '../../services/configService';
import { ColumnMapping, DateFormat } from '../../types';

interface SemesterFormProps {
    formData: {
        semester: string;
        sheetUrl: string;
        startRow: string;
        columns: string;
        dateFormat: DateFormat;
        sheetType: 'review' | 'council';
        tabName: string;
        mapping: ColumnMapping;
        notifEnabled?: boolean;
    };
    onFormChange: (data: any) => void;
    onSubmit: (e: React.FormEvent) => void;
    onAutoFetch: () => void;
    onTabRefresh: () => void;
    isFetchingTabs: boolean;
    availableTabs: string[];
    sheetHeaders: { label: string; value: number }[];
    loading: boolean;
    editMode: string | null;
    onCancelEdit: () => void;
}

export const SemesterForm: React.FC<SemesterFormProps> = ({
    formData,
    onFormChange,
    onSubmit,
    onAutoFetch,
    onTabRefresh,
    isFetchingTabs,
    availableTabs,
    sheetHeaders,
    loading,
    editMode,
    onCancelEdit
}) => {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-[11px] font-bold text-[#F27024] mb-8 flex items-center gap-3 uppercase tracking-[0.2em] font-heading">
                <span className="w-8 h-8 bg-orange-50 text-[#F27024] rounded-lg flex items-center justify-center text-xs font-bold border border-orange-100/50">
                    {editMode ? '📝' : '✨'}
                </span>
                {editMode ? 'Cập nhật học kỳ' : 'Thiết lập học kỳ'}
            </h2>

            <form onSubmit={onSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-6">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Tên học kỳ</label>
                            <input
                                type="text"
                                placeholder="Ví dụ: Spring 2026"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all placeholder:text-slate-300"
                                value={formData.semester}
                                onChange={(e) => onFormChange({ semester: e.target.value })}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Google Sheet URL</label>
                            <input
                                type="url"
                                placeholder="https://docs.google.com/spreadsheets/..."
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all placeholder:text-slate-300"
                                value={formData.sheetUrl}
                                onChange={(e) => onFormChange({ sheetUrl: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Dòng bắt đầu</label>
                            <input
                                type="number"
                                min="1"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all"
                                value={formData.startRow}
                                onChange={(e) => onFormChange({ startRow: e.target.value })}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Định dạng Ngày</label>
                            <div className="relative">
                                <select
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-[11px] font-semibold transition-all appearance-none cursor-pointer"
                                    value={formData.dateFormat}
                                    onChange={(e) => onFormChange({ dateFormat: e.target.value as DateFormat })}
                                >
                                    <option value="dd/MM/yyyy">VN (27/01)</option>
                                    <option value="MM/dd/yyyy">US (01/27)</option>
                                    <option value="yyyy-MM-dd">ISO</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Loại hình chấm thi</label>
                            <div className="relative">
                                <select
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-[11px] font-semibold transition-all appearance-none cursor-pointer"
                                    value={formData.sheetType}
                                    onChange={(e) => onFormChange({ sheetType: e.target.value as 'review' | 'council' })}
                                >
                                    <option value="council">Chấm hội đồng</option>
                                    <option value="review">Chấm review</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center justify-between">
                                <span>Tên Tab (Sheet)</span>
                                <button 
                                    type="button"
                                    onClick={onTabRefresh}
                                    className="hover:text-[#F27024] transition-colors p-1"
                                    title="Tải lại danh sách Tab"
                                >
                                    <svg className={`w-3 h-3 ${isFetchingTabs ? 'animate-spin text-orange-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                            </label>
                            
                            {availableTabs.length > 0 ? (
                                <div className="relative">
                                    <select
                                        className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl focus:ring-4 focus:ring-orange-500/10 focus:border-[#F27024] outline-none text-xs font-semibold transition-all shadow-sm appearance-none cursor-pointer"
                                        value={formData.tabName}
                                        onChange={(e) => onFormChange({ tabName: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Chọn Sheet --</option>
                                        {availableTabs.map(tab => (
                                            <option key={tab} value={tab}>{tab}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-orange-400">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    placeholder="Ví dụ: Sheet1"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all placeholder:text-slate-300"
                                    value={formData.tabName}
                                    onChange={(e) => onFormChange({ tabName: e.target.value })}
                                    required
                                />
                            )}
                        </div>
                    </div>

                    {formData.sheetType === 'council' && (
                        <div className="flex items-center justify-between p-4 bg-orange-50/30 rounded-xl border border-orange-100/50 shadow-sm transition-all hover:bg-orange-50/50">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${formData.notifEnabled ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-white text-slate-400 border border-slate-200'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-bold text-slate-800 font-heading">Thông báo mail tự động</p>
                                    <p className="text-[8px] font-medium text-slate-400">Gửi mail khi có thay đổi trên Sheet (Debounce 20s)</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={formData.notifEnabled}
                                    onChange={(e) => onFormChange({ notifEnabled: e.target.checked })}
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#F27024]"></div>
                            </label>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-2 ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Danh sách cột</label>
                            <button
                                type="button"
                                onClick={onAutoFetch}
                                disabled={loading || !formData.sheetUrl}
                                className="text-[9px] font-bold text-[#F27024] hover:text-orange-700 uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Tải tự động
                            </button>
                        </div>
                        <textarea
                            placeholder="Cấu hình các cột dữ liệu..."
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/5 focus:border-[#F27024] outline-none text-xs font-semibold transition-all placeholder:text-slate-300 resize-none min-h-[80px]"
                            value={formData.columns}
                            onChange={(e) => onFormChange({ columns: e.target.value })}
                            required
                        />
                    </div>

                    {sheetHeaders.length > 0 && (
                        <div className="p-6 bg-slate-50/50 rounded-xl border border-slate-200 animate-in fade-in zoom-in duration-300">
                            <MappingTool 
                                headers={sheetHeaders}
                                headerRowOptions={[]}
                                headerRowIndex={0}
                                onHeaderRowChange={() => {}}
                                columnMap={formData.mapping}
                                setColumnMap={(map) => onFormChange({ mapping: map })}
                                isCompact={true}
                            />
                        </div>
                    )}
                </div>

                <div className="flex gap-3 pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-3.5 bg-[#F27024] text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-md shadow-orange-500/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none uppercase tracking-widest text-[10px] active:scale-[0.98]"
                    >
                        {loading ? '...' : (editMode ? 'Cập nhật' : 'Lưu học kỳ')}
                    </button>
                    {editMode && (
                        <button
                            type="button"
                            onClick={onCancelEdit}
                            className="px-6 py-3.5 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200 transition-all uppercase tracking-widest text-[10px]"
                        >
                            Hủy
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};
