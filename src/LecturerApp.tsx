
import React, { useMemo } from 'react';
import Layout from './components/Layout';
import { useFirebase } from './context/FirebaseContext';
import { useAppPersistence } from './hooks/useAppPersistence';
import { LecturerDashboard } from './features/schedule-sync/pages/LecturerDashboard';

export const LecturerApp: React.FC = () => {
  const { user: firebaseUser, logout } = useFirebase();
  const persistence = useAppPersistence();

  // Map Firebase User to UserProfile for Layout
  const userProfile = useMemo(() => ({
    name: firebaseUser?.displayName || 'Giảng viên',
    email: firebaseUser?.email || '',
    image: firebaseUser?.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser?.displayName || 'G'}&background=random`
  }), [firebaseUser]);

  return (
    <Layout
      user={userProfile}
      userId={firebaseUser?.uid || 'guest'}
      onLogout={() => {
        persistence.clearPersistence();
        logout();
      }}
      syncHistoryRefresh={0}
    >
      <LecturerDashboard />
    </Layout>
  );
};
