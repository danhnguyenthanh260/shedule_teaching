
import React, { useState } from 'react';
import { UserProfile } from '../types';
import SyncHistoryModal from './SyncHistoryModal';

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
            <h1 className="font-black text-2xl text-slate-900 leading-none tracking-tight">FPTU Synchronizer</h1>
            <p className="text-sm font-black text-[#F27024] uppercase tracking-[0.3em] mt-2">Schedule Importer</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md transition-colors font-semibold text-xs border border-slate-200"
            title="Xem lịch sử import"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v5h5"></path>
              <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path>
              <path d="M12 7v5l4 2"></path>
            </svg>
            <span className="hidden sm:inline">Lịch sử</span>
          </button>

          <div className="text-right hidden sm:block">
            <div className="font-bold text-xs text-slate-800 leading-none">{user.name}</div>
            <div className="text-[9px] text-slate-400 font-bold uppercase">{user.email}</div>
          </div>
          <img src={user.image} className="w-8 h-8 rounded-lg border border-slate-100" alt="Avatar" />
          <button onClick={onLogout} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
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
