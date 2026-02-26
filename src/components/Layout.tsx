
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
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden text-slate-900">
      <nav className="flex-none bg-white border-b border-slate-300 px-3 sm:px-6 py-1 sm:py-2 flex items-center justify-between z-50 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-2 sm:gap-5">
          <div className="h-7 sm:h-12 flex items-center justify-center transform transition-all duration-300 hover:scale-105 shrink-0">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/6/68/Logo_FPT_Education.png"
              alt="FPT Education Logo"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="h-5 sm:h-8 w-px bg-slate-200 ml-0.5 sm:ml-2"></div>
          <div className="min-w-0">
            <h1 className="font-bold text-[11px] sm:text-2xl text-slate-900 leading-none tracking-tight truncate">FPTU Sync</h1>
            <p className="text-[6px] sm:text-sm font-bold text-[#F27024] uppercase tracking-[0.2em] sm:tracking-[0.3em] mt-0.5 sm:mt-2 truncate">Importer</p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors font-semibold text-xs border border-slate-200"
            title="Xem lịch sử import"
          >
            <svg className="w-4 h-4 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">Lịch sử</span>
          </button>

          {isAdmin(user.email) && (
            <Link
              to="/admin"
              className="flex items-center justify-center p-1.5 sm:px-3 sm:py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F27024] rounded-lg transition-colors font-bold text-xs border border-orange-100"
              title="Quản lý hệ thống"
            >
              <svg className="w-4 h-4 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Quản trị</span>
            </Link>
          )}

          <div className="h-6 w-px bg-slate-200 hidden sm:block mx-1"></div>

          <div className="text-right hidden md:block">
            <div className="font-bold text-[10px] text-slate-800 leading-none truncate max-w-[100px]">{user.name}</div>
            <div className="text-[8px] text-slate-400 font-bold uppercase truncate max-w-[100px]">{user.email}</div>
          </div>
          
          <img src={user.image} className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg border border-slate-100 shadow-sm shrink-0" alt="Avatar" />
          
          <button 
            onClick={onLogout} 
            className="p-1 sm:px-3 sm:py-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all font-bold text-xs border border-transparent hover:border-rose-100"
            title="Đăng xuất"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-hidden p-4 md:p-6 flex flex-col">
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
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
