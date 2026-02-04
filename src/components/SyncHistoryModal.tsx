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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-orange-50 to-transparent">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">📜 Lịch sử Import</h2>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            Xem tất cả lần đồng bộ lịch của bạn
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
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
                            ❌ {error}
                        </div>
                    )}

                    {!loading && !error && history.length === 0 && (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📭</div>
                            <p className="text-slate-500 font-semibold">Chưa có lịch sử import nào</p>
                            <p className="text-xs text-slate-400 mt-2">Đồng bộ lịch lần đầu để xem lịch sử tại đây</p>
                        </div>
                    )}

                    {!loading && !error && history.length > 0 && (
                        <div className="space-y-3">
                            {history.map((record) => (
                                <div
                                    key={record.id}
                                    className="border border-slate-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-md transition-all duration-200 bg-white"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-bold text-slate-900">{record.tabName}</h3>
                                                <span className="px-2 py-1 bg-orange-100 text-[#F27024] text-xs font-bold rounded-full">
                                                    {record.rowCount} sự kiện
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 font-mono mb-3">
                                                Sheet ID: {record.sheetId.substring(0, 20)}...
                                            </p>
                                            <div className="flex items-center gap-4 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-semibold text-emerald-600">✓ Thêm mới:</span>
                                                    <span className="font-bold text-emerald-700">{record.createdCount}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="font-semibold text-blue-600">↻ Cập nhật:</span>
                                                    <span className="font-bold text-blue-700">{record.updatedCount}</span>
                                                </div>
                                                {record.failedCount > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold text-rose-600">✗ Lỗi:</span>
                                                        <span className="font-bold text-rose-700">{record.failedCount}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-500 font-semibold">
                                                {format(record.syncedAt, 'dd/MM/yyyy')}
                                            </div>
                                            <div className="text-xs text-slate-400 font-medium">
                                                {format(record.syncedAt, 'HH:mm:ss')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
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
