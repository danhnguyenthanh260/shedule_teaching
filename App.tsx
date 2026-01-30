
import React, { useState, useMemo, useEffect } from 'react';
import { RowNormalized, UserProfile, SyncResult, ColumnMapping } from './types';
import { inferSchema } from './lib/inference';
import { googleService } from './services/googleService';
import { syncHistoryService } from './services/syncHistoryService';
import { MergedCellGroup } from './lib/headerParser';
import Layout from './components/Layout';

// Khai báo kiểu cho SDK Google
declare global {
  interface Window {
    google: any;
  }
}

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [tabName, setTabName] = useState('Sheet1');
  const [personFilter, setPersonFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState<RowNormalized[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [fullHeaders, setFullHeaders] = useState<string[]>([]);
  const [fullRows, setFullRows] = useState<string[][]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [showFullTable, setShowFullTable] = useState(false);
  const [columnMap, setColumnMap] = useState<ColumnMapping>({});
  const [sheetMeta, setSheetMeta] = useState<{ sheetId: string; tab: string; headerRowIndex: number } | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [mergedCells, setMergedCells] = useState<MergedCellGroup[]>([]);

  // Get redirect URI (env override -> dynamic)
  const getRedirectUri = (): string => {
    const envRedirect = (import.meta as any).env?.VITE_REDIRECT_URI?.trim();
    if (envRedirect) return envRedirect;

    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDevelopment) {
      return 'http://localhost:3000/callback.html';
    }
    // For production (Vercel)
    return `${window.location.protocol}//${window.location.host}/callback.html`;
  };

  // Restore session từ localStorage khi app load
  useEffect(() => {
    const savedToken = localStorage.getItem('accessToken');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        setAccessToken(savedToken);
        setUser(JSON.parse(savedUser));
        setPersonFilter(JSON.parse(savedUser).name);
      } catch (err) {
        console.error('Failed to restore session:', err);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
      }
    }
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // The Google script has loaded, now we can initialize the client.
      if (window.google) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          redirect_uri: getRedirectUri(),
          callback: (response: any) => {
            if (response.error) {
              setError('Lỗi đăng nhập: ' + response.error);
              return;
            }
            setAccessToken(response.access_token);
            fetchUserProfile(response.access_token);
          },
        });
        setTokenClient(client);
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const fetchUserProfile = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profile = await res.json();
      const userProfile = {
        name: profile.name,
        email: profile.email,
        image: profile.picture
      };
      setUser(userProfile);
      setPersonFilter(profile.name);

      // 💾 Lưu vào localStorage để persist qua F5
      localStorage.setItem('accessToken', token);
      localStorage.setItem('user', JSON.stringify(userProfile));
    } catch (e) {
      setError('Không thể lấy thông tin profile.');
    }
  };

  const handleLogin = () => {
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      setError('Google SDK chưa sẵn sàng. Hãy thử lại sau giây lát.');
    }
  };

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

  const applyHeaderRow = (idx: number, rows: string[][], meta?: { sheetId: string; tab: string }) => {
    const selectedRow = rows[idx] || [];
    let headers = selectedRow;
    let dataStartIndex = idx + 1;

    if (looksLikeDataRow(selectedRow) && idx > 0) {
      headers = rows[idx - 1] || [];
      dataStartIndex = idx;
    } else {
      const nextRow = rows[idx + 1] || [];
      if (looksLikeHeaderRow(nextRow)) {
        headers = mergeHeaderRows(selectedRow, nextRow);
        dataStartIndex = idx + 2;
      }
    }

    let rawRows = rows.slice(dataStartIndex);
    rawRows = trimLeadingEmptyRows(rawRows);
    const schema = inferSchema(headers, rawRows.slice(0, 5));
    const nextMeta = meta ? { ...meta, headerRowIndex: idx } : (sheetMeta ? { ...sheetMeta, headerRowIndex: idx } : null);

    setHeaderRowIndex(idx);
    setFullHeaders(headers);
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
      const data = googleService.normalizeRows({
        sheetId: nextMeta.sheetId,
        tab: nextMeta.tab,
        headers,
        rawRows,
        mapping: schema.mapping,
        headerRowIndex: idx
      });
      setRows(data);
      updateSelections(data);
    } else {
      setRows([]);
      setSelectedIds(new Set());
    }
  };

  const applyMapping = () => {
    try {
      console.log('applyMapping called:', { sheetMeta, columnMap, fullHeaders: fullHeaders.length, fullRows: fullRows.length });
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
      const data = googleService.normalizeRows({
        sheetId: sheetMeta.sheetId,
        tab: sheetMeta.tab,
        headers: fullHeaders,
        rawRows: fullRows,
        mapping: columnMap,
        headerRowIndex: sheetMeta.headerRowIndex
      });
      console.log('Normalized data:', data.length, 'rows');
      console.log('First row:', data[0]);
      if (data.length === 0) {
        setError('Không tìm thấy dòng nào hợp lệ với ngày và thời gian');
      }
      console.log('Setting rows state to:', data);
      setRows(data);
      setPersonFilter(''); // Reset filter khi apply mapping
      console.log('After setRows, rows state should be updated');
      updateSelections(data);
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
    if (toSync.length === 0 || !accessToken || !sheetMeta) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await googleService.syncToCalendar(toSync, accessToken);
      setResult(res);

      // Save sync history to database (non-blocking)
      await syncHistoryService.saveSyncResult(
        sheetMeta.sheetId,
        sheetMeta.tab,
        toSync,
        res,
        accessToken
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!personFilter || personFilter.toLowerCase() === 'all') return rows;
    const f = personFilter.toLowerCase();
    return rows.filter(r => {
      // Search in all raw data columns for GVHD match
      const gvhdColumns = Object.entries(r.raw).filter(([key]) =>
        key.toLowerCase().includes('gvhd') ||
        key.toLowerCase().includes('giảng viên') ||
        key.toLowerCase().includes('hướng dẫn')
      );

      if (gvhdColumns.length > 0) {
        return gvhdColumns.some(([, value]) => (value as string).toLowerCase().includes(f));
      }

      // Fallback to person/email if no GVHD column found
      return r.person.toLowerCase().includes(f) || r.email?.toLowerCase().includes(f);
    });
  }, [rows, personFilter]);

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

  // Filter full table rows by GVHD
  const filteredFullTableRows = useMemo(() => {
    if (!personFilter || personFilter.toLowerCase() === 'all') return fullRows;

    const f = personFilter.toLowerCase();
    const gvhdColIndices: number[] = [];

    // Find GVHD column indices
    fullTableColumns.forEach((header, index) => {
      const h = header.toLowerCase();
      if (h.includes('gvhd') || h.includes('giảng viên') || h.includes('hướng dẫn')) {
        gvhdColIndices.push(index);
      }
    });

    if (gvhdColIndices.length === 0) return fullRows;

    return fullRows.filter(row => {
      return gvhdColIndices.some(colIndex => {
        const cellValue = (row[colIndex] || '').toString().toLowerCase();
        return cellValue.includes(f);
      });
    });
  }, [fullRows, fullTableColumns, personFilter]);

  const headerOptions = useMemo(() => {
    return fullTableColumns.map((h, i) => ({
      label: h || `Column ${i + 1}`,
      value: i
    }));
  }, [fullTableColumns]);

  const headerRowOptions = useMemo(() => {
    const limit = Math.min(10, allRows.length);
    return Array.from({ length: limit }, (_, i) => {
      const preview = (allRows[i] || []).filter(Boolean).slice(0, 4).join(' | ');
      return {
        label: `Row ${i + 1}${preview ? `: ${preview}` : ''}`,
        value: i
      };
    });
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
            <button
              onClick={handleLogin}
              className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              Đăng nhập với Google
            </button>
            {error && (
              <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-rose-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
          <p className="text-center text-white/60 text-xs mt-6 font-medium">Sử dụng tài khoản @fe.edu.vn của bạn</p>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={() => {
      setUser(null);
      setAccessToken(null);
      // 🗑️ Clear localStorage khi logout
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    }}>
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
            <div className="md:col-span-2 flex items-end">
              <button
                onClick={handleLoad}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
                ) : '🔄 Tải'}
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
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm active:scale-95"
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
                Thêm: <span className="font-bold">{result.created}</span> |
                Cập nhật: <span className="font-bold">{result.updated}</span> |
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
                      {/* Merged header row (chỉ hiển thị khi thực sự có multi-row headers) */}
                      {mergedCells && mergedCells.length > 0 && headerRowIndex > 0 && mergedCells.some(group => group.name && group.name.trim().length > 0) && (
                        <tr className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-[11px] font-bold text-white uppercase tracking-wider border-b-2 border-indigo-700 shadow-sm">
                          {mergedCells.map((group, gIdx) => {
                            const colSpan = group.colCount;
                            return (
                              <th
                                key={gIdx}
                                colSpan={colSpan}
                                className="px-3 py-3 border-r border-indigo-400/30 text-center"
                                style={{ minWidth: `${colSpan * 140}px` }}
                              >
                                <div className="truncate font-bold">{group.name}</div>
                              </th>
                            );
                          })}
                        </tr>
                      )}
                      {/* Detail header row */}
                      <tr className={`bg-slate-100 text-[10px] font-semibold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300 sticky ${mergedCells && mergedCells.length > 0 && headerRowIndex > 0 && mergedCells.some(group => group.name && group.name.trim().length > 0) ? 'top-[40px]' : 'top-0'} z-10`}>
                        {fullTableColumns.map((h, i) => {
                          const isSelected =
                            i === columnMap.date ||
                            i === columnMap.time ||
                            i === columnMap.person ||
                            i === columnMap.task ||
                            i === columnMap.location ||
                            i === columnMap.email;

                          return (
                            <th
                              key={i}
                              className={`px-3 py-3 border-r border-slate-200 ${isSelected ? 'bg-indigo-100 text-indigo-900 font-black' : ''
                                }`}
                              style={{ minWidth: '140px', maxWidth: '140px' }}
                            >
                              <div className="truncate text-xs">{h || `Col ${i + 1}`}</div>
                            </th>
                          );
                        })}
                      </tr>
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
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gradient-to-r from-slate-50 to-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
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
                    {columnMap.person !== undefined && <th className="px-5 py-4">Tên đề tài</th>}
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
    </Layout>
  );
};

export default App;
