import React from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: 'danger' | 'warning' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    onConfirm,
    onCancel,
    variant = 'danger'
}) => {
    if (!isOpen) return null;

    const variantConfig = {
        danger: {
            btn: 'bg-rose-500 hover:bg-rose-600 shadow-rose-100',
            iconBg: 'bg-rose-50',
            iconColor: 'text-rose-500',
            icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            )
        },
        warning: {
            btn: 'bg-[#F27024] hover:bg-orange-600 shadow-orange-100',
            iconBg: 'bg-orange-50',
            iconColor: 'text-[#F27024]',
            icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            )
        },
        info: {
            btn: 'bg-blue-500 hover:bg-blue-600 shadow-blue-100',
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-500',
            icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        }
    };

    const config = variantConfig[variant];

    return (
        <div 
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={onCancel}
        >
            <div 
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 ease-out border border-white"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-10 pb-8 text-center">
                    {/* Simplified Icon Container */}
                    <div className={`w-20 h-20 ${config.iconBg} ${config.iconColor} rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-black/5`}>
                       {config.icon}
                    </div>
                    
                    <h3 className="text-xl font-black text-slate-800 mb-3 tracking-tight leading-tight uppercase">
                        {title}
                    </h3>
                    <p className="text-xs font-bold text-slate-400 leading-relaxed px-2 uppercase tracking-widest">
                        {message}
                    </p>
                </div>
                
                <div className="p-8 bg-slate-50/50 flex gap-4 border-t border-slate-100">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 hover:text-slate-600 transition-all active:scale-95 shadow-sm"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-6 py-4 ${config.btn} text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 hover:scale-[1.02] hover:-translate-y-0.5`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
