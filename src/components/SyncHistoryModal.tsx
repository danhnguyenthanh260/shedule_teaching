import React, { useEffect, useState } from 'react';
import { firestoreSyncHistoryService, SyncHistoryRecord } from '../services/firestoreSyncHistoryService';
import { format } from 'date-fns';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    refreshTrigger?: number; // Trigger để force refresh khi có sync mới
}

const SyncHistoryModal: React.FC<Props> = ({ isOpen, onClose, userId, refreshTrigger }) => {
    const [history, setHistory] = useState<SyncHistoryRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load history khi modal mở hoặc khi có refreshTrigger thay đổi
    useEffect(() => {
        if (isOpen && userId) {
            loadHistory();
        }
    }, [isOpen, userId, refreshTrigger]);

    const loadHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const records = await firestoreSyncHistoryService.getUserSyncHistory(userId);
            setHistory(records);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-orange-50 to-transparent">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Lịch sử Import</h2>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            Xem tất cả lần đồng bộ lên Google Calendar của bạn
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadHistory}
                            disabled={loading}
                            className="p-2 hover:bg-orange-50 text-[#F27024] rounded-lg transition-all title='Tải lại lịch sử'"
                        >
                            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors font-bold text-slate-400"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-12 h-12 border-4 border-orange-100 border-t-[#F27024] rounded-full animate-spin"></div>
                            <p className="text-sm text-slate-500 mt-4 font-medium">Đang tải lịch sử...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg text-rose-700 text-sm">
                            {error}
                        </div>
                    )}

                    {!loading && !error && history.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-slate-500 font-semibold">Chưa có lịch sử import nào</p>
                            <p className="text-xs text-slate-400 mt-2">Đồng bộ lịch lần đầu để xem lịch sử tại đây</p>
                        </div>
                    )}

                    {!loading && !error && history.length > 0 && (
                        <div className="space-y-4">
                            {history.map((record) => {
                                const isFullSuccess = record.failedCount === 0;
                                return (
                                    <div
                                        key={record.id}
                                        className="group border border-slate-200 rounded-2xl p-5 hover:border-[#F27024]/30 hover:shadow-xl hover:shadow-orange-50 transition-all duration-300 bg-white relative overflow-hidden"
                                    >
                                        {/* Status Accent Line */}
                                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isFullSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1 space-y-3">
                                                {/* Top Row: Tab Name & Status */}
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-orange-50 rounded-xl">
                                                        <svg className="w-5 h-5 text-[#F27024]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2a2 2 0 00-2-2H5a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v8m-6 0h6" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-bold text-slate-900 leading-tight">Tab: {record.tabName}</h3>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            {isFullSuccess ? (
                                                                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    Đồng bộ lên Google Calendar thành công
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    Cần kiểm tra ({record.failedCount} lỗi)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Stats Row */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-slate-600 flex items-center gap-2 border border-slate-200 shadow-sm">
                                                        <span className="text-[10px] font-bold uppercase opacity-60">Tổng cộng</span>
                                                        <span className="text-xs font-black">{record.rowCount}</span>
                                                    </div>
                                                    
                                                    <div className={`px-3 py-1.5 bg-emerald-50 rounded-lg text-emerald-700 flex items-center gap-2 border border-emerald-100 shadow-sm ${record.createdCount === 0 ? 'opacity-40' : 'opacity-100'}`}>
                                                        <span className="text-[10px] font-bold uppercase opacity-60">Thêm mới</span>
                                                        <span className="text-xs font-black">{record.createdCount}</span>
                                                    </div>

                                                    <div className={`px-3 py-1.5 bg-blue-50 rounded-lg text-blue-700 flex items-center gap-2 border border-blue-100 shadow-sm ${record.updatedCount === 0 ? 'opacity-40' : 'opacity-100'}`}>
                                                        <span className="text-[10px] font-bold uppercase opacity-60">Cập nhật</span>
                                                        <span className="text-xs font-black">{record.updatedCount}</span>
                                                    </div>

                                                    {record.failedCount > 0 && (
                                                        <div className="px-3 py-1.5 bg-rose-50 rounded-lg text-rose-700 flex items-center gap-2 border border-rose-100 shadow-sm animate-pulse">
                                                            <span className="text-[10px] font-bold uppercase opacity-60">Thất bại</span>
                                                            <span className="text-xs font-black">{record.failedCount}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Time Column */}
                                            <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center px-4 py-2 bg-slate-50/50 md:bg-transparent rounded-xl md:rounded-none">
                                                <div className="text-sm font-black text-slate-800 tracking-tight">
                                                    {format(record.syncedAt, 'dd/MM/yyyy')}
                                                </div>
                                                <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                                                    {format(record.syncedAt, 'HH:mm:ss')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-medium">
                        {history.length > 0 ? `Hiển thị ${history.length} lần import gần nhất` : ''}
                    </p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors text-sm"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SyncHistoryModal;
