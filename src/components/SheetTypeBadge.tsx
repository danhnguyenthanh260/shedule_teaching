import React from 'react';
import { SheetTypeInfo } from '../utils/sheetTypeDetection';

interface SheetTypeBadgeProps {
    sheetType: SheetTypeInfo | null;
}

export const SheetTypeBadge: React.FC<SheetTypeBadgeProps> = ({ sheetType }) => {
    if (!sheetType) return null;

    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${sheetType.color} text-xs font-bold shadow-sm animate-in fade-in slide-in-from-top-2`}>
            <span className="text-base">{sheetType.icon}</span>
            <span>Chế độ xem: {sheetType.displayName}</span>
        </div>
    );
};
