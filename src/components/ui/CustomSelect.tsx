import React, { useState, useRef, useEffect } from 'react';

interface Option {
    label: string;
    value: number;
}

interface CustomSelectProps {
    label: string;
    value: number | undefined;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    label,
    value,
    onChange,
    options,
    placeholder = "- Chọn -"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;
    const hasValue = value !== undefined && value !== null;

    return (
        <div className="space-y-2" ref={containerRef}>
            <label className="block text-sm font-semibold text-slate-900">{label}</label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full text-left px-4 py-3 bg-white border rounded-xl flex items-center justify-between transition-all outline-none ${isOpen
                            ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                            : 'border-slate-300 hover:border-indigo-400 shadow-sm'
                        }`}
                >
                    <span className={`text-sm font-medium truncate ${hasValue ? 'text-slate-900' : 'text-slate-500'}`}>
                        {selectedLabel}
                    </span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-slate-400 p-[1px] transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`}
                    >
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl max-h-[280px] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                        <div className="p-1">
                            <div
                                onClick={() => {
                                    onChange("");
                                    setIsOpen(false);
                                }}
                                className={`px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors mb-0.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700`}
                            >
                                {placeholder}
                            </div>

                            {options.map((opt) => (
                                <div
                                    key={opt.value}
                                    onClick={() => {
                                        onChange(String(opt.value));
                                        setIsOpen(false);
                                    }}
                                    className={`px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors mb-0.5 ${opt.value === value
                                            ? 'bg-indigo-50 text-indigo-700'
                                            : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
                                        }`}
                                >
                                    {opt.label}
                                </div>
                            ))}

                            {options.length === 0 && (
                                <div className="px-4 py-3 text-sm text-slate-400 text-center italic">Không có dữ liệu - Vui lòng import file</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
