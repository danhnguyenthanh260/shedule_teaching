import React, { useState, useEffect } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import { configService, SemesterConfig } from '../services/configService';
import { database } from '../config/firebase';
import { ref, set, push } from 'firebase/database';
import { readSheet } from '../services/appsScriptService';

export const AdminPage: React.FC = () => {
    const { user, logout } = useFirebase();
    const [semesters, setSemesters] = useState<Record<string, SemesterConfig>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state for new semester
    const [newSemester, setNewSemester] = useState({
        semester: '',
        sheetUrl: '',
        startRow: '1',
        columns: ''
    });

    // Edit mode state
    const [editMode, setEditMode] = useState<string | null>(null); // semesterId being edited

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            setLoading(true);
            const configs = await configService.fetchConfigs();
            setSemesters(configs);
            setError(null);
        } catch (err) {
            setError('❌ Không thể tải cấu hình từ Firebase');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSemester = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newSemester.semester || !newSemester.sheetUrl || !newSemester.columns) {
            setError('❌ Vui lòng điền đầy đủ thông tin');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const semesterId = editMode || newSemester.semester.replace(/\s+/g, '_');
            const configRef = ref(database, `configs/${semesterId}`);

            await set(configRef, {
                id: semesterId,
                semester: newSemester.semester,
                sheetUrl: newSemester.sheetUrl,
                startRow: newSemester.startRow,
                columns: newSemester.columns
            });

            setSuccess(editMode ? '✅ Cập nhật học kỳ thành công!' : '✅ Tạo học kỳ thành công!');
            setNewSemester({ semester: '', sheetUrl: '', startRow: '1', columns: '' });
            setEditMode(null);
            fetchConfigs();

            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(`❌ Lỗi khi ${editMode ? 'cập nhật' : 'tạo'} học kỳ: ${err.message}`);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSemester = async (semesterId: string) => {
        if (!confirm(`Xác nhận xóa học kỳ "${semesterId}"?`)) return;

        try {
            setLoading(true);
            const configRef = ref(database, `configs/${semesterId}`);
            await set(configRef, null);

            setSuccess('✅ Đã xóa học kỳ');
            fetchConfigs();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(`❌ Lỗi khi xóa: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleEditSemester = (semester: SemesterConfig) => {
        setNewSemester({
            semester: semester.semester,
            sheetUrl: semester.sheetUrl,
            startRow: semester.startRow,
            columns: semester.columns
        });
        setEditMode(semester.id);
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setNewSemester({ semester: '', sheetUrl: '', startRow: '1', columns: '' });
        setEditMode(null);
    };

    const handleAutoFetchColumns = async () => {
        if (!newSemester.sheetUrl) {
            setError('❌ Vui lòng nhập URL Sheet trước');
            return;
        }

        if (!newSemester.startRow || parseInt(newSemester.startRow) < 1) {
            setError('❌ Vui lòng chọn dòng bắt đầu hợp lệ');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const startRowNum = parseInt(newSemester.startRow);
            const rows = await readSheet(newSemester.sheetUrl, startRowNum);

            if (!rows || rows.length === 0) {
                setError('❌ Không thể đọc dữ liệu từ Sheet. Vui lòng kiểm tra URL và quyền truy cập.');
                return;
            }

            // Get the first row (header row)
            const headers = rows[0];

            // Extract Sheet ID from URL
            const sheetIdMatch = newSemester.sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            const currentSheetId = sheetIdMatch ? sheetIdMatch[1] : '';

            // "Data Mẫu" Sheet ID - only slice columns for this specific sheet
            const DATA_MAU_SHEET_ID = '1nshAfx6vf11FUDOTOTiLu0D-zulNfM5uKoCI0A106Sk';

            // ✅ SMART FILTERING: Only slice columns J-AM for "Data Mẫu" sheet
            let relevantHeaders = headers;
            if (currentSheetId === DATA_MAU_SHEET_ID) {
                // Skip columns A-I (index 0-8) which contain project info
                relevantHeaders = headers.slice(9, 39); // J to AM (columns 9-38)
            }

            // Filter out empty headers and join with comma
            const columnNames = relevantHeaders
                .filter(h => h && String(h).trim())
                .map(h => String(h).trim())
                .join(', ');

            if (!columnNames) {
                setError('❌ Không tìm thấy tiêu đề cột trong dòng đã chọn');
                return;
            }

            setNewSemester({ ...newSemester, columns: columnNames });
            setSuccess(`✅ Đã tải ${relevantHeaders.filter(h => h && String(h).trim()).length} cột tự động!`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(`❌ Lỗi khi tải cột: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-800">Admin Dashboard</h1>
                            <p className="text-xs text-slate-500 font-semibold">Quản lý cấu hình hệ thống</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-xs font-bold text-slate-600">{user?.displayName}</p>
                            <p className="text-[10px] text-slate-400">{user?.email}</p>
                        </div>
                        <button
                            onClick={logout}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all"
                        >
                            Đăng xuất
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Alerts */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-red-800">{error}</p>
                        </div>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {success && (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-bold text-green-800">{success}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Create Semester Form */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={editMode ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M12 4v16m8-8H4"} />
                            </svg>
                            {editMode ? 'Sửa học kỳ' : 'Tạo học kỳ mới'}
                        </h2>

                        <form onSubmit={handleCreateSemester} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tên học kỳ</label>
                                <input
                                    type="text"
                                    placeholder="Ví dụ: Spring 2026"
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                                    value={newSemester.semester}
                                    onChange={(e) => setNewSemester({ ...newSemester, semester: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Google Sheet URL</label>
                                <input
                                    type="url"
                                    placeholder="https://docs.google.com/spreadsheets/d/..."
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                                    value={newSemester.sheetUrl}
                                    onChange={(e) => setNewSemester({ ...newSemester, sheetUrl: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Dòng bắt đầu (Header Row)</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                                    value={newSemester.startRow}
                                    onChange={(e) => setNewSemester({ ...newSemester, startRow: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-slate-600">Danh sách cột (phân cách bằng dấu phẩy)</label>
                                    <button
                                        type="button"
                                        onClick={handleAutoFetchColumns}
                                        disabled={loading || !newSemester.sheetUrl || !newSemester.startRow}
                                        className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Tải tự động
                                    </button>
                                </div>
                                <textarea
                                    placeholder="Ví dụ: Mã đề tài, Tên đề tài, GVHD, Ngày, Giờ, Địa điểm"
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm resize-none"
                                    rows={3}
                                    value={newSemester.columns}
                                    onChange={(e) => setNewSemester({ ...newSemester, columns: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (editMode ? 'Đang cập nhật...' : 'Đang tạo...') : (editMode ? 'Cập nhật học kỳ' : 'Tạo học kỳ')}
                                </button>
                                {editMode && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-all"
                                    >
                                        Hủy
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Existing Semesters List */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Học kỳ hiện có ({Object.keys(semesters).length})
                        </h2>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {(Object.values(semesters) as SemesterConfig[]).map((sem) => (
                                <div key={sem.id} className="p-4 border border-slate-200 rounded-xl hover:border-orange-300 transition-all">
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="font-bold text-slate-800">{sem.semester}</h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditSemester(sem)}
                                                className="text-blue-400 hover:text-blue-600 transition-colors"
                                                title="Sửa học kỳ"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSemester(sem.id)}
                                                className="text-red-400 hover:text-red-600 transition-colors"
                                                title="Xóa học kỳ"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1 text-xs text-slate-600">
                                        <p><span className="font-semibold">Dòng:</span> {sem.startRow}</p>
                                        <p><span className="font-semibold">Cột:</span> {sem.columns}</p>
                                        <p className="truncate"><span className="font-semibold">Sheet:</span> {sem.sheetUrl}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
