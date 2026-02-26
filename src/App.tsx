import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useFirebase } from './context/FirebaseContext';
import { LoginScreen } from './components/LoginScreen';
import { AdminPage } from './pages/AdminPage';
import { LecturerApp } from './LecturerApp';
import { isAdmin } from './config/admin';

const AccessDenied: React.FC<{ email: string | null; logout: () => void }> = ({ email, logout }) => (
  <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
    <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-[2rem] text-center shadow-2xl animate-in fade-in zoom-in duration-500">
      <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
        <svg className="w-10 h-10 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2 uppercase tracking-tight">Truy cập bị từ chối</h1>
      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
        Tài khoản <span className="text-[#F27024] font-bold">{email}</span> không có quyền truy cập vào hệ thống này. Vui lòng liên hệ quản trị viên để được cấp quyền.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => window.location.reload()}
          className="w-full py-4 bg-white text-slate-950 rounded-2xl font-bold hover:bg-slate-100 transition-all text-sm shadow-lg shadow-white/5 active:scale-[0.98]"
        >
          Thử lại
        </button>
        <button
          onClick={logout}
          className="w-full py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 hover:text-white transition-all text-sm active:scale-[0.98]"
        >
          Đăng xuất
        </button>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const { user: firebaseUser, loading: authLoading, isAdmin: isUserAdmin, isAuthorized, isWhitelistLoading, logout } = useFirebase();

  if (authLoading || (firebaseUser && isWhitelistLoading)) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#F27024] rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] animate-pulse ml-1">
            Authenticating
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  if (!isAuthorized) {
    return <AccessDenied email={firebaseUser.email} logout={logout} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/admin" 
          element={isUserAdmin ? <AdminPage /> : <Navigate to="/" />} 
        />
        <Route path="/" element={<LecturerApp />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;