import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, database } from '../config/firebase';
import { ref, onValue } from 'firebase/database';
import { SUPER_ADMIN_EMAIL, setDynamicAdmins } from '../config/admin';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { saveAuthTokens, clearAuth, setUserUID } from '../services/authService';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { secureGetItem, secureSetItem, secureRemoveItem } from '../utils/crypto';

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
  reauthorizeGoogle: () => Promise<string | null>;
  isWhitelistLoading: boolean;
  isAdmin: boolean;
  isLecturer: boolean;
  isAuthorized: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLecturer, setIsLecturer] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isWhitelistLoading, setIsWhitelistLoading] = useState(true);
  const [adminList, setAdminList] = useState<string[]>([]);
  const [lecturerList, setLecturerList] = useState<string[]>([]);

  // Check for redirect result on mount
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        console.log('Checking redirect result...');
        const result = await getRedirectResult(auth);
        console.log('Redirect result:', result);

        if (result?.user) {
          console.log('User from redirect:', result.user.email);
          setUserUID(result.user.uid);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          console.log('Credential:', credential);

          if (credential?.accessToken) {
            console.log('Access token obtained');
            setAccessToken(credential.accessToken);

            // ✅ Store token with expiry time
            const expiryTime = Date.now() + (3600 * 1000); // 1 hour from now
            await saveAuthTokens(credential.accessToken, '', 3600);
            localStorage.setItem('google_access_token', credential.accessToken);
            localStorage.setItem('google_token_expiry', expiryTime.toString());

            logSuccess('Google login successful (redirect)');
          }
        } else {
          console.log('No redirect result found');
        }
      } catch (err) {
        console.error('Redirect result error:', err);
        logError('Redirect result error:', err);
      }
    };
    checkRedirectResult();
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    console.log('Setting up auth state listener...');
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('Auth state changed:', currentUser?.email);
      setUser(currentUser);
      setLoading(false);

      // If user is logged in and we don't have access token, try to restore from localStorage
      if (currentUser && !accessToken) {
        const restoreToken = async () => {
          const stored = await secureGetItem('google_access_token', currentUser.uid);
          const expiryRaw = localStorage.getItem('google_token_expiry');
          const now = Date.now();

          if (stored && expiryRaw) {
            const expiry = parseInt(expiryRaw);
            if (now < expiry) {
              console.log('✅ Restored valid access token from localStorage');
              setAccessToken(stored);
              logInfo('Restored access token from localStorage');
            } else {
              console.warn('⚠️ Stored access token has expired');
              secureRemoveItem('google_access_token');
              localStorage.removeItem('google_token_expiry');
              setAccessToken(null);
            }
          }
        };
        restoreToken();
      }
    });

    return unsubscribe;
  }, [accessToken]);

  // Handle Admin Whitelist
  useEffect(() => {
    const adminWhitelistRef = ref(database, 'admin_whitelist');
    const unsubscribe = onValue(adminWhitelistRef, (snapshot) => {
      const data = snapshot.val();
      let list: string[] = [];
      if (data && typeof data === 'object') {
        list = Object.values(data).map((v: any) => String(v).trim().toLowerCase());
      }
      setAdminList(list);
      setDynamicAdmins(list); // 🔄 Sync with static helper for Legacy/Layout components
      setIsWhitelistLoading(false);
      logInfo('Admin Whitelist Synced in Context');
    }, (error) => {
      console.error('Whitelist fetch error:', error);
      setIsWhitelistLoading(false); // Unblock UI even if fetch fails
    });

    return () => unsubscribe();
  }, []);

  // Handle Lecturer Whitelist
  useEffect(() => {
    const lecturerWhitelistRef = ref(database, 'lecturer_whitelist');
    const unsubscribe = onValue(lecturerWhitelistRef, (snapshot) => {
      const data = snapshot.val();
      let list: string[] = [];
      if (data && typeof data === 'object') {
        list = Object.values(data).map((v: any) => String(v.email).trim().toLowerCase());
      }
      setLecturerList(list);
      logInfo('Lecturer Whitelist Synced in Context');
    }, (error) => {
      console.error('Lecturer whitelist fetch error:', error);
    });

    return () => unsubscribe();
  }, []);

  // Update isAdmin, isLecturer, isAuthorized whenever user, adminList or lecturerList changes
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsLecturer(false);
      setIsAuthorized(false);
      return;
    }
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      setIsAdmin(false);
      setIsLecturer(false);
      setIsAuthorized(false);
      return;
    }

    const checkAdmin = email === SUPER_ADMIN_EMAIL.toLowerCase() || adminList.includes(email);
    const checkLecturer = lecturerList.includes(email);
    
    setIsAdmin(checkAdmin);
    setIsLecturer(checkLecturer);
    setIsAuthorized(checkAdmin || checkLecturer);
  }, [user, adminList, lecturerList]);
  /* 
  // PREVIOUS REDIRECT LOGIC (Commented out per User Request):
  const loginWithGoogle = async () => {
    try {
      setError(null);
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      console.log('Starting Google login...', isLocalhost ? 'popup' : 'redirect');
      
      // SECURITY: Generate and store OAuth state with timestamp for CSRF protection
      const oauthState = generateOAuthState();
      const stateData = {
        state: oauthState,
        timestamp: Date.now()
      };
      sessionStorage.setItem('oauth_state_data', JSON.stringify(stateData));
      logInfo('OAuth state generated');
      
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      
      // Use popup for localhost, redirect for production
      if (isLocalhost) {
        console.log('Using popup for localhost...');
        const result = await signInWithPopup(auth, provider);
        setUserUID(result.user.uid);
        
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          console.log('Access token obtained from popup');
          setAccessToken(credential.accessToken);
          await saveAuthTokens(credential.accessToken, '', 3600);
          logSuccess('Google login successful (popup)');
        }
      } else {
        console.log('Using redirect for production...');
        await signInWithRedirect(auth, provider);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login with Google';
      setError(errorMessage);
      console.error('❌ Google login failed:', errorMessage, err);
      logError('Google login failed:', errorMessage);
      throw err;
    }
  };
  */

  const loginWithGoogle = async (): Promise<string | null> => {
    try {
      setError(null);
      console.log('Starting Google login with popup...');

      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');

      /* 
       * 🚀 OPTIMIZATION: Removed prompt: 'select_account'
       * This allows the browser to auto-select if only one account exists, 
       * making the re-auth popup close almost instantly.
       */

      const result = await signInWithPopup(auth, provider);
      setUserUID(result.user.uid);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        console.log('✅ Access token obtained from popup');
        setAccessToken(credential.accessToken);

        // Store token with expiry time (Google tokens expire in 1 hour)
        const expiryTime = Date.now() + (3600 * 1000); 
        await saveAuthTokens(credential.accessToken, '', 3600);
        await secureSetItem('google_access_token', credential.accessToken, result.user.uid);

        logSuccess('Google login successful');
        return credential.accessToken;
      }
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login with Google';
      setError(errorMessage);
      console.error('❌ Google login failed:', errorMessage, err);
      logError('Google login failed:', errorMessage);
      throw err;
    }
  };

  const reauthorizeGoogle = async (): Promise<string | null> => {
    logInfo('Manual re-authorization triggered');
    return await loginWithGoogle();
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
    // Return stored access token or try to restore from secure storage
    if (accessToken) return accessToken;

    if (user) {
      const stored = await secureGetItem('google_access_token', user.uid);
      if (stored) {
        setAccessToken(stored);
        return stored;
      }
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
        reauthorizeGoogle,
        loginWithEmail,
        signupWithEmail,
        logout,
        getAccessToken,
        isWhitelistLoading,
        isAdmin,
        isLecturer,
        isAuthorized,
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
