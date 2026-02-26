import React from 'react';
import { NavLink } from 'react-router-dom';
import { useFirebase } from '../../context/FirebaseContext';
import { isSuperAdmin } from '../../config/admin';

type AdminTab = 'semesters' | 'admins' | 'lecturers';

interface AdminSidebarProps {
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
    isOpen: boolean;
    onClose: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, onTabChange, isOpen, onClose }) => {
    const { user, logout } = useFirebase();

    const menuItems = [
        { id: 'semesters' as AdminTab, label: 'Học kỳ', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        )},
        { id: 'lecturers' as AdminTab, label: 'Giảng viên', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
        )},
    ];

    if (isSuperAdmin(user?.email)) {
        menuItems.push({ id: 'admins' as AdminTab, label: 'Quản trị viên', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        )});
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[60] lg:hidden transition-opacity"
                    onClick={onClose}
                />
            )}

            <aside className={`
                w-64 bg-slate-950 h-screen fixed left-0 top-0 flex flex-col text-slate-300 z-[70] border-r border-slate-900
                transition-transform duration-300 lg:translate-x-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:flex
            `}>
            <div className="p-8">
                <div className="flex items-center gap-3 mb-10">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/10">
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/6/68/Logo_FPT_Education.png"
                            alt="Logo"
                            className="h-6 w-auto filter brightness-0 invert"
                        />
                    </div>
                    <div>
                        <h1 className="font-bold text-base text-white leading-none tracking-tight">Admin</h1>
                        <p className="text-[8px] font-bold text-[#F27024] uppercase tracking-widest mt-1">Management</p>
                    </div>
                </div>

                <nav className="space-y-1.5">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                                activeTab === item.id
                                    ? 'bg-white/10 text-white font-semibold ring-1 ring-white/20'
                                    : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <span className={`${activeTab === item.id ? 'text-[#F27024]' : 'text-slate-500 group-hover:text-slate-300'} transition-colors`}>
                                {item.icon}
                            </span>
                            <span className="text-sm">{item.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <div className="mt-auto p-6 border-t border-slate-900 bg-slate-950/50 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-6">
                    <div className="relative">
                        <img 
                            src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.displayName || 'A'}&background=random`} 
                            className="w-10 h-10 rounded-xl border border-slate-800 object-cover" 
                            alt="User" 
                        />
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full"></div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="font-semibold text-xs text-white truncate">{user?.displayName || 'Admin'}</div>
                        <div className="text-[9px] text-slate-500 truncate">{user?.email}</div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <NavLink
                        to="/"
                        className="flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-slate-800"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Trang chủ
                    </NavLink>
                    <button 
                        onClick={logout}
                        className="flex items-center justify-center gap-2 py-2.5 bg-rose-500/5 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-rose-500/10 hover:border-rose-500"
                    >
                        Đăng xuất
                    </button>
                </div>
            </div>
        </aside>
        </>
    );
};
