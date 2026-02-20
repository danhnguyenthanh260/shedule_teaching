import React, { useState, useRef, useEffect } from 'react';

interface SearchColumnSelectorProps {
  headers: { label: string; value: number }[];
  selectedIndices: number[];
  onSelectionChange: (indices: number[]) => void;
}

export const SearchColumnSelector: React.FC<SearchColumnSelectorProps> = ({
  headers,
  selectedIndices,
  onSelectionChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredHeaders = headers.filter(h => 
    h.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleIndex = (index: number) => {
    if (selectedIndices.includes(index)) {
      onSelectionChange(selectedIndices.filter(i => i !== index));
    } else {
      onSelectionChange([...selectedIndices, index]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`shrink-0 min-w-[42px] px-3 py-2.5 rounded-xl border transition-all flex items-center justify-center gap-2 ${
          selectedIndices.length > 0 
            ? 'bg-[#F27024]/5 border-[#F27024]/20 text-[#F27024]' 
            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
        }`}
        title="Chọn cột để tìm kiếm"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>

        {selectedIndices.length > 0 && (
          <span className="text-[10px] font-bold">{selectedIndices.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-72 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 z-[999] animate-in fade-in zoom-in slide-in-from-top-2 duration-300 origin-top-right ease-out">
          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cột tìm kiếm</h3>
            <button 
              onClick={() => onSelectionChange([])}
              className="text-[9px] font-bold text-[#F27024] hover:underline uppercase"
            >
              Cài lại
            </button>
          </div>

          <div className="mb-3 relative">
            <input
              type="text"
              placeholder="Tìm tên cột..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-[#F27024] transition-all"
            />
            <svg className="absolute left-2.5 top-2.5 w-3 h-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>

          </div>

          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
            {filteredHeaders.map((header) => {
              const isSelected = selectedIndices.includes(header.value);
              return (
                <label
                  key={header.value}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#F27024]/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center ${
                    isSelected ? 'bg-[#F27024] border-[#F27024]' : 'bg-white border-slate-300'
                  }`}>
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>

                  </div>
                  <span className={`text-[11px] font-bold truncate ${
                    isSelected ? 'text-[#F27024]' : 'text-slate-600'
                  }`}>
                    {header.label}
                  </span>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={isSelected}
                    onChange={() => toggleIndex(header.value)}
                  />
                </label>
              );
            })}
            {filteredHeaders.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-4 font-bold">Không tìm thấy cột</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
