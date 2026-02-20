import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import { configService, SemesterConfig } from '../services/configService';
import { database } from '../config/firebase';
import { SUPER_ADMIN_EMAIL, isSuperAdmin, isAdmin } from '../config/admin';
import { ref, set, push, onValue, remove } from 'firebase/database';
import { readSheet, invalidateAdminCache } from '../services/appsScriptService';
import Layout from '../components/Layout';
import { MappingTool } from '../components/MappingTool';
import { ColumnMapping } from '../types';
import { generateHeaderOptions } from '../utils/headerUtils';

export const AdminPage: React.FC = () => {
    const { user, logout } = useFirebase();
    const navigate = useNavigate();
    const [semesters, setSemesters] = useState<Record<string, SemesterConfig>>({});
    const [adminWhitelist, setAdminWhitelist] = useState<Record<string, string>>({});
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Inline Confirmation state
    const [confirmingDeleteSemesterId, setConfirmingDeleteSemesterId] = useState<string | null>(null);
    const [confirmingDeleteAdminKey, setConfirmingDeleteAdminKey] = useState<string | null>(null);

    const [newSemester, setNewSemester] = useState({
        semester: '',
        sheetUrl: '',
        startRow: '1',
        columns: '',
        dateFormat: 'dd/MM/yyyy' as import('../types').DateFormat,
        sheetType: 'council' as 'review' | 'council',
        tabName: '',
        mapping: {} as ColumnMapping
    });

    const [sheetHeaders, setSheetHeaders] = useState<{ label: string; value: number }[]>([]);

    // Edit mode state
    const [editMode, setEditMode] = useState<string | null>(null);

    const sortedSemesters = useMemo(() => {
        return (Object.values(semesters) as SemesterConfig[]).sort((a, b) => {
            // Sort by createdAt descending
            const timeA = a.createdAt || 0;
            const timeB = b.createdAt || 0;
            if (timeA !== timeB) return timeB - timeA;
            
            // Fallback to name/id sorting
            return b.semester.localeCompare(a.semester);
        });
    }, [semesters]);

    useEffect(() => {
        fetchConfigs();
        fetchAdminWhitelist();
    }, []);

    const fetchConfigs = async () => {
        try {
            setLoading(true);
            const configs = await configService.fetchConfigs();
            setSemesters(configs);
        } catch (err) {
            setToastMessage('❌ Không thể tải cấu hình từ Firebase');
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    const fetchAdminWhitelist = () => {
        const whitelistRef = ref(database, 'admin_whitelist');
        onValue(whitelistRef, (snapshot) => {
            const data = snapshot.val();
            setAdminWhitelist(data || {});
        });
    };

    const handleCreateSemester = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSemester.semester || !newSemester.sheetUrl || !newSemester.columns) {
            setToastMessage('❌ Vui lòng điền đầy đủ thông tin');
            setTimeout(() => setToastMessage(null), 5000);
            return;
        }

        try {
            setLoading(true);
            const semesterId = editMode || newSemester.semester.replace(/\s+/g, '_');
            const configRef = ref(database, `configs/${semesterId}`);

            const existingSemester = editMode ? semesters[editMode] : null;
            await set(configRef, {
                id: semesterId,
                semester: newSemester.semester,
                sheetUrl: newSemester.sheetUrl,
                startRow: newSemester.startRow,
                columns: newSemester.columns,
                dateFormat: newSemester.dateFormat,
                sheetType: newSemester.sheetType,
                tabName: newSemester.tabName,
                mapping: newSemester.mapping || {},
                createdAt: existingSemester?.createdAt || Date.now()
            });

            setToastMessage(editMode ? '✅ Cập nhật học kỳ thành công!' : '✅ Tạo học kỳ thành công!');
            setTimeout(() => setToastMessage(null), 5000);
            setNewSemester({ 
                semester: '', 
                sheetUrl: '', 
                startRow: '1', 
                columns: '', 
                dateFormat: 'dd/MM/yyyy', 
                sheetType: 'council',
                tabName: '',
                mapping: {}
            });
            setSheetHeaders([]);
            setEditMode(null);
            fetchConfigs();
            setTimeout(() => setToastMessage(null), 5000);
        } catch (err: any) {
            setToastMessage(`❌ Lỗi khi ${editMode ? 'cập nhật' : 'tạo'} học kỳ: ${err.message}`);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSemester = async (semesterId: string) => {
        try {
            setLoading(true);
            const configRef = ref(database, `configs/${semesterId}`);
            await set(configRef, null);
            setToastMessage('✅ Đã xóa học kỳ');
            fetchConfigs();
            setTimeout(() => setToastMessage(null), 5000);
        } catch (err: any) {
            setToastMessage(`❌ Lỗi khi xóa: ${err.message}`);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setLoading(false);
            setConfirmingDeleteSemesterId(null);
        }
    };

    const handleEditSemester = async (semester: SemesterConfig) => {
        setNewSemester({
            semester: semester.semester,
            sheetUrl: semester.sheetUrl,
            startRow: semester.startRow,
            columns: semester.columns,
            dateFormat: semester.dateFormat || 'dd/MM/yyyy',
            sheetType: semester.sheetType || 'council',
            tabName: semester.tabName || '',
            mapping: semester.mapping || {}
        });
        setEditMode(semester.id);
        setSheetHeaders([]);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Auto-fetch headers if URL is present to show Mapping Tool immediately
        if (semester.sheetUrl) {
            try {
                const startRowNum = parseInt(semester.startRow || '1');
                const response = await readSheet(semester.sheetUrl, startRowNum);
                if (response?.data && response.data.length > 0) {
                    const headers = response.data[0];
                    const headerOptions = generateHeaderOptions(
                        headers,
                        semester.sheetType === 'review',
                        true, // Admin is always true here
                        semester.mapping
                    );
                    setSheetHeaders(headerOptions);
                }
            } catch (err) {
                console.error('Failed to auto-fetch headers on edit:', err);
            }
        }
    };

    const handleAutoFetchColumns = async () => {
        if (!newSemester.sheetUrl) {
            setToastMessage('❌ Vui lòng nhập URL Sheet trước');
            setTimeout(() => setToastMessage(null), 5000);
            return;
        }
        try {
            setLoading(true);
            const startRowNum = parseInt(newSemester.startRow);
            const response = await readSheet(newSemester.sheetUrl, startRowNum);
            if (!response?.data || response.data.length === 0) {
                setToastMessage('❌ Không thể đọc dữ liệu từ Sheet.');
                setTimeout(() => setToastMessage(null), 5000);
                return;
            }
            const headers = response.data[0];
            const columnNames = headers.filter(h => h && String(h).trim()).map(h => String(h).trim()).join(', ');
            
            // Populate headers for Mapping Tool
            const headerOptions = generateHeaderOptions(
                headers,
                newSemester.sheetType === 'review',
                true,
                newSemester.mapping
            );
            setSheetHeaders(headerOptions);

            setNewSemester({ ...newSemester, columns: columnNames });
            setToastMessage(`✅ Đã tải ${headers.filter(h => h && String(h).trim()).length} cột tự động! Hãy kiểm tra ánh xạ bên dưới.`);
            setTimeout(() => setToastMessage(null), 5000);
        } catch (err: any) {
            setToastMessage(`❌ Lỗi khi tải cột: ${err.message}`);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminEmail) return;

        const cleanEmail = newAdminEmail.trim().toLowerCase();

        // 1. Check if matches Super Admin
        if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
            setToastMessage('❌ Email này là Super Admin, không cần thêm vào danh sách.');
            setTimeout(() => setToastMessage(null), 5000);
            return;
        }

        // 2. Check if already exists in dynamic whitelist
        const isDuplicate = Object.values(adminWhitelist).some(
            (email: any) => String(email).toLowerCase() === cleanEmail
        );

        if (isDuplicate) {
            setToastMessage('❌ Email này đã có trong danh sách Admin.');
            setTimeout(() => setToastMessage(null), 5000);
            return;
        }

        try {
            const whitelistRef = ref(database, 'admin_whitelist');
            const newAdminRef = push(whitelistRef);
            await set(newAdminRef, cleanEmail);
            await invalidateAdminCache(); // 🔄 Clear 6h cache on server
            setNewAdminEmail('');
            setToastMessage('✅ Đã thêm admin mới');
            setTimeout(() => setToastMessage(null), 5000);
        } catch (err: any) {
            setToastMessage('❌ Lỗi khi thêm admin: ' + err.message);
            setTimeout(() => setToastMessage(null), 5000);
        }
    };

    const handleDeleteAdmin = async (key: string) => {
        try {
            const adminRef = ref(database, `admin_whitelist/${key}`);
            await remove(adminRef);
            await invalidateAdminCache(); // 🔄 Clear 6h cache on server
            setToastMessage('✅ Đã xóa admin');
            setTimeout(() => setToastMessage(null), 5000);
        } catch (err: any) {
            setToastMessage('❌ Lỗi khi xóa admin: ' + err.message);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setConfirmingDeleteAdminKey(null);
        }
    };

    const userProfile = useMemo(() => ({
        name: user?.displayName || 'Admin',
        email: user?.email || '',
        image: user?.photoURL || `https://ui-avatars.com/api/?name=${user?.displayName || 'A'}&background=random`
    }), [user]);

    if (!user) return null;

    return (
        <Layout user={userProfile} userId={user.uid} onLogout={logout}>
            <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
                {/* Admin Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => navigate('/')}
                            className="p-2 bg-white hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-[#F27024] shadow-sm border border-slate-100"
                            title="Quay lại Dashboard"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 leading-none">Admin Dashboard</h2>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cấu hình hệ thống</p>
                        </div>
                    </div>
                </div>

                {/* Global Status Banner (Only for persistent errors) */}
                {loading && (
                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-800 text-sm font-bold flex items-center gap-3 animate-pulse">
                        <svg className="w-5 h-5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Đang truy xuất dữ liệu hệ thống...
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Column 1: Config Form */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-6">
                        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <h2 className="text-[10px] font-bold text-[#F27024] mb-4 flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-4 h-4 bg-[#F27024] text-white rounded-md flex items-center justify-center text-[10px] shadow-sm font-bold">A</span>
                                {editMode ? 'Sửa học kỳ' : 'Tạo học kỳ mới'}
                            </h2>

                            <form onSubmit={handleCreateSemester} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Tên học kỳ</label>
                                    <input
                                        type="text"
                                        placeholder="Ví dụ: Spring 2026"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newSemester.semester}
                                        onChange={(e) => setNewSemester({ ...newSemester, semester: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Google Sheet URL</label>
                                    <input
                                        type="url"
                                        placeholder="https://docs.google.com/spreadsheets/d/..."
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newSemester.sheetUrl}
                                        onChange={(e) => setNewSemester({ ...newSemester, sheetUrl: e.target.value })}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Dòng bắt đầu</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newSemester.startRow}
                                        onChange={(e) => setNewSemester({ ...newSemester, startRow: e.target.value })}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Định dạng Ngày mẫu</label>
                                    <select
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newSemester.dateFormat}
                                        onChange={(e) => setNewSemester({ ...newSemester, dateFormat: e.target.value as any })}
                                    >
                                        <option value="dd/MM/yyyy">VN (27/01/2026)</option>
                                        <option value="MM/dd/yyyy">US (01/27/2026)</option>
                                        <option value="yyyy-MM-dd">ISO (2026-01-27)</option>
                                        <option value="dd-MM-yyyy">VN2 (27-01-2026)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Loại hình chấm thi</label>
                                    <select
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newSemester.sheetType}
                                        onChange={(e) => setNewSemester({ ...newSemester, sheetType: e.target.value as any })}
                                    >
                                        <option value="council">Chế độ chấm hội đồng</option>
                                        <option value="review">Chế độ chấm review</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Tên Tab (Sheet Name)</label>
                                    <input
                                        type="text"
                                        placeholder="Ví dụ: Sheet1"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newSemester.tabName}
                                        onChange={(e) => setNewSemester({ ...newSemester, tabName: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <div className="flex items-center justify-between mb-1.5 ml-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Danh sách cột</label>
                                        <button
                                            type="button"
                                            onClick={handleAutoFetchColumns}
                                            disabled={loading || !newSemester.sheetUrl}
                                            className="text-[10px] font-bold text-[#F27024] hover:underline flex items-center gap-1 uppercase tracking-widest"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            Tải tự động
                                        </button>
                                    </div>
                                    <textarea
                                        placeholder="Mã đề tài, Tên đề tài, GVHD, Ngày, Giờ, Địa điểm..."
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white resize-none"
                                        rows={3}
                                        value={newSemester.columns}
                                        onChange={(e) => setNewSemester({ ...newSemester, columns: e.target.value })}
                                        required
                                    />
                                </div>

                                {sheetHeaders.length > 0 ? (
                                    <div className="md:col-span-2 p-5 bg-orange-50/50 rounded-[2rem] border border-orange-100 mb-4 shadow-sm shadow-orange-50 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <MappingTool 
                                            headers={sheetHeaders}
                                            headerRowOptions={[]}
                                            headerRowIndex={0}
                                            onHeaderRowChange={() => {}}
                                            columnMap={newSemester.mapping}
                                            setColumnMap={(map) => setNewSemester({ ...newSemester, mapping: map })}
                                        />
                                        <p className="text-[9px] text-[#F27024] font-bold mt-3 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-[#F27024] rounded-full animate-pulse" />
                                            Admin: Thiết lập các cột này để Giảng viên không cần phải làm nữa.
                                        </p>
                                    </div>
                                ) : (
                                    newSemester.sheetUrl && (
                                        <div className="md:col-span-2 p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 opacity-80">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhấn "Tải tự động" để cấu hình cột</p>
                                        </div>
                                    )
                                )}

                                <div className="md:col-span-2 flex gap-3 pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 py-4 bg-[#F27024] text-white rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none uppercase tracking-widest text-xs"
                                    >
                                        {loading ? 'Đang xử lý...' : (editMode ? 'Cập nhật học kỳ' : 'Lưu học kỳ mới')}
                                    </button>
                                    {editMode && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditMode(null);
                                                setNewSemester({ semester: '', sheetUrl: '', startRow: '1', columns: '', dateFormat: 'dd/MM/yyyy', sheetType: 'council' });
                                            }}
                                            className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                                        >
                                            Hủy
                                        </button>
                                    )}
                                </div>
                            </form>
                        </section>
                    </div>

                    {/* Column 2: Whitelist & List */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-6">
                        {/* Whitelist (Super Admin Only) */}
                        {isSuperAdmin(user.email) && (
                            <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                <h2 className="text-[10px] font-bold text-[#F27024] mb-4 flex items-center gap-2 uppercase tracking-[0.2em]">
                                    <span className="w-4 h-4 bg-[#F27024] text-white rounded-md flex items-center justify-center text-[10px] shadow-sm font-bold">B</span>
                                    Quản lý Admin
                                </h2>
                                <form onSubmit={handleAddAdmin} className="flex gap-2 mb-4">
                                    <input
                                        type="email"
                                        placeholder="Email admin mới..."
                                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#F27024] outline-none text-sm font-bold transition-all focus:bg-white"
                                        value={newAdminEmail}
                                        onChange={(e) => setNewAdminEmail(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="submit"
                                        className="px-4 py-2.5 bg-[#F27024] text-white rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-md shadow-orange-50 text-[10px] uppercase tracking-widest"
                                    >
                                        Thêm
                                    </button>
                                </form>
                                <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
                                    {Object.entries(adminWhitelist).map(([key, email]) => (
                                        <div key={key} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100 group">
                                            <span className="text-xs font-bold text-slate-700">{email}</span>
                                            {confirmingDeleteAdminKey === key ? (
                                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-300">
                                                    <button
                                                        onClick={() => handleDeleteAdmin(key)}
                                                        className="px-2.5 py-1 bg-rose-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-rose-600 transition-all active:scale-95 shadow-sm"
                                                    >
                                                        Xóa
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmingDeleteAdminKey(null)}
                                                        className="px-2.5 py-1 bg-white text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:text-slate-600 transition-all"
                                                    >
                                                        Hủy
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmingDeleteAdminKey(key)}
                                                    className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {Object.keys(adminWhitelist).length === 0 && (
                                        <div className="text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                            <p className="text-[10px] font-bold text-slate-400 m-0 uppercase tracking-widest">Chưa có admin phụ</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* List Semesters */}
                        <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col min-h-0">
                            <h2 className="text-[10px] font-bold text-[#F27024] mb-4 flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-4 h-4 bg-[#F27024] text-white rounded-md flex items-center justify-center text-[10px] shadow-sm font-bold">C</span>
                                Danh sách học kỳ ({Object.keys(semesters).length})
                            </h2>
                            <div className="space-y-3 overflow-y-auto max-h-[400px] scrollbar-thin pr-1 pb-4">
                                {sortedSemesters.map((sem) => (
                                    <div key={sem.id} className="p-4 border border-slate-100 bg-slate-50/30 rounded-2xl hover:border-orange-200 transition-all group">
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#F27024] transition-colors">{sem.semester}</h3>
                                                {confirmingDeleteSemesterId === sem.id ? (
                                                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-300">
                                                        <button
                                                            onClick={() => handleDeleteSemester(sem.id)}
                                                            className="px-3 py-1 bg-rose-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-rose-600 transition-all active:scale-95 shadow-sm"
                                                        >
                                                            Xác nhận xóa
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmingDeleteSemesterId(null)}
                                                            className="px-3 py-1 bg-white text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:text-slate-600 transition-all"
                                                        >
                                                            Hủy
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleEditSemester(sem)}
                                                            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmingDeleteSemesterId(sem.id)}
                                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                )}
                                        </div>
                                        <div className="space-y-1 mt-1 border-t border-slate-100 pt-3">
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                                <span className="text-[#F27024]">➔</span> Dòng bắt đầu: {sem.startRow}
                                            </div>
                                            <div className="flex items-start gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                                                <span className="text-blue-500">➔</span> Cột: <span className="normal-case text-slate-600 line-clamp-2">{sem.columns}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">
                                                <span className="text-emerald-500">➔</span> Tab: <span className="normal-case text-slate-600 font-bold">{sem.tabName || 'Sheet mặc định'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">
                                                <span className="text-emerald-500">➔</span> Sheet ID: <span className="normal-case text-slate-400 italic">...{sem.sheetUrl.slice(-15)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>


            {/* Global Toast */}
            {toastMessage && (
                <div className={`fixed bottom-6 right-6 ${toastMessage.startsWith('❌') ? 'bg-rose-950 border-rose-800' : 'bg-slate-900 border-slate-800'} border text-white px-5 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-500 flex items-center gap-3 z-[1000]`}>
                    <div className={`w-2 h-2 ${toastMessage.startsWith('❌') ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'} rounded-full animate-pulse`} />
                    <span className="text-xs font-bold tracking-tight">{toastMessage}</span>
                </div>
            )}
        </Layout>
    );
};
