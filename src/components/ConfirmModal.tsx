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

    const variantStyles = {
        danger: 'from-red-500 to-rose-600 shadow-rose-200 hover:shadow-rose-300',
        warning: 'from-orange-500 to-amber-600 shadow-orange-200 hover:shadow-orange-300',
        info: 'from-blue-500 to-indigo-600 shadow-blue-200 hover:shadow-blue-300'
    };

    const iconColors = {
        danger: 'text-red-500 bg-red-50',
        warning: 'text-orange-500 bg-orange-50',
        info: 'text-blue-500 bg-blue-50'
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-8 pb-6 text-center">
                    <div className={`w-16 h-16 ${iconColors[variant]} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm`}>
                        {variant === 'danger' && <span className="text-2xl font-bold">!</span>}
                        {variant === 'warning' && <span className="text-2xl font-bold">!</span>}
                        {variant === 'info' && <span className="text-2xl font-bold">i</span>}
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed">
                        {message}
                    </p>
                </div>
                
                <div className="p-6 bg-slate-50 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-6 py-3 bg-gradient-to-r ${variantStyles[variant]} text-white rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95 hover:-translate-y-0.5`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
