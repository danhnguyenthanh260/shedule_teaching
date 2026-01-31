
import React, { useState, useMemo, useEffect } from 'react';
import { RowNormalized, UserProfile, SyncResult, ColumnMapping } from './types';
import { inferSchema } from './lib/inference';
import { googleService } from './services/googleService';
import { syncHistoryService } from './services/syncHistoryService';
import { MergedCellGroup } from './lib/headerParser';
import Layout from './components/Layout';
import { useFirebase } from './src/context/FirebaseContext';
import { GoogleLoginButton, UserProfile as FirebaseUserProfile } from './src/components/FirebaseAuth';
import { useFirebaseMapping } from './src/hooks/useFirebaseMapping';
import { syncEventsToCalendar } from './src/services/appsScriptService';

// Khai báo kiểu cho SDK Google
declare global {
  interface Window {
    google: any;
  }
}

const App: React.FC = () => {
  // Firebase Auth & Mapping
  const { user: firebaseUser, accessToken: firebaseAccessToken, logout } = useFirebase();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [tabName, setTabName] = useState('Sheet1');
  const [personFilter, setPersonFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'test1' | 'review' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState<RowNormalized[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [fullHeaders, setFullHeaders] = useState<string[]>([]);  // For group detection
  const [fullDetailHeaders, setFullDetailHeaders] = useState<string[]>([]);  // Actual column names for tier 2
  const [titleRow, setTitleRow] = useState<string[]>([]);  // Row 2 groups for Review mode
  const [fullRows, setFullRows] = useState<string[][]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [showFullTable, setShowFullTable] = useState(false);
  const [columnMap, setColumnMap] = useState<ColumnMapping>({});
  const [sheetMeta, setSheetMeta] = useState<{ sheetId: string; tab: string; headerRowIndex: number } | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [mergedCells, setMergedCells] = useState<MergedCellGroup[]>([]);

  // Firebase mapping hook - auto-loads mapping when available
  const {
    mapping: savedMapping,
    loading: mappingLoading,
    saveMapping: saveFirebaseMapping,
    getMapping: getFirebaseMapping
  } = useFirebaseMapping(sheetMeta?.sheetId);

  // Toast notification auto-hide
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Sync Firebase user with local user state and get access token
  useEffect(() => {
    if (firebaseUser) {
      setUser({
        name: firebaseUser.displayName || firebaseUser.email || 'User',
        email: firebaseUser.email || '',
        image: firebaseUser.photoURL || ''
      });
      setPersonFilter(firebaseUser.displayName || firebaseUser.email || '');

      // Use access token from Firebase context
      if (firebaseAccessToken) {
        setAccessToken(firebaseAccessToken);
      }
    } else {
      setUser(null);
      setAccessToken(null);
    }
  }, [firebaseUser, firebaseAccessToken]);

  // Auto-load saved mapping when sheet changes
  useEffect(() => {
    if (savedMapping && sheetMeta && Object.keys(savedMapping).length > 0) {
      setColumnMap(savedMapping);
      setToastMessage('✓ Đã tải mapping đã lưu từ lần trước');
      console.log('Auto-loaded saved mapping:', savedMapping);
    }
  }, [savedMapping, sheetMeta?.sheetId]);

  const updateSelections = (data: RowNormalized[]) => {
    const filterLower = personFilter.toLowerCase();
    const matches = data.filter(r =>
      r.person.toLowerCase().includes(filterLower) ||
      r.email?.toLowerCase().includes(filterLower)
    );
    setSelectedIds(new Set(matches.map(m => m.id)));
  };

  const looksLikeDataRow = (row: string[]) => {
    const joined = row.join(' ').toLowerCase();
    const datePattern = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/;
    const timePattern = /\b\d{1,2}:\d{2}\b|\b\d{1,2}h\d{2}\b/;
    const numericCells = row.filter(v => v && /^\d+$/.test(v.trim())).length;
    const filledCells = row.filter(v => v && v.trim()).length;
    const dataSignals = (datePattern.test(joined) ? 1 : 0) + (timePattern.test(joined) ? 1 : 0) + (numericCells > 2 ? 1 : 0);
    return filledCells > 0 && dataSignals >= 1;
  };

  const looksLikeHeaderRow = (row: string[]) => {
    const filledCells = row.filter(v => v && v.trim()).length;
    if (filledCells === 0) return false;
    const headerKeywords = ['ngành', 'mã', 'tên', 'đề tài', 'ngày', 'giờ', 'phòng', 'review', 'code', 'count', 'reviewer'];
    const joined = row.join(' ').toLowerCase();
    const keywordHits = headerKeywords.filter(k => joined.includes(k)).length;
    return keywordHits > 0 || filledCells >= Math.max(3, row.length * 0.2);
  };

  const mergeHeaderRows = (primary: string[], secondary: string[]) => {
    const maxLen = Math.max(primary.length, secondary.length);
    return Array.from({ length: maxLen }, (_, i) => {
      const a = primary[i]?.trim() || '';
      const b = secondary[i]?.trim() || '';
      if (a && b && a !== b) return `${a} ${b}`;
      return a || b;
    });
  };

  const trimLeadingEmptyRows = (rows: string[][]) => {
    let start = 0;
    while (start < rows.length && !rows[start].some(cell => cell && cell.trim())) {
      start += 1;
    }
    return rows.slice(start);
  };

  // ✅ Fill forward empty cells with last non-empty value (for merged cells)
  // Example: ["REVIEW 1", "", "", "REVIEW 2", "", ""] → ["REVIEW 1", "REVIEW 1", "REVIEW 1", "REVIEW 2", "REVIEW 2", "REVIEW 2"]
  const fillForwardHeaders = (headers: string[]): string[] => {
    const filled: string[] = [];
    let lastValue = "";
    for (let i = 0; i < headers.length; i++) {
      const cell = (headers[i] || "").toString().trim();
      if (cell) {
        lastValue = cell;
        filled[i] = cell;
      } else {
        // Empty cell - use last non-empty value (merged cell behavior)
        filled[i] = lastValue || `Column_${i + 1}`;
      }
    }
    return filled;
  };


  const applyHeaderRow = (idx: number, rows: string[][], meta?: { sheetId: string; tab: string }) => {
    // ⚠️ CRITICAL: Use EXACT row user selected - NO merging, NO auto-detection
    // Row 1 → Headers = Row 1 content (e.g., "REVIEW 1-2-3")
    // Row 2 → Headers = Row 2 content (e.g., "REVIEW 1", "REVIEW 2")
    // Row 3 → Headers = Row 3 content (e.g., "Code", "Date", "Slot")
    let headers = rows[idx] || [];

    // ✅ Fill forward empty cells (merged cell behavior)
    // Converts: ["REVIEW 1", "", "", "REVIEW 2", ""] 
    //      To: ["REVIEW 1", "REVIEW 1", "REVIEW 1", "REVIEW 2", "REVIEW 2"]
    const filledHeaders = fillForwardHeaders(headers);

    // ✅ Detect if this row has grouped headers (consecutive identical values)
    const groups: { name: string; span: number }[] = [];
    let currentGroup: string | null = null;
    filledHeaders.forEach(h => {
      const header = (h || "").trim();
      const isGeneric = header.match(/^Column_\d+$/);
      if (!isGeneric && header && header === currentGroup) {
        groups[groups.length - 1].span++;
      } else if (!isGeneric && header) {
        currentGroup = header;
        groups.push({ name: header, span: 1 });
      } else {
        currentGroup = null;
      }
    });
    const hasGroups = groups.some(g => g.span > 1);

    // ✅ SPECIAL: For Review mode (idx=2), ALWAYS use Row 3 as headers directly
    // DO NOT merge with Row 2 - keep them separate (Row 2 = title, Row 3 = headers)
    let detailHeaders: string[];
    let dataStartIndex: number;
    let titleRow: string[] = [];  // For Review mode: Row 2 titles

    if (idx === 2) {
      // Review mode: ALWAYS use Row 3 (idx=2) as headers, Row 2 (idx=1) as titles
      detailHeaders = filledHeaders;  // Row 3
      titleRow = rows[1] ? fillForwardHeaders(rows[1]) : [];  // Row 2
      dataStartIndex = idx + 1;  // Data starts at Row 4

      // Filter out DEFENSE and CONFLICT from both
      const columnsToKeep: number[] = [];
      titleRow.forEach((h, i) => {
        const header = (h || "").toString().toLowerCase();
        if (!header.includes('defense') && !header.includes('conflict')) {
          columnsToKeep.push(i);
        }
      });

      if (columnsToKeep.length < titleRow.length) {
        titleRow = columnsToKeep.map(i => titleRow[i]);
        detailHeaders = columnsToKeep.map(i => detailHeaders[i]);
        headers = titleRow;  // Use filtered titles for group display
        console.log(`✅ Filtered out ${filledHeaders.length - columnsToKeep.length} DEFENSE/CONFLICT columns`);
      } else {
        headers = titleRow;  // Use Row 2 titles for group display
      }
    } else if (hasGroups && rows[idx + 1]) {
      // Row has groups → use filled row for grouping, next row for details
      headers = filledHeaders;  // For group detection in UI
      detailHeaders = rows[idx + 1] || [];  // Detail column names from next row
      dataStartIndex = idx + 2;  // Data starts after detail header row

      // ✅ Filter out DEFENSE and CONFLICT columns (for Review mode)
      const columnsToKeep: number[] = [];
      filledHeaders.forEach((h, i) => {
        const header = (h || "").toString().toLowerCase();
        // Keep columns that are NOT DEFENSE or CONFLICT
        if (!header.includes('defense') && !header.includes('conflict')) {
          columnsToKeep.push(i);
        }
      });

      // Apply filter to headers and detail headers
      if (columnsToKeep.length < filledHeaders.length) {
        headers = columnsToKeep.map(i => filledHeaders[i]);
        detailHeaders = columnsToKeep.map(i => detailHeaders[i]);
        // Also need to filter all data rows later
        console.log(`✅ Filtered out ${filledHeaders.length - columnsToKeep.length} DEFENSE/CONFLICT columns`);
      }
    } else {
      // No groups → use current row as both group and detail
      headers = filledHeaders;
      detailHeaders = filledHeaders;
      dataStartIndex = idx + 1;
    }

    // Get raw data rows (everything after headers)
    let rawRows = rows.slice(dataStartIndex);

    // ✅ Apply column filter to data rows if we filtered headers
    if (idx === 2 && titleRow.length > 0) {
      // Review mode: filter based on titleRow (Row 2)
      const unfilteredTitleRow = rows[1] ? fillForwardHeaders(rows[1]) : [];
      if (titleRow.length < unfilteredTitleRow.length) {
        const columnsToKeep: number[] = [];
        unfilteredTitleRow.forEach((h, i) => {
          const header = (h || "").toString().toLowerCase();
          if (!header.includes('defense') && !header.includes('conflict')) {
            columnsToKeep.push(i);
          }
        });

        rawRows = rawRows.map(row => columnsToKeep.map(i => row[i] || ''));
      }
    } else {
      // Other modes: use original logic
      const hasColumnFilter = headers.length < filledHeaders.length;
      if (hasColumnFilter) {
        const columnsToKeep: number[] = [];
        filledHeaders.forEach((h, i) => {
          const header = (h || "").toString().toLowerCase();
          if (!header.includes('defense') && !header.includes('conflict')) {
            columnsToKeep.push(i);
          }
        });

        rawRows = rawRows.map(row => columnsToKeep.map(i => row[i] || ''));
      }
    }
    rawRows = trimLeadingEmptyRows(rawRows);

    const schema = inferSchema(detailHeaders, rawRows.slice(0, 5));
    const nextMeta = meta ? { ...meta, headerRowIndex: idx } : (sheetMeta ? { ...sheetMeta, headerRowIndex: idx } : null);

    setHeaderRowIndex(idx);
    setFullHeaders(headers);  // For group detection
    setFullDetailHeaders(detailHeaders);  // Actual column names for UI tier 2
    setTitleRow(titleRow);  // Save titleRow for applyMapping
    setFullRows(rawRows);
    setColumnMap({
      date: schema.mapping.date,
      time: schema.mapping.time,
      person: schema.mapping.person,
      task: schema.mapping.task,
      location: schema.mapping.location,
      email: schema.mapping.email
    });

    if (nextMeta) {
      setSheetMeta(nextMeta);

      // ✅ Use nested mapping strategy for Review mode (idx=2)
      // Pass both titleRow (Row 2 groups) and detailHeaders (Row 3 columns)


      const data = idx === 2 && titleRow.length > 0
        ? googleService.normalizeRowsWithGrouping({
          sheetId: nextMeta.sheetId,
          tab: nextMeta.tab,
          groupHeaders: titleRow,  // Row 2: 'REVIEW 1', 'REVIEW 2', etc.
          detailHeaders,           // Row 3: 'Code', 'Date', 'Reviewer', etc.
          rawRows,
          mapping: schema.mapping,
          headerRowIndex: idx
        })
        : googleService.normalizeRows({
          sheetId: nextMeta.sheetId,
          tab: nextMeta.tab,
          headers: detailHeaders,  // Use detail headers for data mapping
          rawRows,
          mapping: schema.mapping,
          headerRowIndex: idx
        });



      // ✅ Sort by date first (30/1, 31/1, 1/2...), then by time within same date
      const sortedData = data.sort((a, b) => {
        // Parse dates from DD/MM/YYYY format
        const parseDate = (dateStr: string) => {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            return new Date(year, month - 1, day);
          }
          return new Date(dateStr);
        };

        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        const dateDiff = dateA.getTime() - dateB.getTime();

        // If different dates, sort by date
        if (dateDiff !== 0) return dateDiff;

        // Same date, sort by startTime
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });

      setRows(sortedData);
      updateSelections(sortedData);
    } else {
      setRows([]);
      setSelectedIds(new Set());
    }
  };


  const applyMapping = async () => {
    try {

      if (!sheetMeta) {
        setError('Vui lòng tải dữ liệu trước (sheetMeta không tồn tại)');
        console.error('sheetMeta is null');
        return;
      }
      if (fullHeaders.length === 0 || fullRows.length === 0) {
        setError('Không có dữ liệu để mapping (headers hoặc rows trống)');
        console.error('Empty headers or rows:', { headers: fullHeaders.length, rows: fullRows.length });
        return;
      }
      if (columnMap.date === undefined || columnMap.date === null || columnMap.time === undefined || columnMap.time === null) {
        setError('Vui lòng chọn đủ cột Ngày và Thời gian.');
        console.error('Missing date or time mapping:', { date: columnMap.date, time: columnMap.time });
        return;
      }
      console.log('applyMapping proceeding with data...');
      setError(null);

      // ✅ Check if grouping is needed (same logic as applyHeaderRow)

      const data = sheetMeta.headerRowIndex === 2 && titleRow.length > 0
        ? googleService.normalizeRowsWithGrouping({
          sheetId: sheetMeta.sheetId,
          tab: sheetMeta.tab,
          groupHeaders: titleRow,  // Use saved titleRow
          detailHeaders: fullDetailHeaders,  // Use saved detail headers
          rawRows: fullRows,
          mapping: columnMap,
          headerRowIndex: sheetMeta.headerRowIndex
        })
        : googleService.normalizeRows({
          sheetId: sheetMeta.sheetId,
          tab: sheetMeta.tab,
          headers: fullHeaders,
          rawRows: fullRows,
          mapping: columnMap,
          headerRowIndex: sheetMeta.headerRowIndex
        });


      if (data.length === 0) {
        setError('Không tìm thấy dòng nào hợp lệ với ngày và thời gian');
      }

      // ✅ Sort by date first, then time (same as applyHeaderRow)
      const sortedData = data.sort((a, b) => {
        const parseDate = (dateStr: string) => {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            return new Date(year, month - 1, day);
          }
          return new Date(dateStr);
        };

        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        const dateDiff = dateA.getTime() - dateB.getTime();

        if (dateDiff !== 0) return dateDiff;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });


      setRows(sortedData);
      setPersonFilter(''); // Reset filter khi apply mapping

      updateSelections(sortedData);

      // 💾 Save mapping to Firebase for next time
      if (firebaseUser && sheetMeta) {
        try {
          await saveFirebaseMapping(sheetMeta.sheetId, columnMap);
          setToastMessage('✓ Đã lưu mapping cho lần sau');
          console.log('Saved mapping to Firebase:', columnMap);
        } catch (err) {
          console.error('Failed to save mapping to Firebase:', err);
        }
      }
    } catch (e: any) {
      console.error('Error in applyMapping:', e);
      setError(`Lỗi: ${e.message}`);
    }
  };

  const handleLoad = async () => {
    if (!sheetUrl || !accessToken) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { rows: data, headers, rawRows, allRows: fetchedRows, schema, sheetId, headerRowIndex, mergedCells: merged } = await googleService.loadSheet(sheetUrl, tabName, accessToken);
      console.log('Loaded data:', {
        dataCount: data.length,
        headerCount: headers?.length,
        rawRowsCount: rawRows?.length,
        allRowsCount: fetchedRows?.length,
        firstHeader: headers?.[0],
        firstRow: rawRows?.[0],
        mergedCells: merged
      });
      setAllRows(fetchedRows || []);
      setShowFullTable(false);
      setSheetMeta({ sheetId, tab: tabName, headerRowIndex });
      setHeaderRowIndex(headerRowIndex);
      setMergedCells(merged);

      setRows(data);
      setFullHeaders(headers || []);
      setFullRows(rawRows || []);
      setColumnMap({
        date: schema.mapping.date,
        time: schema.mapping.time,
        person: schema.mapping.person,
        task: schema.mapping.task,
        location: schema.mapping.location,
        email: schema.mapping.email
      });

      updateSelections(data);
    } catch (err: any) {
      console.error('Load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleSync = async () => {

    const toSync = rows.filter(r => selectedIds.has(r.id));
    if (toSync.length === 0 || !sheetMeta) return;

    setSyncing(true);
    setError(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      let res: SyncResult;

      // 🚀 Try Apps Script service first (if deployed)
      if (backendUrl && backendUrl !== 'http://localhost:5000') {
        try {
          console.log('Using Apps Script backend:', backendUrl);

          // Convert to Apps Script event format
          const events = toSync.map(row => ({
            title: row.person || row.task || 'Event',
            start: row.startTime,
            end: row.endTime,
            location: row.location,
            description: `Task: ${row.task || 'N/A'}\nEmail: ${row.email || 'N/A'}`,
            guests: row.email
          }));



          const appsScriptResult = await syncEventsToCalendar(events, 'Schedule Teaching');


          // Convert Apps Script response to SyncResult format
          // Note: Apps Script doesn't distinguish between created/updated, only returns success count
          const successCount = appsScriptResult.data?.success || 0;
          res = {
            created: successCount,  // Apps Script combines created + updated
            updated: 0,  // Backend doesn't track this separately
            failed: appsScriptResult.data?.failed || 0,
            logs: appsScriptResult.data?.errors?.map(e => e.message) || []
          };

          setToastMessage(`✓ Đã đồng bộ ${successCount}/${toSync.length} sự kiện`);
        } catch (appsScriptError: any) {
          console.error('Apps Script sync failed, falling back to Calendar API:', appsScriptError);
          // Fallback to direct Calendar API if Apps Script fails
          if (accessToken) {

            res = await googleService.syncToCalendar(toSync, accessToken);

            setToastMessage('✓ Đã đồng bộ qua Calendar API (fallback)');
          } else {
            throw new Error('Không có access token để sử dụng Calendar API');
          }
        }
      } else {
        // 🔄 Fallback: Use direct Calendar API (legacy method)
        console.log('Using direct Calendar API (VITE_BACKEND_URL not configured)');
        if (!accessToken) {
          throw new Error('Cần access token để sử dụng Calendar API');
        }

        res = await googleService.syncToCalendar(toSync, accessToken);

        setToastMessage('✓ Đã đồng bộ qua Calendar API');
      }


      setResult(res);

      // 💾 Save sync history to Firestore (non-blocking - use Promise without await)
      if (firebaseUser && sheetMeta) {

        import('./services/firestoreSyncHistoryService')
          .then(({ firestoreSyncHistoryService }) => {
            return firestoreSyncHistoryService.saveSyncResult(
              firebaseUser.uid,
              sheetMeta.sheetId,
              sheetMeta.tab,
              toSync.length,
              res.created,
              res.updated,
              res.failed
            );
          })
          .then(() => {

          })
          .catch(historyError => {
            console.error('⚠️ Failed to save sync history (non-critical):', historyError);
          });
      }


    } catch (err: any) {
      console.error('❌ Sync error:', err);
      setError(err.message);
    } finally {

      setSyncing(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!personFilter || personFilter.toLowerCase() === 'all') return rows;
    const f = personFilter.toLowerCase();

    // 🔍 Detect sheet name to determine filter columns
    const currentTab = sheetMeta?.tab?.toLowerCase() || '';
    let filterKeywords: string[] = [];

    // ✅ "Data mẫu" sheets (Sheet1, Review1) → Filter by "Reviewer"
    if (currentTab.includes('sheet1') || currentTab.includes('review')) {
      filterKeywords = ['reviewer', 'người đánh giá', 'đánh giá'];
    }
    // ✅ "test1" sheet → Filter by "Thành viên hội đồng"
    else if (currentTab.includes('test')) {
      filterKeywords = ['thành viên', 'hội đồng', 'member'];
    }
    // ⚠️ Fallback: Filter by "GVHD" (old behavior)
    else {
      filterKeywords = ['gvhd', 'giảng viên', 'hướng dẫn'];
    }

    return rows.filter(r => {
      // Search in raw data columns for matching keywords
      const targetColumns = Object.entries(r.raw).filter(([key]) =>
        filterKeywords.some(keyword => key.toLowerCase().includes(keyword))
      );

      if (targetColumns.length > 0) {
        return targetColumns.some(([, value]) => (value as string).toLowerCase().includes(f));
      }

      // Fallback to person/email if no matching column found
      return r.person.toLowerCase().includes(f) || r.email?.toLowerCase().includes(f);
    })
      // ✅ Sort by startTime (chronological order: date + time)
      .sort((a, b) => {
        const timeA = new Date(a.startTime).getTime();
        const timeB = new Date(b.startTime).getTime();
        return timeA - timeB;
      });
  }, [rows, personFilter, sheetMeta]);

  const handleMapChange = (key: keyof ColumnMapping) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setColumnMap(prev => {
      const next = { ...prev };
      if (value === '') {
        delete next[key];
      } else {
        next[key] = Number(value);
      }
      return next;
    });
  };

  const fullTableColumns = useMemo(() => {
    // Lấy số cột tối đa từ tất cả dữ liệu
    const maxColsFromHeaders = fullHeaders.length;
    const maxColsFromData = Math.max(0, ...fullRows.map(r => r.length));
    const maxCols = Math.max(maxColsFromHeaders, maxColsFromData);

    // Nếu có headers, extend headers với "Column X" cho các cột vượt quá
    if (fullHeaders.length > 0) {
      return Array.from({ length: maxCols }, (_, i) =>
        fullHeaders[i] || `Column ${i + 1}`
      );
    }

    // Nếu không có headers, generate generic names
    return Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
  }, [fullHeaders, fullRows]);

  // Filter full table rows by dynamic column detection
  const filteredFullTableRows = useMemo(() => {
    if (!personFilter || personFilter.toLowerCase() === 'all') return fullRows;

    const f = personFilter.toLowerCase();

    // 🔍 Detect sheet name to determine filter columns (same as filteredRows)
    const currentTab = sheetMeta?.tab?.toLowerCase() || '';
    let filterKeywords: string[] = [];

    if (currentTab.includes('sheet1') || currentTab.includes('review')) {
      filterKeywords = ['reviewer', 'người đánh giá', 'đánh giá'];
    } else if (currentTab.includes('test')) {
      filterKeywords = ['thành viên', 'hội đồng', 'member'];
    } else {
      filterKeywords = ['gvhd', 'giảng viên', 'hướng dẫn'];
    }

    const targetColIndices: number[] = [];

    // Find column indices matching filter keywords
    fullTableColumns.forEach((header, index) => {
      const h = header.toLowerCase();
      if (filterKeywords.some(keyword => h.includes(keyword))) {
        targetColIndices.push(index);
      }
    });

    if (targetColIndices.length === 0) return fullRows;

    return fullRows.filter(row => {
      return targetColIndices.some(colIndex => {
        const cellValue = (row[colIndex] || '').toString().toLowerCase();
        return cellValue.includes(f);
      });
    });
  }, [fullRows, fullTableColumns, personFilter, sheetMeta]);

  const headerOptions = useMemo(() => {
    return fullTableColumns.map((h, i) => ({
      label: h || `Column ${i + 1}`,
      value: i
    }));
  }, [fullTableColumns]);

  const headerRowOptions = useMemo(() => {
    // For Review mode: Start from Row 2 (merged headers like "REVIEW 1")
    // Row 2 (index 1) = REVIEW 1, REVIEW 2, DEFENSE, CONFLICT (merged)
    // Row 3 (index 2) = Code, Count, Reviewer 1, Reviewer 2 (detail headers) - DEFAULT
    const startIndex = 1;  // Start from Row 2
    const limit = Math.min(5, allRows.length);  // Only show first 5 rows
    const options = [];

    for (let i = startIndex; i < limit; i++) {
      const preview = (allRows[i] || []).filter(Boolean).slice(0, 4).join(' | ');
      let label = `Row ${i + 1}`;

      // Add descriptive label for Review mode
      if (i === 1) {
        label += ' (Merged Headers)';
      } else if (i === 2) {
        label += ' (Detail Headers)';
      }

      if (preview) {
        label += `: ${preview}`;
      }

      options.push({
        label,
        value: i
      });
    }

    return options;
  }, [allRows]);

  const getColumnLabel = (index?: number) => {
    if (index === undefined) return 'Chưa chọn';
    return fullTableColumns[index] || `Column ${index + 1}`;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center border border-white/20">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg transform hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">Schedule Sync</h1>
            <p className="text-slate-600 mb-8 font-normal leading-relaxed text-sm">Quản lý lịch đồng bộ từ Google Sheets sang Calendar một cách dễ dàng</p>

            {/* Firebase Auth Button */}
            <GoogleLoginButton />

            {error && (
              <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-rose-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
          <p className="text-center text-white/60 text-xs mt-6 font-medium">Sử dụng tài khoản Google của bạn</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      user={user}
      userId={firebaseUser?.uid || ''}
      onLogout={async () => {
        await logout();
        setUser(null);
        setAccessToken(null);
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* Input Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent">
            <h2 className="text-lg font-bold text-slate-900">Tải dữ liệu từ Google Sheet</h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">Nhập URL Sheet và chọn tab để bắt đầu</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Google Sheet URL</label>
              <input
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 placeholder-slate-400"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Tên Tab</label>
              <input
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900"
                value={tabName}
                onChange={e => setTabName(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Lọc theo GVHD</label>
              <input
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 placeholder-slate-400"
                value={personFilter}
                onChange={e => setPersonFilter(e.target.value)}
                placeholder="Nhập tên GVHD"
              />
            </div>
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={async () => {
                  if (!sheetUrl || !accessToken || loadingMode) return;
                  setLoadingMode('test1');
                  setLoading(true);
                  setResult(null);
                  setError(null);
                  try {
                    const { rows: data, headers, rawRows, allRows: fetchedRows, schema, sheetId, headerRowIndex } = await googleService.loadSheetTest1(sheetUrl, tabName, accessToken);
                    setAllRows(fetchedRows || []);
                    setShowFullTable(false);
                    setSheetMeta({ sheetId, tab: tabName, headerRowIndex });

                    // ✅ CRITICAL: Call applyHeaderRow to process merged cells and set up proper column mapping
                    applyHeaderRow(headerRowIndex, fetchedRows, { sheetId, tab: tabName });
                  } catch (err: any) {
                    console.error('Load error:', err);
                    setError(err.message);
                  } finally {
                    setLoading(false);
                    setLoadingMode(null);
                  }
                }}
                disabled={loadingMode !== null}
                  className="flex-1 h-[42px] flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm"
                  title="Cấu trúc phẳng: Header dòng 1, range A1:BE"
                >
                  {loadingMode === 'test1' ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span>📄</span> test1
                    </span>
                  )}
                </button>
              <button
                onClick={async () => {
                  if (!sheetUrl || !accessToken || loadingMode) return;
                  setLoadingMode('review');
                  setLoading(true);
                  setResult(null);
                  setError(null);
                  try {
                    const { rows: data, headers, rawRows, allRows: fetchedRows, schema, sheetId, headerRowIndex } = await googleService.loadSheetReview(sheetUrl, tabName, accessToken);
                    setAllRows(fetchedRows || []);
                    setShowFullTable(false);
                    setSheetMeta({ sheetId, tab: tabName, headerRowIndex });

                    // ✅ CRITICAL: Call applyHeaderRow to process merged cells and set up proper column mapping
                    applyHeaderRow(headerRowIndex, fetchedRows, { sheetId, tab: tabName });
                  } catch (err: any) {
                    console.error('Load error:', err);
                    setError(err.message);
                  } finally {
                    setLoading(false);
                    setLoadingMode(null);
                  }
                }}
                disabled={loadingMode !== null}
                  className="flex-1 h-[42px] flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm"
                  title="Cấu trúc phức tạp: Header dòng 3, range J1:BE"
                >
                  {loadingMode === 'review' ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span>📊</span> Review
                    </span>
                  )}
                </button>
            </div>
          </div>
        </div>

        {fullHeaders.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Chọn cột để đồng bộ</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Bắt buộc: Ngày, Thời gian</p>
              </div>
              <button
                onClick={applyMapping}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm active:scale-95"
              >
                ✓ Áp dụng
              </button>
            </div>
            <div className="p-6 space-y-5">
              {fullRows.length > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-900 mb-3">Chọn dòng Header</label>
                  <select
                    className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-slate-900"
                    value={headerRowIndex}
                    onChange={(e) => applyHeaderRow(Number(e.target.value), allRows)}
                  >
                    {headerRowOptions.map(opt => (
                      <option key={`header-${opt.value}`} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-blue-700 font-medium">💡 Chọn dòng cuối cùng trước dữ liệu</div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">Ngày</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-900"
                    value={columnMap.date ?? ''}
                    onChange={handleMapChange('date')}
                  >
                    <option value="">- Chọn -</option>
                    {headerOptions.map(opt => (
                      <option key={`date-${opt.value}`} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">Thời gian</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-900"
                    value={columnMap.time ?? ''}
                    onChange={handleMapChange('time')}
                  >
                    <option value="">- Chọn -</option>
                    {headerOptions.map(opt => (
                      <option key={`time-${opt.value}`} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">Tên đề tài</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-900"
                    value={columnMap.person ?? ''}
                    onChange={handleMapChange('person')}
                  >
                    <option value="">- Chọn -</option>
                    {headerOptions.map(opt => (
                      <option key={`person-${opt.value}`} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">Phòng</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-900"
                    value={columnMap.location ?? ''}
                    onChange={handleMapChange('location')}
                  >
                    <option value="">- Chọn -</option>
                    {headerOptions.map(opt => (
                      <option key={`location-${opt.value}`} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg text-rose-700 text-sm font-medium flex items-center gap-3 shadow-sm animate-in shake duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-lg flex items-center justify-between shadow-sm animate-in slide-in-from-top-4 duration-300">
            <div>
              <h4 className="font-bold text-emerald-900 text-base">✓ Đồng bộ hoàn tất!</h4>
              <p className="text-emerald-700 text-sm font-medium mt-1">
                Thành công: <span className="font-bold">{result.created}</span> |
                Lỗi: <span className="font-bold">{result.failed}</span>
              </p>
            </div>
            <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap ml-4">Xem Calendar</a>
          </div>
        )}

        {fullRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
            <button
              onClick={() => setShowFullTable(v => !v)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors duration-200"
            >
              <div className="text-left">
                <h3 className="font-bold text-slate-900 text-base">Xem toàn bộ dữ liệu từ Sheet ({fullTableColumns.length} cột)</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Bảng đầy đủ từ A đến BE • {personFilter ? `${filteredFullTableRows.length}/${fullRows.length} dòng` : `${fullRows.length} dòng`} • Click để {showFullTable ? 'thu gọn' : 'mở rộng'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-indigo-600">{showFullTable ? 'Ẩn' : 'Xem'}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`w-5 h-5 text-indigo-600 transition-transform duration-300 ${showFullTable ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>
            {showFullTable && (
              <div className="border-t border-slate-200">
                <div className="overflow-x-auto max-h-96 bg-gradient-to-b from-slate-50/50 to-white">
                  <table className="text-left text-sm border-collapse" style={{ width: `${fullTableColumns.length * 140}px` }}>
                    <thead className="sticky top-0 z-10">
                      {(() => {
                        // 1. Logic tính toán groups dùng chung cho cả 2 hàng header
                        const groups: { name: string; start: number; span: number }[] = [];
                        let currentGroup: string | null = null;

                        fullTableColumns.forEach((h, i) => {
                          const header = (h || "").trim();
                          const isGeneric = header.match(/^Column_\d+$/);

                          if (!isGeneric && header && header === currentGroup) {
                            groups[groups.length - 1].span++;
                          } else if (!isGeneric && header) {
                            currentGroup = header;
                            groups.push({ name: header, start: i, span: 1 });
                          } else {
                            currentGroup = null;
                          }
                        });

                        const hasGroups = groups.some(g => g.span > 1);
                        const detailRowStickyTop = hasGroups ? 'top-[42px]' : 'top-0';

                        return (
                          <>
                            {/* Hàng 1: Merged/Grouped Headers */}
                            {hasGroups && (
                              <tr className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-bold uppercase tracking-wide border-b-2 border-indigo-800 sticky top-0 z-20">
                                {fullTableColumns.map((_, i) => {
                                  const group = groups.find(g => g.start === i);
                                  if (group && group.span > 1) {
                                    return (
                                      <th
                                        key={`group-${i}`}
                                        colSpan={group.span}
                                        className="px-3 py-2.5 border-r border-indigo-500 text-center"
                                      >
                                        <div className="font-extrabold text-sm truncate">{group.name}</div>
                                      </th>
                                    );
                                  }
                                  if (groups.some(g => i > g.start && i < g.start + g.span)) {
                                    return null; // Bỏ qua ô đã bị merge bởi colSpan
                                  }
                                  return (
                                    <th key={`empty-group-${i}`} className="px-3 py-2.5 border-r border-indigo-500" />
                                  );
                                })}
                              </tr>
                            )}

                            {/* Hàng 2: Detail Headers (Dòng 3 gốc) */}
                            <tr className={`bg-slate-100 text-[10px] font-semibold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300 sticky ${detailRowStickyTop} z-10`}>
                              {(fullDetailHeaders.length > 0 ? fullDetailHeaders : fullTableColumns).map((h, i) => {
                                const isSelected =
                                  i === columnMap.date ||
                                  i === columnMap.time ||
                                  i === columnMap.person ||
                                  i === columnMap.task ||
                                  i === columnMap.location ||
                                  i === columnMap.email;

                                return (
                                  <th
                                    key={`detail-${i}`}
                                    className={`px-3 py-3 border-r border-slate-200 ${isSelected ? 'bg-indigo-100 text-indigo-900 font-black' : ''}`}
                                    style={{ minWidth: '140px', maxWidth: '140px' }}
                                  >
                                    <div className="truncate text-xs">{h || `Col ${i + 1}`}</div>
                                  </th>
                                );
                              })}
                            </tr>
                          </>
                        );
                      })()}
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredFullTableRows.slice(0, 10).map((row, ri) => (
                        <tr key={ri} className="hover:bg-indigo-50/30 transition-colors duration-150">
                          {fullTableColumns.map((_, ci) => (
                            <td
                              key={ci}
                              className={`px-3 py-2.5 border-r border-slate-100 ${ci === columnMap.date ||
                                ci === columnMap.time ||
                                ci === columnMap.person ||
                                ci === columnMap.task ||
                                ci === columnMap.location ||
                                ci === columnMap.email
                                ? 'bg-indigo-50/50 font-semibold text-indigo-900'
                                : 'text-slate-700'
                                }`}
                              style={{ minWidth: '140px', maxWidth: '140px' }}
                            >
                              <div className="truncate text-xs">{(row[ci] || '').toString().substring(0, 50)}</div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredFullTableRows.length > 10 && (
                    <div className="p-4 text-center text-xs text-slate-600 border-t-2 border-slate-200 bg-slate-50 font-medium">
                      📊 Hiển thị 10/{filteredFullTableRows.length} dòng {personFilter ? '(đã lọc)' : 'đầu tiên'} • {fullTableColumns.length} cột (A-{String.fromCharCode(64 + Math.ceil(fullTableColumns.length / 26))}{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[fullTableColumns.length % 26]})
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-500">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-transparent">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Dữ liệu sẵn sàng ({filteredRows.length} mục)</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">✓ Mapping đã áp dụng • Chọn {selectedIds.size}/{filteredRows.length} mục</p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing || selectedIds.size === 0}
                className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
              >
                {syncing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Đang đồng bộ...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
                    Đồng bộ lên Calendar
                  </>
                )}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-20 bg-gradient-to-r from-slate-50 to-slate-50">
                  <tr className="text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-5 py-4 text-center w-12">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filteredRows.map(r => r.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    {columnMap.date !== undefined && <th className="px-5 py-4">Ngày</th>}
                    {columnMap.time !== undefined && <th className="px-5 py-4">Thời gian</th>}
                    <th className="px-5 py-4">Review</th>
                    {columnMap.person !== undefined && <th className="px-5 py-4">Giảng viên</th>}
                    {columnMap.location !== undefined && <th className="px-5 py-4">Phòng</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map(row => (
                    <tr
                      key={row.id}
                      className={`hover:bg-indigo-50/50 transition-colors duration-200 ${selectedIds.has(row.id) ? 'bg-indigo-50' : ''}`}
                    >
                      <td className="px-5 py-4 text-center">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={selectedIds.has(row.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      {columnMap.date !== undefined && (
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {row.date}
                        </td>
                      )}
                      {columnMap.time !== undefined && (
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{row.startTime.split('T')[1].substring(0, 5)}</div>
                          <div className="text-slate-500 text-xs">→ {row.endTime.split('T')[1].substring(0, 5)}</div>
                        </td>
                      )}
                      <td className="px-5 py-4">
                        {row.groupName ? (
                          <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
                            {row.groupName}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      {columnMap.person !== undefined && (
                        <td className="px-5 py-4 font-semibold text-slate-900 max-w-xs truncate" title={row.person}>
                          {row.person}
                        </td>
                      )}
                      {columnMap.location !== undefined && (
                        <td className="px-5 py-4 text-slate-600">
                          {row.location}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRows.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-medium italic">
                Không có dữ liệu khớp với bộ lọc
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-indigo-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </Layout>
  );
};

export default App;