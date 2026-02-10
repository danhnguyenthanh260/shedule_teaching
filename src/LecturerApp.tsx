
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
    name: firebaseUser?.displayName || 'User',
    email: firebaseUser?.email || '',
    image: firebaseUser?.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser?.displayName || 'U'}&background=random`
  }), [firebaseUser]);

  if (!firebaseUser) return null;

  return (
    <Layout
      user={userProfile}
      userId={firebaseUser.uid}
      onLogout={() => {
        persistence.clearPersistence();
        logout();
      }}
      syncHistoryRefresh={0} // This will be handled inside LecturerDashboard if needed
    >
      <LecturerDashboard />
    </Layout>
  );
};
