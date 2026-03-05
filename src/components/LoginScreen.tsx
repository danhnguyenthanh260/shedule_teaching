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
      {/* Background Slideshow */}
      <div className="absolute inset-0 z-0">
        {BACKGROUND_IMAGES.map((img, idx) => (
          <div
            key={img}
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[3000ms] ease-in-out ${
              idx === currentIdx ? 'opacity-100 scale-110 rotate-1' : 'opacity-0 scale-100 rotate-0'
            }`}
            style={{ 
              backgroundImage: `url(${img})`,
              transitionDelay: idx === currentIdx ? '0ms' : '500ms'
            }}
          />
        ))}
        {/* Subtle Dark Vignette for contrast without blurring */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 z-10" />
        
        {/* Dot pattern - more subtle */}
        <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px] opacity-10 z-10" />
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
