
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserProfile } from '../types';
import SyncHistoryModal from './SyncHistoryModal';
import { isAdmin } from '../config/admin';

interface Props {
  children: React.ReactNode;
  user: UserProfile;
  userId: string; // Firebase user ID for history lookup
  onLogout: () => void;
  syncHistoryRefresh?: number; // Trigger để refresh history modal
}

const Layout: React.FC<Props> = ({ children, user, userId, onLogout, syncHistoryRefresh }) => {
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#F8FAFC] lg:overflow-hidden text-slate-800">
      <nav className="flex-none bg-white border-b border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between z-50 shadow-sm mb-2">
        <div className="flex items-center gap-6">
          <div className="h-10 sm:h-12 flex items-center shrink-0">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/6/68/Logo_FPT_Education.png"
              alt="FPT Education Logo"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="h-10 w-px bg-slate-200 ml-2"></div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg sm:text-2xl text-slate-800 leading-none tracking-tight truncate uppercase">FPTU Synchronizer</h1>
            <p className="text-[10px] sm:text-xs font-bold text-[#F27024] uppercase tracking-[0.3em] mt-1">SCHEDULE IMPORTER</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all font-bold text-sm border border-slate-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">Lịch sử</span>
          </button>

          {isAdmin(user.email) && (
            <Link
              to="/admin"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-all font-bold text-sm shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Quản trị</span>
            </Link>
          )}

          <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <div className="font-bold text-[13px] text-slate-800 leading-none">{user.name}</div>
              <div className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tight">{user.email}</div>
            </div>
            
            <div className="relative group">
              <img src={user.image} className="w-10 h-10 rounded-full border border-slate-200 shadow-sm object-cover" alt="Avatar" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></div>
            </div>
            
            <button 
              onClick={onLogout} 
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
              title="Đăng xuất"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 lg:overflow-hidden flex flex-col px-1 pb-10 lg:pb-0">
          {children}
        </div>
      </main>

      {/* Sync History Modal */}
      <SyncHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        userId={userId}
        refreshTrigger={syncHistoryRefresh}
      />
    </div>
    );
};

export default Layout;
