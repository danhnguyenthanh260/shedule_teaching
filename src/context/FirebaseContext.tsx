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
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      // Request Google Sheets and Calendar scopes
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      
      const result = await signInWithPopup(auth, provider);
      
      // Get the OAuth access token from the credential
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        // Store in localStorage for persistence
        localStorage.setItem('google_access_token', credential.accessToken);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login with Google';
      setError(errorMessage);
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
      localStorage.removeItem('google_access_token');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to logout';
      setError(errorMessage);
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
