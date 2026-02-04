
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import { ExcelImport } from './components/ExcelImport';
import { MappingTool } from './components/MappingTool';
import { ScheduleTable } from './components/ScheduleTable';
import { StatusAlerts } from './components/StatusAlerts';
import { LoginScreen } from './components/LoginScreen';
import SyncHistoryModal from './components/SyncHistoryModal';
import { useFirebase } from './context/FirebaseContext';
import { useSheetLogic } from './hooks/useSheetLogic';
import { useFirebaseMapping } from './hooks/useFirebaseMapping';
import { useAppPersistence } from './hooks/useAppPersistence';

const App: React.FC = () => {
  const { user: firebaseUser, loading: authLoading, logout } = useFirebase();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [refreshHistory, setRefreshHistory] = useState(0);

  // Map Firebase User to UserProfile for Layout
  const userProfile = useMemo(() => ({
    name: firebaseUser?.displayName || 'User',
    email: firebaseUser?.email || '',
    image: firebaseUser?.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser?.displayName || 'U'}&background=random`
  }), [firebaseUser]);

  // Persistence (localStorage)
  const persistence = useAppPersistence();
  const {
    sheetUrl, setSheetUrl,
    tabName, setTabName,
    sheetMeta, setSheetMeta,
    headerRowIndex, setHeaderRowIndex,
    columnMap, setColumnMap,
    personFilter, setPersonFilter,
    allRows, setAllRows,
    fullHeaders, setFullHeaders,
    fullDetailHeaders, setFullDetailHeaders,
    titleRow, setTitleRow,
    fullRows, setFullRows,
    selectedIds, setSelectedIds,
  } = persistence;

  // Firebase Mapping Sync
  const { mapping: savedMapping, saveMapping: saveFirebaseMapping } = useFirebaseMapping(sheetMeta?.sheetId);

  // Business Logic
  const sheetLogic = useSheetLogic({
    ...persistence,
    firebaseAccessToken: null, // Using Firebase Auth user instead
    firebaseUser,
    personFilter
  });

  const {
    loading, setLoading,
    syncing, setSyncing,
    rows, setRows,
    result, setResult,
    error, setError,
    toastMessage, setToastMessage,
    applyHeaderRow,
    applyMapping,
    handleSync,
    showToast,
    headerOptions,
    headerRowOptions,
    filteredRows,
    updateSelections
  } = sheetLogic;

  // ✅ 1. LOAD mapping ONLY once when sheet changes
  const lastLoadedSheetId = useRef<string | null>(null);
  useEffect(() => {
    if (sheetMeta?.sheetId && sheetMeta.sheetId !== lastLoadedSheetId.current) {
      if (savedMapping && Object.keys(savedMapping).length > 0) {
        setColumnMap(savedMapping);
        lastLoadedSheetId.current = sheetMeta.sheetId;
        console.log('✓ Restored mapping for sheet:', sheetMeta.sheetId);
      }
    }
  }, [savedMapping, sheetMeta?.sheetId, setColumnMap]);

  // ✅ 2. SAVE mapping only when manually applied (controlled in useSheetLogic)
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  return (
    <Layout 
      user={userProfile} 
      userId={firebaseUser.uid}
      onLogout={logout}
      syncHistoryRefresh={refreshHistory}
    >
    <div className="h-full flex flex-col gap-4 animate-in fade-in duration-700 relative overflow-hidden text-slate-900 bg-slate-50/50">
      {/* Header Section: Steps 1 & 2 side-by-side (Approx 1/4 of screen) */}
      <div className="flex-none grid grid-cols-1 lg:grid-cols-12 gap-3 max-h-[28%]">
        {/* Step 1: Import */}
        <section className="lg:col-span-5 bg-white/80 backdrop-blur-sm p-3 rounded-2xl shadow-sm border border-indigo-50 flex flex-col transition-all hover:shadow-md hover:border-indigo-100 overflow-hidden">
          <h2 className="text-[9px] font-extrabold text-indigo-500 mb-1.5 flex items-center gap-2 uppercase tracking-[0.2em] flex-none">
            <span className="w-4 h-4 bg-indigo-600 text-white rounded-md flex items-center justify-center text-[9px] shadow-sm font-black">1</span>
            Dữ liệu
          </h2>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            <ExcelImport
              onDataLoaded={(data) => {
                setAllRows(data.rawRows);
                const meta = { 
                  sheetId: data.sheetId, 
                  tab: data.tabName, 
                  isDataMau: data.isDataMau,
                  headerRowIndex: data.headerRowIndex 
                };
                setSheetMeta(meta);
                applyHeaderRow(data.headerRowIndex, data.rawRows, { sheetId: data.sheetId, tab: data.tabName });
                if (columnMap && Object.keys(columnMap).length >= 2) applyMapping(columnMap, data.isDataMau);
                setLoading(false);
                showToast(`✓ Đã tải ${data.rawRows.length} dòng dữ liệu`);
              }}
              setLoading={setLoading}
              setError={setError}
              sheetUrl={sheetUrl}
              setSheetUrl={setSheetUrl}
              tabName={tabName}
              setTabName={setTabName}
            />
          </div>
        </section>

        {/* Step 2: Mapping */}
        {allRows.length > 0 ? (
          <section className="lg:col-span-7 bg-white/80 backdrop-blur-sm p-3 rounded-2xl shadow-sm border border-violet-50 flex flex-col animate-in slide-in-from-right-4 duration-500 transition-all hover:shadow-md hover:border-violet-100 overflow-hidden">
            <h2 className="text-[9px] font-extrabold text-violet-500 mb-1.5 flex items-center gap-2 uppercase tracking-[0.2em] flex-none">
              <span className="w-4 h-4 bg-violet-600 text-white rounded-md flex items-center justify-center text-[9px] shadow-sm font-black">2</span>
              Cấu hình
            </h2>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <MappingTool
                headers={headerOptions}
                headerRowOptions={headerRowOptions}
                headerRowIndex={headerRowIndex}
                onHeaderRowChange={(idx) => applyHeaderRow(idx, allRows)}
                columnMap={columnMap}
                setColumnMap={setColumnMap}
                onApply={() => {
                  applyMapping(columnMap, sheetMeta?.isDataMau || false);
                  if (sheetMeta?.sheetId) saveFirebaseMapping(sheetMeta.sheetId, columnMap);
                }}
                isLoading={loading}
              />
            </div>
          </section>
        ) : (
          <div className="lg:col-span-7 bg-slate-100/50 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center p-4 grayscale opacity-60">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Hoàn thành bước 1 để cấu hình</p>
          </div>
        )}
      </div>

      {/* Step 3: Preview & Sync (Approx 3/4 of screen) */}
      {allRows.length > 0 && (
        <section className="flex-1 min-h-0 bg-white p-3 rounded-2xl shadow-xl shadow-indigo-50/20 border border-slate-100 flex flex-col animate-in slide-in-from-bottom-4 duration-700 overflow-hidden relative">
          <div className="flex-none flex items-center justify-between gap-3 mb-2 border-b border-slate-50 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-[10px] shadow-lg shadow-indigo-200 font-black">3</div>
              <div>
                <h2 className="text-sm font-black text-slate-800 tracking-tight leading-tight">Kiểm tra & Đồng bộ</h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Đã sẵn sàng: {filteredRows.length}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative group">
                <div className="absolute left-3 top-2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Lọc tên giảng viên..."
                  className="pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none w-56 transition-all focus:bg-white font-semibold text-slate-700 shadow-inner placeholder:text-slate-300"
                  value={personFilter}
                  onChange={(e) => {
                    setPersonFilter(e.target.value);
                    updateSelections(rows, e.target.value);
                  }}
                />
              </div>

              <button
                onClick={handleSync}
                disabled={syncing || selectedIds.size === 0}
                className="px-5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black hover:from-indigo-700 hover:to-violet-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 text-[11px] uppercase tracking-wider"
              >
                {syncing ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Đồng bộ ({selectedIds.size})
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-50 bg-slate-50/30">
            {rows.length > 0 ? (
              <ScheduleTable
                rows={filteredRows}
                selectedIds={selectedIds}
                onToggleSelect={(id) => {
                  const newIds = new Set(selectedIds);
                  if (newIds.has(id)) newIds.delete(id);
                  else newIds.add(id);
                  setSelectedIds(newIds);
                }}
                onToggleAll={() => {
                  if (selectedIds.size === filteredRows.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(filteredRows.map(r => r.id)));
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-white">
                <div className="w-20 h-20 bg-indigo-50/50 rounded-full flex items-center justify-center mb-4 text-indigo-300 animate-pulse">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-slate-400 font-extrabold text-xs uppercase tracking-[0.3em]">Đang đợi dữ liệu...</h3>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Global Components */}
      <StatusAlerts result={result} error={error} />
      
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-500 flex items-center gap-3 z-[100]">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
          <span className="text-xs font-bold tracking-tight">{toastMessage}</span>
        </div>
      )}

      {/* Global Components */}
      <StatusAlerts result={result} error={error} />
      
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 flex items-center gap-2 z-[60] border border-slate-800">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-[11px] font-bold">{toastMessage}</span>
        </div>
      )}

        <SyncHistoryModal 
          isOpen={isHistoryOpen} 
          onClose={() => setIsHistoryOpen(false)} 
          userId={firebaseUser.uid}
          refreshTrigger={refreshHistory}
        />
      </div>
    </Layout>
  );
};

export default App;