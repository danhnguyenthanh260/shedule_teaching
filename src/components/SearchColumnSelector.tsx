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
        className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 ${
          selectedIndices.length > 0 
            ? 'bg-[#F27024]/5 border-[#F27024]/20 text-[#F27024]' 
            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
        }`}
        title="Chọn cột để tìm kiếm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {selectedIndices.length > 0 && (
          <span className="text-[10px] font-bold">{selectedIndices.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 z-[200] animate-in fade-in zoom-in duration-200 origin-top-right">
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
            <svg className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
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
