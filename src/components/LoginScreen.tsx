import React, { useState, useEffect } from 'react';
import { GoogleLoginButton } from './FirebaseAuth';

const BACKGROUND_IMAGES = [
  '/assets/bg1.jpg',
  '/assets/bg2.jpg',
  '/assets/bg3.jpg',
  '/assets/bg4.jpg',
  '/assets/bg5.jpg',
  '/assets/bg6.jpg',
  '/assets/bg7.jpg',
  '/assets/bg8.jpg',
  '/assets/bg9.jpg'
];

export const LoginScreen: React.FC = () => {
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    }, 5000); 
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Clean Aesthetic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50" />
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-100 rounded-full blur-[120px] opacity-40" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px] opacity-40" />
      </div>

      <div className="max-w-md w-full relative z-20">
        <div className="bg-white rounded-[2rem] p-8 md:p-12 text-center border border-slate-200 shadow-xl">
          {/* Logo Container */}
          <div className="mb-8 inline-block">
            <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center shadow-md p-4 border border-slate-100">
              <img
                src="https://static.wixstatic.com/media/c0d3eb_f3bfa95a7f0b4ca4b29ef81b3d529d68~mv2.png/v1/fill/w_706,h_706,al_c/Logo%20tr%C6%B0%E1%BB%9Dng%20%C4%91%E1%BA%A1i%20h%E1%BB%8Dc%20(layout%20tr%C3%B2n)-19.png"
                alt="FPTU Logo"
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = '/assets/logo.png'; }}
              />
            </div>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight uppercase">
            FPTU <span className="text-[#F27024]">SYNC</span>
          </h1>
          <p className="text-slate-500 font-bold text-[10px] mb-10 leading-relaxed px-4 uppercase tracking-widest opacity-70">
            Hệ thống quản lý & đồng bộ lịch trình <br className="hidden md:block"/> dành cho Giảng viên FPT
          </p>
          
          <div className="space-y-6">
            <div className="transform active:scale-[0.98] transition-all">
              <GoogleLoginButton />
            </div>
            
            <div className="relative flex items-center gap-4">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Protected Access</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            
            <div className="pt-2">
              <p className="text-[10px] text-[#F27024] font-bold uppercase tracking-widest">
                Đăng nhập để tiếp tục
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">
            © {new Date().getFullYear()} FPT University • Teaching Schedule
          </p>
        </div>
      </div>
    </div>
  );
};
