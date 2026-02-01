/**
 * Auth Configuration
 * Handles environment-specific settings
 */

/**
 * Get redirect URI based on current environment
 * Development: localhost
 * Production: current origin
 */
export function getRedirectUri(): string {
  // In production, use current origin
  if (import.meta.env.PROD) {
    return `${window.location.origin}/callback.html`;
  }
  
  // In development, use .env config
  return import.meta.env.VITE_REDIRECT_URI || 'http://localhost:3000/callback.html';
}

/**
 * Get Google OAuth URL with correct redirect URI
 */
export function getGoogleAuthUrl(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = getRedirectUri();
  
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ];
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: scopes.join(' '),
    access_type: 'offline', // Request refresh token
    prompt: 'consent', // Force consent to get refresh token
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Get calendar name from environment or default
 */
export function getCalendarName(): string {
  return import.meta.env.VITE_CALENDAR_NAME || 'Schedule Teaching';
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/**
 * Get API endpoint based on environment
 */
export function getApiEndpoint(): string {
  return import.meta.env.VITE_BACKEND_URL;
}
