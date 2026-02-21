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
    }, 5000); // Chuyển ảnh sau 5 giây
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-900">
      {/* Background Slider */}
      <div className="absolute inset-0 z-0">
        {BACKGROUND_IMAGES.map((img, idx) => (
          <div
            key={img}
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[4000ms] ease-in-out will-change-[opacity,transform,filter] ${
              idx === currentIdx 
                ? 'opacity-100 scale-110 blur-0' 
                : 'opacity-0 scale-125 blur-3xl'
            }`}
            style={{ 
              backgroundImage: `url(${img})`,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden'
            }}
          />
        ))}
        {/* Deep Gradient Overlay for Morph Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-transparent to-black/60 z-10 pointer-events-none" />
      </div>

      <div className="max-w-md w-full relative z-20 animate-in fade-in zoom-in duration-1000">
        <div className="bg-white/95 backdrop-blur-3xl rounded-[3.5rem] shadow-2xl p-12 text-center border border-white/30">
          <div className="w-32 h-32 bg-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl transform hover:rotate-6 hover:scale-110 transition-all duration-500 overflow-hidden border border-gray-100 p-4">
            <img
              src="https://static.wixstatic.com/media/c0d3eb_f3bfa95a7f0b4ca4b29ef81b3d529d68~mv2.png/v1/fill/w_706,h_706,al_c/Logo%20tr%C6%B0%E1%BB%9Dng%20%C4%91%E1%BA%A1i%20h%E1%BB%8Dc%20(layout%20tr%C3%B2n)-19.png"
              alt="FPTU Logo"
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to local if exist
                (e.target as HTMLImageElement).src = '/assets/logo.png';
              }}
            />
          </div>
          
          <h1 className="text-4xl font-bold text-slate-900 mb-3 tracking-tighter">
            FPTU <span className="text-[#F27024]">Sync</span>
          </h1>
          <p className="text-slate-600 font-bold text-sm mb-10 leading-relaxed px-2 opacity-80">
            Hệ thống quản lý & đồng bộ lịch giảng dạy thông minh dành cho Giảng viên FPT.
          </p>
          
          <div className="space-y-6">
            <GoogleLoginButton />
            
            <div className="relative flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">SECURE GATEWAY</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            
            <p className="text-[10px] text-slate-400 px-6 leading-relaxed font-bold italic">
              "Khai phá sức mạnh công nghệ, tối ưu hóa công việc mỗi ngày."
            </p>
          </div>
        </div>
        
        <p className="mt-8 text-center text-white/70 text-[10px] font-bold uppercase tracking-[0.5em] drop-shadow-md">
          © {new Date().getFullYear()} FPT University • Teaching Schedule
        </p>
      </div>
    </div>
  );
};
