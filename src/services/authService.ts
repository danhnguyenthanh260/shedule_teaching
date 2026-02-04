/**
 * Authentication Service with Token Refresh & Encryption
 * Handles OAuth token lifecycle with encrypted localStorage
 */

import { secureSetItem, secureGetItem, secureRemoveItem } from '../utils/crypto';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const EXPIRY_KEY = 'tokenExpiry'; // Expiry NOT encrypted (it's not sensitive)
const UID_KEY = 'userUID';

// Get current user UID for encryption (stored in plain localStorage temporarily)
function getUserUID(): string {
  const uid = localStorage.getItem(UID_KEY);
  return uid || 'anonymous';
}

/**
 * Store user UID for encryption key derivation
 */
export function setUserUID(uid: string): void {
  localStorage.setItem(UID_KEY, uid);
}

/**
 * Parse JWT to get expiry time
 * @param token Firebase ID token (JWT format)
 * @returns Expiry timestamp in milliseconds or null
 */
function getJWTExpiry(token: string): number | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode payload (URL-safe base64)
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );

    // Firebase tokens have 'exp' claim in seconds
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    console.error('❌ Failed to parse JWT:', e);
    return null;
  }
}

/**
 * Check if access token is expired or will expire soon
 * @param token The token to check
 * @returns true if expired or expiring within 5 minutes
 */
export function isTokenExpired(token?: string | null): boolean {
  try {
    if (!token) {
      const uid = getUserUID();
      const storedExpiry = localStorage.getItem(`${EXPIRY_KEY}_${uid}`) || localStorage.getItem(EXPIRY_KEY);
      if (!storedExpiry) return true;

      const expiryTime = parseInt(storedExpiry);
      const now = Date.now();

      // Consider expired if less than 5 minutes remaining
      return now >= (expiryTime - 5 * 60 * 1000);
    }

    // ✅ Validate token JWT expiry
    const expiryMs = getJWTExpiry(token);
    if (!expiryMs) return true;

    const now = Date.now();
    // Expired if less than 5 minutes remaining
    return now >= (expiryMs - 5 * 60 * 1000);
  } catch (e) {
    console.error('❌ Error checking token expiry:', e);
    return true;
  }
}

/**
 * Get current access token, refresh if expired
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const uid = getUserUID();
    const token = await secureGetItem(TOKEN_KEY, uid);

    if (!token) return null;

    // ✅ VALIDATE token expiry before sending
    if (isTokenExpired(token)) {
      console.log('🔄 Token expired or expiring soon, refreshing...');
      return await refreshAccessToken();
    }

    return token;
  } catch (error) {
    console.error('❌ Error getting access token:', error);
    return null;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<string> {
  const uid = getUserUID();

  try {
    const refreshToken = await secureGetItem(REFRESH_TOKEN_KEY, uid);

    if (!refreshToken) {
      console.error('❌ No refresh token available');
      clearAuth();
      throw new Error('No refresh token. Please login again.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();

    // Save new access token (encrypted)
    await secureSetItem(TOKEN_KEY, data.access_token, uid);

    // Calculate expiry time (usually 3600 seconds = 1 hour)
    const expiryTime = Date.now() + (data.expires_in * 1000);
    localStorage.setItem(EXPIRY_KEY, expiryTime.toString());

    console.log('✅ Token refreshed successfully');
    return data.access_token;

  } catch (error) {
    console.error('❌ Token refresh failed:', error);
    clearAuth();
    throw new Error('Token refresh failed. Please login again.');
  }
}

/**
 * Save auth tokens after login (ENCRYPTED)
 */
export async function saveAuthTokens(accessToken: string, refreshToken?: string, expiresIn?: number) {
  const uid = getUserUID();

  try {
    // Save access token encrypted
    await secureSetItem(TOKEN_KEY, accessToken, uid);

    if (refreshToken) {
      // Save refresh token encrypted
      await secureSetItem(REFRESH_TOKEN_KEY, refreshToken, uid);
    }

    if (expiresIn) {
      const expiryTime = Date.now() + (expiresIn * 1000);
      localStorage.setItem(EXPIRY_KEY, expiryTime.toString());
    }

    console.log('✅ Auth tokens saved (encrypted)');
  } catch (error) {
    console.error('❌ Failed to save auth tokens:', error);
    throw error;
  }
}

/**
 * Clear all auth data
 */
export function clearAuth() {
  secureRemoveItem(TOKEN_KEY);
  secureRemoveItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem('google_access_token');
}

/**
 * Fetch with automatic token refresh on 401
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getAccessToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  // First attempt
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });

  // If 401, try refreshing token and retry once
  if (response.status === 401) {
    console.log('🔄 Got 401, refreshing token and retrying...');

    try {
      token = await refreshAccessToken();

      // Retry request with new token
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      // Refresh failed, redirect to login
      console.error('❌ Token refresh failed, redirecting to login');
      clearAuth();
      window.location.href = '/';
      throw error;
    }
  }

  return response;
}
