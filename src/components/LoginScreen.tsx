import React, { useState, useEffect } from 'react';
import { GoogleLoginButton } from './FirebaseAuth';

const BACKGROUND_IMAGES = [
  'https://scontent.fsgn2-3.fna.fbcdn.net/v/t39.30808-6/481897349_1114631874039985_3765674293052840069_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=127cfc&_nc_ohc=GKuGj37yMwEQ7kNvwEDQPIH&_nc_oc=AdkDXfiX5AHpX0BiCAlq6Z1wBVQMZT8puYJtofmFhGwd6lU9tR_q0JYXtqzVX2ZOaVE&_nc_zt=23&_nc_ht=scontent.fsgn2-3.fna&_nc_gid=9X5uXVXtD9qc5d10aJnAcA&oh=00_AftNvkz07wwJDFxgYM-oJ0Ri4Wg_NGC5JMx4FFc8nFS0oA&oe=6988DC92',
  'https://scontent.fsgn2-9.fna.fbcdn.net/v/t39.30808-6/482303051_1114631914039981_673159522902005099_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=127cfc&_nc_ohc=jOggmX5ZWFcQ7kNvwH4bq0e&_nc_oc=AdlOIN_l2S9NpvkojNEFzEhQUr6RCoL2w01C3xgC9aFxhs1jGGmtbSbUykRJo6B97-g&_nc_zt=23&_nc_ht=scontent.fsgn2-9.fna&_nc_gid=YIpkpaNwAN9v3jia5kfk5g&oh=00_AftbTAzLsjaiqQtcjopHqcS3Pe4fo1jwu4DNTlufdQv8jQ&oe=6988D4BF',
  'https://scontent.fsgn2-5.fna.fbcdn.net/v/t39.30808-6/481673607_1114631977373308_9119037389683418562_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=127cfc&_nc_ohc=-f0IxpaE2bwQ7kNvwGuGUb0&_nc_oc=Adkf3wiz4lSHc01r9TKjqRl8j2Gubdt_hpBjHGFA_r8HImabKr1w4D-QwUETOCznOJQ&_nc_zt=23&_nc_ht=scontent.fsgn2-5.fna&_nc_gid=XqWVSBov1b5gltHUqiEtkQ&oh=00_Afs0JLqzhgjXle5lGsaK5d-sCMUbZIAZgb8wT79LoE_rDw&oe=6988C653',
  'https://scontent.fsgn2-4.fna.fbcdn.net/v/t39.30808-6/482325631_1114632137373292_7007094141443597420_n.jpg?_nc_cat=101&ccb=1-7&_nc_sid=127cfc&_nc_ohc=f-jww7irqUkQ7kNvwFzjB0-&_nc_oc=AdmgIrLiAg_qca70cNkm2QmyJZyv1iUfo-peMnnbI2bc1MdsE22GWpMnw5xIjstVxuo&_nc_zt=23&_nc_ht=scontent.fsgn2-4.fna&_nc_gid=Z-BAeefz8PJ9yeo0BoVRSg&oh=00_AfuEgJ3KuLSCIWqjpr8F5fUnL2FMKfptUlL1EBuPz7aYMA&oe=6988C6B0',
  'https://scontent.fsgn2-6.fna.fbcdn.net/v/t39.30808-6/481699529_1114631900706649_8871416805432494628_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=127cfc&_nc_ohc=PON0zzZDUC0Q7kNvwFdQYid&_nc_oc=AdnhJdWvp37zoyHVikQ9rDxao3fUXuLUQ9yGyq9WXDmfVbRkb3ht3vZTllRuAgKDJMk&_nc_zt=23&_nc_ht=scontent.fsgn2-6.fna&_nc_gid=Xba4KDoIozrVatRd5JlYoA&oh=00_AfsD4Yare9EROFtLarF1xBrDMAnCPXM1iUwb3n2YUWOz9A&oe=6988D8BE',
  'https://scontent.fsgn2-3.fna.fbcdn.net/v/t39.30808-6/482265968_1114631980706641_9089234452692233016_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=127cfc&_nc_ohc=AxCLmiIMyuQQ7kNvwHDq1n0&_nc_oc=AdljTLmmOC1RM8NkMPmzHTb-HvTajRQJDK5PEVcCOtuFKXKKzGfvJxrKcd6nwlSwCRU&_nc_zt=23&_nc_ht=scontent.fsgn2-3.fna&_nc_gid=gMuwwdARQgFQcZ3IpJc75Q&oh=00_AfsQSvRf7d6wMAifcnjoK2DCovlWstMtvmvwwla_ezen3w&oe=6988DA85',
  'https://scontent.fsgn2-4.fna.fbcdn.net/v/t39.30808-6/481503931_1114631660706673_3275962232321643676_n.jpg?_nc_cat=101&ccb=1-7&_nc_sid=127cfc&_nc_ohc=vlKCnLw539gQ7kNvwGI1yAp&_nc_oc=AdkdXphgmqgzS6UI2s2Sd4H4YLIfHckNvBOdYQrUWifyMd00XaUVIObhmc42pURXNXc&_nc_zt=23&_nc_ht=scontent.fsgn2-4.fna&_nc_gid=V127RhcCgdKiokiUbujr9g&oh=00_AftrUpyKkOTSpRftmnufqmG2ONb5RLM_DexsRmf6bApHpA&oe=6988BCC9',
  'https://scontent.fsgn2-7.fna.fbcdn.net/v/t39.30808-6/481659712_1114632077373298_8377715326804419561_n.jpg?_nc_cat=100&ccb=1-7&_nc_sid=127cfc&_nc_ohc=YEsVzVb7lusQ7kNvwGldd6P&_nc_oc=Admy7UlbJTibQCPZoT5EvJ5kpzXthpoubvECmkjIkphCjBXo_sSn4I0PPGKvyLyCL0k&_nc_zt=23&_nc_ht=scontent.fsgn2-7.fna&_nc_gid=-v08t9QMI-Dgvy9oyjAIEw&oh=00_AfvvE0xTZ7DZcQtGjD5OCzP8cyVxE_32p8sWmiKfr3wB0g&oe=6988E219',
  'https://scontent.fsgn2-5.fna.fbcdn.net/v/t39.30808-6/482082845_1114631684040004_5134071188270376674_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=127cfc&_nc_ohc=IM1amh8XLT8Q7kNvwEYQrq2&_nc_oc=AdnpGkFjgG0T-w9uU-VeJBIk1rjjYemGgbPXdUfcSn6xak7_N6v7J7XXOyf5aqMg-BE&_nc_zt=23&_nc_ht=scontent.fsgn2-5.fna&_nc_gid=N8tiywgE5EDYV3lTG303Bg&oh=00_Afun_0oVwRtvYsF_xIGNsWXkS4pIMk4Uig-8Fsdgm-b8mg&oe=6988CF6A'
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
      <div className="absolute inset-0 z-0 bg-black">
        {BACKGROUND_IMAGES.map((img, idx) => (
          <div
            key={img}
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[3000ms] ease-in-out will-change-transform ${
              idx === currentIdx ? 'opacity-100 scale-110' : 'opacity-0 scale-100'
            }`}
            style={{ 
              backgroundImage: `url('${img}')`,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden'
            }}
          />
        ))}
        {/* Dark Overlay - Removed blur for maximum sharpness */}
        <div className="absolute inset-0 bg-black/30 z-10 pointer-events-none" />
      </div>

      <div className="max-w-md w-full relative z-20 animate-in fade-in zoom-in duration-1000">
        <div className="bg-white/95 backdrop-blur-2xl rounded-[3rem] shadow-2xl p-10 text-center border border-white/20">
          <div className="w-32 h-32 bg-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl transform hover:rotate-6 hover:scale-110 transition-all duration-500 overflow-hidden border border-gray-100 p-4">
            <img
              src="https://static.wixstatic.com/media/c0d3eb_f3bfa95a7f0b4ca4b29ef81b3d529d68~mv2.png/v1/fill/w_706,h_706,al_c/Logo%20tr%C6%B0%E1%BB%9Dng%20%C4%91%E1%BA%A1i%20h%E1%BB%8Dc%20(layout%20tr%C3%B2n)-19.png"
              alt="FPTU Logo"
              className="w-full h-full object-contain"
            />
          </div>
          
          <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tighter">
            FPTU <span className="text-[#F27024]">Sync</span>
          </h1>
          <p className="text-slate-600 font-bold text-sm mb-10 leading-relaxed px-2 opacity-80">
            Hệ thống quản lý & đồng bộ lịch giảng dạy thông minh dành cho Giảng viên FPT.
          </p>
          
          <div className="space-y-6">
            <GoogleLoginButton />
            
            <div className="relative flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">SECURE GATEWAY</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            
            <p className="text-[10px] text-slate-400 px-6 leading-relaxed font-bold italic">
              "Khai phá sức mạnh công nghệ, tối ưu hóa công việc mỗi ngày."
            </p>
          </div>
        </div>
        
        <p className="mt-8 text-center text-white/70 text-[10px] font-black uppercase tracking-[0.5em] drop-shadow-md">
          © {new Date().getFullYear()} FPT University • Teaching Schedule
        </p>
      </div>
    </div>
  );
};
