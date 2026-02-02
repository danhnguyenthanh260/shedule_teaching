/**
 * CSRF Protection Utility
 * Generate and validate CSRF tokens for defense-in-depth
 */

interface CSRFToken {
  token: string;
  createdAt: number;
  expiresAt: number;
}

const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_STORAGE_KEY = 'csrf_token';
const CSRF_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a random CSRF token
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get or create CSRF token for current session
 */
export function getCSRFToken(): string {
  let tokenData: CSRFToken | null = null;

  try {
    const stored = localStorage.getItem(CSRF_STORAGE_KEY);
    if (stored) {
      tokenData = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse stored CSRF token:', e);
  }

  // Generate new token if:
  // 1. No token exists
  // 2. Token is expired
  if (!tokenData || Date.now() > tokenData.expiresAt) {
    tokenData = {
      token: generateToken(),
      createdAt: Date.now(),
      expiresAt: Date.now() + CSRF_EXPIRY_MS
    };

    try {
      localStorage.setItem(CSRF_STORAGE_KEY, JSON.stringify(tokenData));
    } catch (e) {
      console.error('Failed to store CSRF token:', e);
    }
  }

  return tokenData.token;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  try {
    const stored = localStorage.getItem(CSRF_STORAGE_KEY);
    if (!stored) {
      console.warn('No CSRF token stored');
      return false;
    }

    const tokenData: CSRFToken = JSON.parse(stored);

    // Check expiry
    if (Date.now() > tokenData.expiresAt) {
      console.warn('CSRF token expired');
      localStorage.removeItem(CSRF_STORAGE_KEY);
      return false;
    }

    // Check token match
    const isValid = token === tokenData.token;
    if (!isValid) {
      console.warn('CSRF token mismatch');
    }

    return isValid;
  } catch (e) {
    console.error('CSRF validation error:', e);
    return false;
  }
}

/**
 * Clear CSRF token (on logout)
 */
export function clearCSRFToken(): void {
  try {
    localStorage.removeItem(CSRF_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear CSRF token:', e);
  }
}

/**
 * Add CSRF token to request headers
 */
export function addCSRFTokenToHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    [CSRF_HEADER_NAME]: getCSRFToken()
  };
}

export const CSRF_HEADER = CSRF_HEADER_NAME;

export default {
  getCSRFToken,
  validateCSRFToken,
  clearCSRFToken,
  addCSRFTokenToHeaders
};
