
import React from 'react';
import { UserProfile } from '../types';

interface Props {
  children: React.ReactNode;
  user: UserProfile;
  onLogout: () => void;
}

const Layout: React.FC<Props> = ({ children, user, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg">F</div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">FPTU Sync</h1>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">Schedule Importer</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-bold text-sm text-slate-900">{user.name}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase">{user.email}</div>
          </div>
          <img src={user.image} className="w-10 h-10 rounded-xl border border-slate-100" />
          <button onClick={onLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </nav>
      <main className="p-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;
