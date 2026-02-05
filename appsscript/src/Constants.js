const CONSTANTS = {
  // Calendar settings
  CALENDAR_NAME: 'Schedule Teaching',
  TIMEZONE: 'Asia/Ho_Chi_Minh',

  // Response codes
  SUCCESS: 'success',
  ERROR: 'error',
  PENDING: 'pending',

  // Error messages
  ERRORS: {
    INVALID_PAYLOAD: 'Invalid request payload',
    MISSING_EVENTS: 'Events array is required',
    MISSING_CALENDAR: 'Calendar name is required',
    CALENDAR_NOT_FOUND: 'Calendar not found',
    INVALID_DATE: 'Invalid date format',
    INTERNAL_ERROR: 'Internal server error'
  },
  // 🔑 SECURITY: Get this from Firebase Console -> Project Settings
  FIREBASE_WEB_API_KEY: 'YOUR_FIREBASE_WEB_API_KEY_HERE' // TODO: Replace with actual Web API Key
};
