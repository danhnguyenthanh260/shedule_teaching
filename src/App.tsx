
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useFirebase } from './context/FirebaseContext';
import { LoginScreen } from './components/LoginScreen';
import { AdminPage } from './pages/AdminPage';
import { LecturerApp } from './LecturerApp';
import { isAdmin } from './config/admin';

const App: React.FC = () => {
  const { user: firebaseUser, loading: authLoading } = useFirebase();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpt-orange"></div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/admin" 
          element={isAdmin(firebaseUser.email) ? <AdminPage /> : <Navigate to="/" />} 
        />
        <Route path="/" element={<LecturerApp />} />
        {/* Redirect any other route to home */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;