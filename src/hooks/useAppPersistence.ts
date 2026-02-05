
import { useState, useEffect } from 'react';
import { persistStateService } from '../utils/persistState';
import { ColumnMapping } from '../types';
import { SheetTypeInfo } from '../utils/sheetTypeDetection';

export const useAppPersistence = () => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [tabName, setTabName] = useState('Sheet1');
  const [sheetMeta, setSheetMeta] = useState<{ sheetId: string; tab: string; headerRowIndex: number; isDataMau?: boolean; sheetType?: SheetTypeInfo } | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [columnMap, setColumnMap] = useState<ColumnMapping>({});
  const [personFilter, setPersonFilter] = useState('');
  const [startRow, setStartRow] = useState<number>(1);
  const [columnsConfig, setColumnsConfig] = useState<string>('');
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [fullHeaders, setFullHeaders] = useState<string[]>([]);
  const [fullDetailHeaders, setFullDetailHeaders] = useState<string[]>([]);
  const [titleRow, setTitleRow] = useState<string[]>([]);
  const [fullRows, setFullRows] = useState<string[][]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetType, setSheetType] = useState<SheetTypeInfo | null>(null);

  // Restore state on mount
  useEffect(() => {
    const restored = persistStateService.restoreState();

    if (restored.sheetUrl) setSheetUrl(restored.sheetUrl);
    if (restored.tabName) setTabName(restored.tabName);
    if (restored.sheetMeta) setSheetMeta(restored.sheetMeta);
    if (restored.headerRowIndex !== undefined) setHeaderRowIndex(restored.headerRowIndex);
    if (restored.columnMap) setColumnMap(restored.columnMap);
    if (restored.personFilter) setPersonFilter(restored.personFilter);
    if (restored.startRow !== undefined) setStartRow(restored.startRow);
    if (restored.columnsConfig) setColumnsConfig(restored.columnsConfig);
    if (restored.allRows?.length) setAllRows(restored.allRows);
    if (restored.fullHeaders?.length) setFullHeaders(restored.fullHeaders);
    if (restored.fullDetailHeaders?.length) setFullDetailHeaders(restored.fullDetailHeaders);
    if (restored.titleRow?.length) setTitleRow(restored.titleRow);
    if (restored.fullRows?.length) setFullRows(restored.fullRows);
    if (restored.selectedIds?.length) setSelectedIds(new Set(restored.selectedIds));

    console.log('✓ App state restored from localStorage');
  }, []);

  // Auto-save effects
  useEffect(() => { persistStateService.saveState({ sheetUrl }); }, [sheetUrl]);
  useEffect(() => { persistStateService.saveState({ tabName }); }, [tabName]);
  useEffect(() => { persistStateService.saveState({ sheetMeta }); }, [sheetMeta]);
  useEffect(() => { persistStateService.saveState({ headerRowIndex }); }, [headerRowIndex]);
  useEffect(() => { persistStateService.saveState({ columnMap }); }, [columnMap]);
  useEffect(() => { persistStateService.saveState({ personFilter }); }, [personFilter]);
  useEffect(() => { persistStateService.saveState({ startRow }); }, [startRow]);
  useEffect(() => { persistStateService.saveState({ columnsConfig }); }, [columnsConfig]);
  useEffect(() => { if (allRows.length) persistStateService.saveState({ allRows }); }, [allRows]);
  useEffect(() => { if (fullHeaders.length) persistStateService.saveState({ fullHeaders }); }, [fullHeaders]);
  useEffect(() => { if (fullDetailHeaders.length) persistStateService.saveState({ fullDetailHeaders }); }, [fullDetailHeaders]);
  useEffect(() => { if (titleRow.length) persistStateService.saveState({ titleRow }); }, [titleRow]);
  useEffect(() => { if (fullRows.length) persistStateService.saveState({ fullRows }); }, [fullRows]);
  useEffect(() => { if (selectedIds.size) persistStateService.saveState({ selectedIds: Array.from(selectedIds) }); }, [selectedIds]);

  const clearPersistence = () => {
    persistStateService.clearState();
    // Optional: Reset local states if needed
  };

  return {
    sheetUrl, setSheetUrl,
    tabName, setTabName,
    sheetMeta, setSheetMeta,
    headerRowIndex, setHeaderRowIndex,
    columnMap, setColumnMap,
    personFilter, setPersonFilter,
    startRow, setStartRow,
    columnsConfig, setColumnsConfig,
    allRows, setAllRows,
    fullHeaders, setFullHeaders,
    fullDetailHeaders, setFullDetailHeaders,
    titleRow, setTitleRow,
    fullRows, setFullRows,
    selectedIds, setSelectedIds,
    sheetType, setSheetType,
    clearPersistence
  };
};
