
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
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden text-slate-900">
      <nav className="flex-none bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between z-50 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="h-12 flex items-center justify-center transform transition-all duration-300 hover:scale-105">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/6/68/Logo_FPT_Education.png"
              alt="FPT Education Logo"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="h-8 w-px bg-slate-200 ml-2"></div>
          <div>
            <h1 className="font-bold text-2xl text-slate-900 leading-none tracking-tight">FPTU Synchronizer</h1>
            <p className="text-sm font-bold text-[#F27024] uppercase tracking-[0.3em] mt-2">Schedule Importer</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md transition-colors font-semibold text-xs border border-slate-200"
            title="Xem lịch sử import"
          >
            <span className="hidden sm:inline">Lịch sử</span>
          </button>

          {isAdmin(user.email) && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F27024] rounded-md transition-colors font-bold text-xs border border-orange-100"
              title="Quản lý hệ thống"
            >
              <span className="hidden sm:inline">Quản trị</span>
            </Link>
          )}

          <div className="text-right hidden sm:block">
            <div className="font-bold text-xs text-slate-800 leading-none">{user.name}</div>
            <div className="text-[9px] text-slate-400 font-bold uppercase">{user.email}</div>
          </div>
          <img src={user.image} className="w-8 h-8 rounded-lg border border-slate-100" alt="Avatar" />
          <button 
            onClick={onLogout} 
            className="px-3 py-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all font-bold text-xs border border-transparent hover:border-rose-100"
          >
            Logout
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
