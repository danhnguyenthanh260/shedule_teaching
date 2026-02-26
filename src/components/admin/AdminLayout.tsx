import React, { useState } from 'react';
import { AdminSidebar } from './AdminSidebar';

type AdminTab = 'dashboard' | 'semesters' | 'admins' | 'lecturers';

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
    title: string;
    description: string;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ 
    children, 
    activeTab, 
    onTabChange,
    title,
    description
}) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="h-screen bg-slate-50 flex overflow-hidden relative">
            <AdminSidebar 
                activeTab={activeTab} 
                onTabChange={(tab) => {
                    onTabChange(tab);
                    setIsSidebarOpen(false); // Close on selection on mobile
                }} 
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />
            
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64">
                {/* Mobile Header Toggle */}
                <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-2">
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/6/68/Logo_FPT_Education.png"
                            alt="Logo"
                            className="h-5 w-auto"
                        />
                        <span className="font-bold text-xs text-slate-800 tracking-tight">Admin CMS</span>
                    </div>
                    <button 
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 flex flex-col p-6 lg:p-12 overflow-hidden">
                    <div className="max-w-6xl w-full mx-auto flex flex-col h-full">
                        {/* Page Header */}
                        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700 shrink-0">
                            <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">
                                {title}
                            </h2>
                            <div className="flex items-center gap-3">
                                <span className="h-1 w-10 bg-[#F27024] rounded-full opacity-80"></span>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                                    {description}
                                </p>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                            {children}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
