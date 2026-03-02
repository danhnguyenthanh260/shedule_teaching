import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import { configService, SemesterConfig } from '../services/configService';
import { database } from '../config/firebase';
import { SUPER_ADMIN_EMAIL, isSuperAdmin } from '../config/admin';
import { ref, set, push, onValue, remove, update } from 'firebase/database';
import * as XLSX from 'xlsx';
import { readSheet, invalidateAdminCache, getTabNames, setupNotifications, disableNotifications } from '../services/appsScriptService';
import { MappingTool } from '../components/MappingTool';
import { ColumnMapping } from '../types';
import { generateHeaderOptions } from '../utils/headerUtils';
import useDebounce from '../hooks/useDebounce';

// New Modular Components
import { AdminLayout } from '../components/admin/AdminLayout';
import { SemesterForm } from '../components/admin/SemesterForm';
import { SemesterList } from '../components/admin/SemesterList';
import { AdminWhitelistManager } from '../components/admin/AdminWhitelistManager';
import { LecturerWhitelistManager } from '../components/admin/LecturerWhitelistManager';

type AdminTab = 'semesters' | 'admins' | 'lecturers';

export const AdminPage: React.FC = () => {
    const { user, logout } = useFirebase();
    const navigate = useNavigate();
    const [semesters, setSemesters] = useState<Record<string, SemesterConfig>>({});
    const [adminWhitelist, setAdminWhitelist] = useState<Record<string, string>>({});
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [lecturerWhitelist, setLecturerWhitelist] = useState<Record<string, { name: string; code: string; email: string }>>({});
    const [newLecturer, setNewLecturer] = useState({ name: '', code: '', email: '' });
    const [editingLecturerKey, setEditingLecturerKey] = useState<string | null>(null);
    const [confirmingDeleteLecturerKey, setConfirmingDeleteLecturerKey] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const lecturerFileInputRef = React.useRef<HTMLInputElement>(null);

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
        mapping: {} as ColumnMapping,
        notifEnabled: false
    });

    const [sheetHeaders, setSheetHeaders] = useState<{ label: string; value: number }[]>([]);
    const [availableTabs, setAvailableTabs] = useState<string[]>([]);
    const [isFetchingTabs, setIsFetchingTabs] = useState(false);

    // Debounce URL to fetch tabs automatically
    const debouncedUrl = useDebounce(newSemester.sheetUrl, 1000);

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
        fetchLecturerWhitelist();
    }, []);

    // ✅ Effect to auto-fetch tabs when URL changes
    useEffect(() => {
        if (debouncedUrl && debouncedUrl.includes('spreadsheets')) {
            const fetchTabs = async () => {
                try {
                    setIsFetchingTabs(true);
                    const tabs = await getTabNames(debouncedUrl);
                    setAvailableTabs(tabs);
                    
                    // 🚀 Nếu chỉ có 1 sheet, tự động điền luôn
                    if (tabs.length === 1) {
                        setNewSemester(prev => ({ ...prev, tabName: tabs[0] }));
                    } else if (tabs.length > 1 && !newSemester.tabName) {
                        // Nếu có nhiều nhưng chưa chọn, để trống cho user chọn
                        setNewSemester(prev => ({ ...prev, tabName: '' }));
                    }
                } catch (err) {
                    console.error('Failed to fetch tabs:', err);
                } finally {
                    setIsFetchingTabs(false);
                }
            };
            fetchTabs();
        } else {
            setAvailableTabs([]);
        }
    }, [debouncedUrl, editMode]); // ✅ Thêm editMode để re-fetch khi mở form sửa

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
                createdAt: existingSemester?.createdAt || Date.now(),
                notifEnabled: newSemester.notifEnabled || false
            });

            setToastMessage(editMode ? '✅ Cập nhật học kỳ thành công!' : '✅ Tạo học kỳ thành công!');
            setTimeout(() => setToastMessage(null), 5000);
            
            // Clean up state
            setAvailableTabs([]);
            setSheetHeaders([]);
            setEditMode(null);
            
            setNewSemester({ 
                semester: '', 
                sheetUrl: '', 
                startRow: '1', 
                columns: '', 
                dateFormat: 'dd/MM/yyyy', 
                sheetType: 'council',
                tabName: '',
                mapping: {},
                notifEnabled: false
            });

            fetchConfigs();
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
            mapping: semester.mapping || {},
            notifEnabled: semester.notifEnabled || false
        });
        setEditMode(semester.id);
        setSheetHeaders([]);
        setAvailableTabs([]); // Reset tabs to trigger re-fetch
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Auto-fetch headers if URL is present to show Mapping Tool immediately
        if (semester.sheetUrl) {
            try {
                const startRowNum = parseInt(semester.startRow || '1');
                const response = await readSheet(semester.sheetUrl, startRowNum, semester.tabName);
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
            const response = await readSheet(newSemester.sheetUrl, startRowNum, newSemester.tabName);
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

            setSheetHeaders(headerOptions);

            // ✅ Cập nhật danh sách Tab và điền Tên Tab
            const allTabs = response.allTabs || [];
            if (allTabs.length > 0) {
                setAvailableTabs(allTabs);
            }
            
            const detectedTabName = response.tabName || '';
            setNewSemester(prev => {
                const finalTabName = prev.tabName || detectedTabName;
                console.log('Detected Tab:', detectedTabName, 'Final Tab Name:', finalTabName, 'All Tabs:', allTabs);
                return { 
                    ...prev, 
                    columns: columnNames,
                    tabName: finalTabName
                };
            });

            setToastMessage(`✅ Đã tải ${headers.filter(h => h && String(h).trim()).length} cột từ tab "${detectedTabName}"!`);
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

    const fetchLecturerWhitelist = () => {
        const lecturerRef = ref(database, 'lecturer_whitelist');
        onValue(lecturerRef, (snapshot) => {
            const data = snapshot.val();
            setLecturerWhitelist(data || {});
        });
    };

    const handleAddLecturer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLecturer.name || !newLecturer.code) {
            setToastMessage('❌ Vui lòng điền Họ tên và Mã giảng viên');
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        const generatedEmail = `${newLecturer.code.trim()}@gmail.com`.toLowerCase();
        
        try {
            setLoading(true);
            if (editingLecturerKey) {
                const lecturerRef = ref(database, `lecturer_whitelist/${editingLecturerKey}`);
                await update(lecturerRef, {
                    ...newLecturer,
                    email: generatedEmail
                });
                setToastMessage('✅ Đã cập nhật thông tin giảng viên');
            } else {
                const lecturerRef = ref(database, 'lecturer_whitelist');
                const newRef = push(lecturerRef);
                await set(newRef, {
                    ...newLecturer,
                    email: generatedEmail
                });
                setToastMessage('✅ Đã thêm giảng viên mới');
            }
            
            setNewLecturer({ name: '', code: '', email: '' });
            setEditingLecturerKey(null);
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err: any) {
            setToastMessage('❌ Lỗi: ' + err.message);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLecturer = async (key: string) => {
        try {
            const lecturerRef = ref(database, `lecturer_whitelist/${key}`);
            await remove(lecturerRef);
            setToastMessage('✅ Đã xóa giảng viên');
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err: any) {
            setToastMessage('❌ Lỗi khi xóa: ' + err.message);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setConfirmingDeleteLecturerKey(null);
        }
    };

    const handleLecturerExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                setLoading(true);
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (data.length < 2) throw new Error('File Excel trống hoặc thiếu dữ liệu');

                const headers = data[0].map(h => String(h || "").toLowerCase().trim());
                
                // Map columns
                const nameIdx = headers.findIndex(h => h.includes('họ tên') || h.includes('name') || h.includes('giảng viên'));
                const codeIdx = headers.findIndex(h => h.includes('mã gv') || h.includes('mã giảng viên') || h.includes('code') || h.includes('mã nv'));
                const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('gmail') || h.includes('thư điện tử') || h.includes('mail edu'));

                if (nameIdx === -1 || codeIdx === -1) {
                    throw new Error('Không nhận diện được các cột bắt buộc: Họ tên, Mã GV. Vui lòng kiểm tra tiêu đề file.');
                }

                const lecturersToAdd: any[] = [];
                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    const name = String(row[nameIdx] || "").trim();
                    const code = String(row[codeIdx] || "").trim();
                    
                    // Email logic: Use Excel email if exists, otherwise generate from code
                    let email = "";
                    if (emailIdx !== -1 && row[emailIdx]) {
                        email = String(row[emailIdx]).trim().toLowerCase();
                    } else if (code) {
                        email = `${code}@gmail.com`.toLowerCase();
                    }

                    if (name && code && email) {
                        lecturersToAdd.push({ name, code, email });
                    }
                }

                if (lecturersToAdd.length === 0) throw new Error('Không tìm thấy dữ liệu giảng viên hợp lệ trong file');

                const updates: any = {};
                lecturersToAdd.forEach(lec => {
                    const newKey = push(ref(database, 'lecturer_whitelist')).key;
                    if (newKey) updates[`lecturer_whitelist/${newKey}`] = lec;
                });

                await update(ref(database), updates);
                setToastMessage(`✅ Đã import thành công ${lecturersToAdd.length} giảng viên!`);
                setTimeout(() => setToastMessage(null), 5000);
            } catch (err: any) {
                setToastMessage('❌ Lỗi Import: ' + err.message);
                setTimeout(() => setToastMessage(null), 5000);
            } finally {
                setLoading(false);
                if (lecturerFileInputRef.current) lecturerFileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const [activeTab, setActiveTab] = useState<AdminTab>('semesters');


    const getPageTitle = () => {
        switch (activeTab) {
            case 'semesters': return 'Quản lý học kỳ';
            case 'admins': return 'Quản trị viên';
            case 'lecturers': return 'Quản lý Giảng viên';
            default: return 'Admin Dashboard';
        }
    };

    const getPageDescription = () => {
        switch (activeTab) {
            case 'semesters': return 'Cấu hình Google Sheet và ánh xạ cột';
            case 'admins': return 'Danh sách email có quyền quản trị';
            case 'lecturers': return 'Danh sách giảng viên được phép truy cập';
            default: return 'Cấu hình hệ thống';
        }
    };

    const handleSetupNotifications = async (url: string, tabName?: string, semesterId?: string, currentStatus?: boolean) => {
        try {
            setLoading(true);
            
            if (currentStatus) {
                const res = await disableNotifications(url, tabName);
                if (semesterId) {
                    const configRef = ref(database, `configs/${semesterId}`);
                    await update(configRef, { notifEnabled: false });
                }
                setToastMessage(`✅ ${res.message}`);
            } else {
                const res = await setupNotifications(url, tabName);
                if (semesterId) {
                    const configRef = ref(database, `configs/${semesterId}`);
                    await update(configRef, { notifEnabled: true });
                }
                setToastMessage(`✅ ${res.message}`);
            }
            
            fetchConfigs(); // Refresh UI
            setTimeout(() => setToastMessage(null), 5000);
        } catch (err: any) {
            setToastMessage(`❌ ${err.message}`);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <AdminLayout 
            activeTab={activeTab} 
            onTabChange={setActiveTab}
            title={getPageTitle()}
            description={getPageDescription()}
        >
            <div className="h-full space-y-10 pb-20">

                {activeTab === 'semesters' && (
                    <div className="flex flex-col lg:flex-row gap-8 items-start h-full min-h-0">
                        {/* Left Column: Form (Expanded) */}
                        <div className="flex-1 w-full h-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                            <SemesterForm 
                                formData={newSemester}
                                onFormChange={(data) => setNewSemester({ ...newSemester, ...data })}
                                onSubmit={handleCreateSemester}
                                onAutoFetch={handleAutoFetchColumns}
                                onTabRefresh={() => {
                                    if (newSemester.sheetUrl) {
                                        getTabNames(newSemester.sheetUrl).then(setAvailableTabs);
                                    }
                                }}
                                isFetchingTabs={isFetchingTabs}
                                availableTabs={availableTabs}
                                sheetHeaders={sheetHeaders}
                                loading={loading}
                                editMode={editMode}
                                onCancelEdit={() => {
                                    setEditMode(null);
                                    setNewSemester({ 
                                        semester: '', sheetUrl: '', startRow: '1', columns: '', 
                                        dateFormat: 'dd/MM/yyyy', sheetType: 'council', tabName: '', mapping: {} 
                                    });
                                }}
                            />
                        </div>
                        
                        {/* Right Column: List (Narrowed & Height Limited) */}
                        <div className="w-full lg:w-[350px] xl:w-[400px] shrink-0 flex flex-col h-[650px] bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-0">
                            <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/30 shrink-0">
                                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                                    Danh sách ({sortedSemesters.length})
                                </h3>
                                <div className="text-[9px] text-slate-400 font-medium italic">
                                    Cuộn ({Math.max(0, sortedSemesters.length - 4)}+)
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-orange-200">
                                <SemesterList 
                                    semesters={sortedSemesters}
                                    onEdit={handleEditSemester}
                                    onDelete={handleDeleteSemester}
                                    confirmingDeleteId={confirmingDeleteSemesterId}
                                    setConfirmingDeleteId={setConfirmingDeleteSemesterId}
                                    onSetupNotifications={handleSetupNotifications}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'admins' && isSuperAdmin(user.email) && (
                    <AdminWhitelistManager 
                        adminEmails={adminWhitelist}
                        newAdminEmail={newAdminEmail}
                        onNewAdminEmailChange={setNewAdminEmail}
                        onAddAdmin={handleAddAdmin}
                        onDeleteAdmin={handleDeleteAdmin}
                        confirmingDeleteKey={confirmingDeleteAdminKey}
                        setConfirmingDeleteKey={setConfirmingDeleteAdminKey}
                    />
                )}

                {activeTab === 'lecturers' && (
                    <LecturerWhitelistManager 
                        lecturers={lecturerWhitelist}
                        newLecturer={newLecturer}
                        onNewLecturerChange={(data) => setNewLecturer({ ...newLecturer, ...data })}
                        onAddLecturer={handleAddLecturer}
                        onDeleteLecturer={handleDeleteLecturer}
                        onEditLecturer={(key, data) => {
                            setNewLecturer(data);
                            setEditingLecturerKey(key);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        onImportExcel={handleLecturerExcelImport}
                        confirmingDeleteKey={confirmingDeleteLecturerKey}
                        setConfirmingDeleteKey={setConfirmingDeleteLecturerKey}
                        editingKey={editingLecturerKey}
                        onCancelEdit={() => {
                            setEditingLecturerKey(null);
                            setNewLecturer({ name: '', code: '', email: '' });
                        }}
                        fileInputRef={lecturerFileInputRef}
                        loading={loading}
                    />
                )}
            </div>

            {/* Global Toast */}
            {toastMessage && (
                <div className={`fixed bottom-10 right-10 ${toastMessage.startsWith('❌') ? 'bg-rose-950 border-rose-800' : 'bg-slate-900 border-slate-800'} border text-white px-8 py-5 rounded-[2rem] shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-700 flex items-center gap-4 z-[1000] backdrop-blur-xl bg-opacity-90`}>
                    <div className={`w-3 h-3 ${toastMessage.startsWith('❌') ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]' : 'bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.6)]'} rounded-full animate-pulse`} />
                    <span className="text-sm font-black tracking-tight">{toastMessage}</span>
                </div>
            )}
        </AdminLayout>
    );
};
