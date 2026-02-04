
import React from 'react';
import { GoogleLoginButton } from './FirebaseAuth';

export const LoginScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-emerald-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />

      <div className="max-w-md w-full relative z-10">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center border border-white/20">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl transform hover:scale-110 transition-transform duration-300 overflow-hidden border border-gray-100 p-3">
            <img
              src="https://static.wixstatic.com/media/c0d3eb_f3bfa95a7f0b4ca4b29ef81b3d529d68~mv2.png/v1/fill/w_706,h_706,al_c/Logo%20tr%C6%B0%E1%BB%9Dng%20%C4%91%E1%BA%A1i%20h%E1%BB%8Dc%20(layout%20tr%C3%B2n)-19.png"
              alt="FPTU Logo"
              className="w-full h-full object-contain"
            />
          </div>
          
          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
            FPTU Synchronizer
          </h1>
          <p className="text-slate-500 font-medium mb-8">
            Đồng bộ lịch dạy & Review lên Google Calendar một cách thông minh và an toàn.
          </p>
          
          <div className="space-y-4">
            <GoogleLoginButton />
            
            <div className="flex items-center gap-3 py-4">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">DÀNH CHO GIẢNG VIÊN & ADMIN</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            
            <p className="text-[11px] text-slate-400 px-4 leading-relaxed">
              Bằng cách đăng nhập, bạn đồng ý với việc ứng dụng truy cập vào Google Calendar để tạo các sự kiện từ dữ liệu Sheet.
            </p>
          </div>
        </div>
        
        <p className="mt-8 text-center text-slate-500 text-xs font-medium">
          © {new Date().getFullYear()} Advanced Agentic Coding Team
        </p>
      </div>
    </div>
  );
};
