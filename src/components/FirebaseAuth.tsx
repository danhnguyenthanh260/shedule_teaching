import React from 'react';
import { useFirebase } from '../context/FirebaseContext';

export const GoogleLoginButton: React.FC = () => {
  const { loginWithGoogle, loading, error } = useFirebase();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      await loginWithGoogle();
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleLogin}
        disabled={isLoading || loading}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
      >
        {isLoading ? 'Logging in...' : 'Login with Google'}
      </button>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
};

export const UserProfile: React.FC = () => {
  const { user, logout } = useFirebase();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-100 rounded-lg">
      <div className="flex-1">
        <p className="font-semibold">{user.displayName || user.email}</p>
        <p className="text-sm text-gray-600">{user.email}</p>
      </div>
      <button
        onClick={handleLogout}
        disabled={isLoading}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
      >
        {isLoading ? 'Logging out...' : 'Logout'}
      </button>
    </div>
  );
};
