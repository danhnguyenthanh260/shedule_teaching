import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { saveAuthTokens, clearAuth, setUserUID } from '../services/authService';
import { logInfo, logSuccess, logError } from '../utils/logger';

/**
 * Generate random OAuth state for CSRF protection
 */
function generateOAuthState(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  accessToken: string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      // If user is logged in and we don't have access token, try to restore from localStorage
      if (currentUser && !accessToken) {
        const stored = localStorage.getItem('google_access_token');
        if (stored) {
          setAccessToken(stored);
          logInfo('Restored access token from localStorage');
        }
      }
    });

    return unsubscribe;
  }, [accessToken]);

  const loginWithGoogle = async () => {
    try {
      setError(null);
      
      // 🔐 SECURITY: Generate and store OAuth state with timestamp for CSRF protection
      const oauthState = generateOAuthState();
      const stateData = {
        state: oauthState,
        timestamp: Date.now() // ✅ Add timestamp for 5-min expiry check
      };
      sessionStorage.setItem('oauth_state_data', JSON.stringify(stateData));
      logInfo('OAuth state generated with timestamp and stored');
      
      const provider = new GoogleAuthProvider();
      // Request Google Sheets and Calendar scopes
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      
      const result = await signInWithPopup(auth, provider);
      
      // Set user UID for encryption key derivation
      setUserUID(result.user.uid);
      
      // Get the OAuth access token from the credential
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        
        // Save tokens with expiry using authService
        await saveAuthTokens(
          credential.accessToken,
          '', // Firebase doesn't provide refresh token directly
          3600 // Google tokens typically expire in 1 hour
        );
        
        logSuccess('Google login successful');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login with Google';
      setError(errorMessage);
      logError('Google login failed:', errorMessage);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login';
      setError(errorMessage);
      throw err;
    }
  };

  const signupWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to signup';
      setError(errorMessage);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setAccessToken(null);
      
      // Clear all auth data using authService
      clearAuth();
      
      logInfo('Logout successful');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to logout';
      setError(errorMessage);
      logError('Logout failed:', errorMessage);
      throw err;
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    // Return stored access token or try to restore from localStorage
    if (accessToken) return accessToken;
    
    const stored = localStorage.getItem('google_access_token');
    if (stored) {
      setAccessToken(stored);
      return stored;
    }
    
    return null;
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        error,
        accessToken,
        loginWithGoogle,
        loginWithEmail,
        signupWithEmail,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within FirebaseProvider');
  }
  return context;
};
