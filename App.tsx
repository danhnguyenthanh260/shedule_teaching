
import React, { useState, useMemo, useEffect } from 'react';
import { RowNormalized, UserProfile, SyncResult, ColumnMapping } from './types';
import { inferSchema } from './lib/inference';
import { googleService } from './services/googleService';
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
      setUser({
        name: profile.name,
        email: profile.email,
        image: profile.picture
      });
      setPersonFilter(profile.name);
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

  const applyHeaderRow = (idx: number, rows: string[][], meta?: { sheetId: string; tab: string }) => {
    const headers = rows[idx] || [];
    const rawRows = rows.slice(idx + 1);
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
    if (!sheetMeta) return;
    if (columnMap.date === undefined || columnMap.time === undefined) {
      setError('Vui lòng chọn đủ cột Ngày và Thời gian.');
      return;
    }
    setError(null);
    const data = googleService.normalizeRows({
      sheetId: sheetMeta.sheetId,
      tab: sheetMeta.tab,
      headers: fullHeaders,
      rawRows: fullRows,
      mapping: columnMap,
      headerRowIndex: sheetMeta.headerRowIndex
    });
    setRows(data);
    updateSelections(data);
  };

  const handleLoad = async () => {
    if (!sheetUrl || !accessToken) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { rows: data, headers, rawRows, allRows: fetchedRows, schema, sheetId, headerRowIndex } = await googleService.loadSheet(sheetUrl, tabName, accessToken);
      setAllRows(fetchedRows || []);
      setShowFullTable(false);
      setSheetMeta({ sheetId, tab: tabName, headerRowIndex });
      setHeaderRowIndex(headerRowIndex);

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const toSync = rows.filter(r => selectedIds.has(r.id));
    if (toSync.length === 0 || !accessToken) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await googleService.syncToCalendar(toSync, accessToken);
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!personFilter || personFilter.toLowerCase() === 'all') return rows;
    const f = personFilter.toLowerCase();
    return rows.filter(r => r.person.toLowerCase().includes(f) || r.email?.toLowerCase().includes(f));
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
    const maxCols = Math.max(fullHeaders.length, ...fullRows.map(r => r.length));
    if (fullHeaders.length > 0) return fullHeaders;
    return Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
  }, [fullHeaders, fullRows]);

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Schedule Sync</h1>
          <p className="text-slate-500 mb-8 font-medium">Đăng nhập tài khoản @fe.edu.vn để truy cập Google Sheets & Calendar.</p>
          <button onClick={handleLogin} className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95">
             Tiếp tục với Google
          </button>
          {error && <p className="mt-4 text-rose-500 text-sm font-medium">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={() => { setUser(null); setAccessToken(null); }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Google Sheet URL</label>
            <input 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium" 
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tên Tab</label>
            <input 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium" 
              value={tabName} onChange={e => setTabName(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Lọc theo Tên/Email</label>
            <input 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium" 
              value={personFilter} onChange={e => setPersonFilter(e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn A"
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button 
              onClick={handleLoad} disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50 transition-all active:scale-95"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
              ) : 'Tải dữ liệu'}
            </button>
          </div>
        </div>

        {allRows.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Chọn cột để đồng bộ Calendar</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Bắt buộc: Ngày, Thời gian</p>
              </div>
              <button
                onClick={applyMapping}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
              >
                Áp dụng mapping
              </button>
            </div>
            {allRows.length > 0 && (
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Header row</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={headerRowIndex}
                  onChange={(e) => applyHeaderRow(Number(e.target.value), allRows)}
                >
                  {headerRowOptions.map(opt => (
                    <option key={`header-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-slate-500">
                  Chọn dòng chứa tiêu đề cột (ví dụ dòng 3).
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cột Ngày</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={columnMap.date ?? ''}
                  onChange={handleMapChange('date')}
                >
                  <option value="">Chưa chọn</option>
                  {headerOptions.map(opt => (
                    <option key={`date-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cột Thời gian</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={columnMap.time ?? ''}
                  onChange={handleMapChange('time')}
                >
                  <option value="">Chưa chọn</option>
                  {headerOptions.map(opt => (
                    <option key={`time-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cột Tên người</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={columnMap.person ?? ''}
                  onChange={handleMapChange('person')}
                >
                  <option value="">Chưa chọn</option>
                  {headerOptions.map(opt => (
                    <option key={`person-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cột Địa điểm</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={columnMap.location ?? ''}
                  onChange={handleMapChange('location')}
                >
                  <option value="">Chưa chọn</option>
                  {headerOptions.map(opt => (
                    <option key={`location-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cột Công việc</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={columnMap.task ?? ''}
                  onChange={handleMapChange('task')}
                >
                  <option value="">Chưa chọn</option>
                  {headerOptions.map(opt => (
                    <option key={`task-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cột Email</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  value={columnMap.email ?? ''}
                  onChange={handleMapChange('email')}
                >
                  <option value="">Chưa chọn</option>
                  {headerOptions.map(opt => (
                    <option key={`email-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Bước tiếp theo</div>
                <div className="text-slate-900 font-bold">Chọn dòng trong bảng rồi bấm “Đồng bộ lên Calendar”.</div>
                <div className="text-xs text-slate-500 font-medium">Đã chọn: {selectedIds.size} dòng</div>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing || selectedIds.size === 0}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 transition-all active:scale-95"
              >
                {syncing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : 'Đồng bộ lên Calendar'}
              </button>
            </div>

            <div className="mt-6 p-4 rounded-2xl border border-slate-100 bg-slate-50/70">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Xem trước dữ liệu</div>
                  <div className="text-slate-900 font-bold">Số dòng hợp lệ: {rows.length}</div>
                </div>
              </div>
              {rows.length === 0 && (
                <div className="mt-3 text-sm text-slate-600">
                  Chưa có dòng nào hợp lệ. Kiểm tra lại mapping hoặc dữ liệu theo định dạng:
                  <div className="mt-2 text-xs text-slate-500">
                    Ngày: {getColumnLabel(columnMap.date)} | Thời gian: {getColumnLabel(columnMap.time)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-700 text-sm font-medium flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        {result && (
          <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-center justify-between animate-in zoom-in-95 duration-300">
            <div>
              <h4 className="font-bold text-emerald-900">Đồng bộ hoàn tất!</h4>
              <p className="text-emerald-700 text-sm font-medium">
                Thêm mới: <span className="font-black">{result.created}</span> | 
                Cập nhật: <span className="font-black">{result.updated}</span> | 
                Lỗi: <span className="font-black">{result.failed}</span>
              </p>
            </div>
            <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="bg-white px-5 py-2.5 rounded-xl text-indigo-600 font-bold border border-slate-200 shadow-sm hover:bg-indigo-50 transition-colors">Xem Google Calendar</a>
          </div>
        )}

        {fullRows.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Xem toàn bộ dữ liệu từ Sheet</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Bảng đầy đủ tất cả cột theo header</p>
              </div>
              <button
                onClick={() => setShowFullTable(v => !v)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
              >
                {showFullTable ? 'Ẩn bảng' : 'Xem đầy đủ'}
              </button>
            </div>
            {showFullTable && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {fullTableColumns.map((h, i) => (
                        <th key={i} className="px-4 py-4">{h || `Column ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fullRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-indigo-50/20 transition-colors">
                        {fullTableColumns.map((_, ci) => (
                          <td key={ci} className="px-4 py-4 text-sm text-slate-700 whitespace-nowrap">
                            {row[ci] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Xem trước dữ liệu ({filteredRows.length} bản ghi)</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Đã chọn {selectedIds.size} mục để đồng bộ</p>
              </div>
              <button 
                onClick={handleSync} disabled={syncing || selectedIds.size === 0}
                className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center gap-3 transition-all active:scale-95"
              >
                {syncing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>}
                Đồng bộ lên Calendar
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="p-6 w-12 text-center">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filteredRows.map(r => r.id)));
                          else setSelectedIds(new Set());
                        }} 
                      />
                    </th>
                    <th className="px-4 py-6">Thời gian</th>
                    <th className="px-4 py-6">Công việc</th>
                    <th className="px-4 py-6">Nhân sự</th>
                    <th className="px-4 py-6">Phòng/Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map(row => (
                    <tr key={row.id} className={`hover:bg-indigo-50/20 transition-colors ${selectedIds.has(row.id) ? 'bg-indigo-50/40' : ''}`}>
                      <td className="p-6 text-center">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedIds.has(row.id)} 
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            setSelectedIds(next);
                          }} 
                        />
                      </td>
                      <td className="px-4 py-6">
                        <div className="font-bold text-slate-900 text-sm">{row.date}</div>
                        <div className="text-indigo-600 font-bold text-[11px] mt-1 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">
                          {row.startTime.split('T')[1].substring(0,5)} - {row.endTime.split('T')[1].substring(0,5)}
                        </div>
                      </td>
                      <td className="px-4 py-6 font-semibold text-slate-700 text-sm max-w-[200px] truncate" title={row.task}>
                        {row.task}
                      </td>
                      <td className="px-4 py-6">
                        <div className="font-bold text-slate-900 text-sm">{row.person}</div>
                        <div className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter mt-1">{row.email}</div>
                      </td>
                      <td className="px-4 py-6 font-medium text-slate-500 italic text-sm">
                        {row.location}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRows.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-medium italic">
                Không có dữ liệu khớp với bộ lọc hiện tại.
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default App;
