/**
 * HTTP POST handler
 * Nhận request từ React frontend
 *
 * Expected payload:
 * {
 *   "calendarName": "Schedule Teaching",
 *   "events": [
 *     {
 *       "title": "Họp lớp",
 *       "start": "2024-02-01T09:00:00",
 *       "end": "2024-02-01T11:00:00",
 *       "location": "P.401"
 *     }
 *   ]
 * }
 */
/**
 * HTTP POST handler
 * Nhận request từ React frontend
 *
 * Expected payload:
 * {
 *   "idToken": "FIREBASE_ID_TOKEN",
 *   "calendarName": "Schedule Teaching", // Optional
 *   "events": [ ... ]
 *   "events": [ ... ]
 * }
 */

// 🔒 SECURITY: List of allowed admin emails
const ALLOWED_EMAILS = [
  'duongkien.090905@gmail.com', 
  'ngohoangtruongdat2@gmail.com'
]; // Ensure this matches src/config/admin.ts

function doPost(e) {
  const startTime = new Date();
  let response = {
    status: CONSTANTS.ERROR,
    message: '',
    data: null,
    timestamp: startTime.toISOString(),
    executionTime: 0
  };

  try {
    AppLogger.info('=== POST Request Received ===');
    
    // Parse request body
    let payload;
    try {
      const contents = e.postData.contents;
      payload = JSON.parse(contents);
    } catch (parseError) {
      AppLogger.error('JSON parse error', parseError);
      response.message = 'Invalid JSON in request body';
      return buildHttpResponse(response, 400);
    }

    // 🔴 SECURITY: Verify Firebase ID token FIRST
    const token = payload.idToken;
    if (!token) {
      AppLogger.error('Missing Firebase ID token');
      response.message = 'Unauthorized: Missing authentication token';
      return buildHttpResponse(response, 401);
    }

    // Verify token (call Firebase Auth REST API)
    const verificationResult = verifyFirebaseToken(token);
    if (!verificationResult.valid) {
      AppLogger.error('Invalid Firebase token', verificationResult.error);
      response.message = 'Unauthorized: Invalid or expired token';
      return buildHttpResponse(response, 401);
    }

    const userEmail = verificationResult.email;
    AppLogger.info('✅ Request authenticated for user: ' + userEmail);

    // 🔴 AUTHORIZATION: Check if user is allowed
    if (!ALLOWED_EMAILS.includes(userEmail.toLowerCase())) {
        AppLogger.warn(`⛔ Access denied for user: ${userEmail}`);
        response.message = 'Forbidden: You are not authorized to perform this action.';
        return buildHttpResponse(response, 403);
    }

    // Validate events
    if (!payload.events || !Array.isArray(payload.events)) {
      AppLogger.warn('Missing or invalid events array');
      response.message = CONSTANTS.ERRORS.MISSING_EVENTS;
      return buildHttpResponse(response, 400);
    }

    // Use default calendar if not provided
    const calendarName = payload.calendarName || 'Schedule Teaching';

    AppLogger.info('Payload validated', {
      calendarName: calendarName,
      eventCount: payload.events.length,
      userEmail: userEmail
    });

    // Create events using Apps Script's authority
    const result = CalendarService.createEvents(
      calendarName,
      payload.events
    );

    AppLogger.info('Events creation completed', result);

    response.status = CONSTANTS.SUCCESS;
    response.message = `Successfully processed ${result.total} events`;
    response.data = {
      total: result.total,
      success: result.success,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors : null
    };

    return buildHttpResponse(response, 200);

  } catch (error) {
    AppLogger.error('Unhandled error in doPost', error);
    response.status = CONSTANTS.ERROR;
    response.message = error.message || CONSTANTS.ERRORS.INTERNAL_ERROR;
    return buildHttpResponse(response, 500);
  } finally {
    const endTime = new Date();
    response.executionTime = (endTime.getTime() - startTime.getTime()) + 'ms';
    AppLogger.info('=== POST Request Completed ===', {
      status: response.status,
      executionTime: response.executionTime
    });
  }
}

/**
 * Build HTTP response with CORS headers
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code
 * @returns {HtmlOutput} HTTP response
 */
function buildHttpResponse(data, statusCode) {
  const output = ContentService.createTextOutput(
    JSON.stringify(data)
  );
  output.setMimeType(ContentService.MimeType.JSON);
  
  // 🔐 SECURITY: Restrict CORS to allowed origins only
  // In production, replace with your actual Vercel domain
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://your-app.vercel.app' // Replace with your actual domain
  ];
  
  // Get request origin from e object (if available)
  const requestOrigin = e && e.requestHeaders && e.requestHeaders['origin'] ? e.requestHeaders['origin'] : '';
  const isAllowedOrigin = allowedOrigins.includes(requestOrigin) || requestOrigin.includes('vercel.app');
  
  if (isAllowedOrigin) {
    output.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else {
    // Fallback: only allow from same origin
    output.setHeader('Access-Control-Allow-Origin', 'null');
  }
  
  output.setHeader('Access-Control-Allow-Methods', 'POST');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  output.setHeader('Access-Control-Max-Age', '3600');

  // Note: Apps Script không hỗ trợ custom HTTP status code
  // Dùng header hoặc payload để indicate status
  return output;
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
function doOptions(e) {
  const output = ContentService.createTextOutput('');
  
  // 🔐 SECURITY: Restrict CORS to allowed origins only
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://your-app.vercel.app' // Replace with your actual domain
  ];
  
  const requestOrigin = e && e.requestHeaders && e.requestHeaders['origin'] ? e.requestHeaders['origin'] : '';
  const isAllowedOrigin = allowedOrigins.includes(requestOrigin) || requestOrigin.includes('vercel.app');
  
  if (isAllowedOrigin) {
    output.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else {
    output.setHeader('Access-Control-Allow-Origin', 'null');
  }
  
  output.setHeader('Access-Control-Allow-Methods', 'POST');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  output.setHeader('Access-Control-Max-Age', '3600');
  return output;
}

/**
 * 🔴 SECURITY: Verify Firebase ID token
 * Calls Firebase REST API to validate token
 */
function verifyFirebaseToken(idToken) {
  try {
    const firebaseProjectId = 'shedule-teaching'; // Change to your project ID
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CONSTANTS.FIREBASE_WEB_API_KEY}`;
    
    const payload = JSON.stringify({ idToken });
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.users && result.users.length > 0) {
      const user = result.users[0];
      return {
        valid: true,
        email: user.email,
        uid: user.localId
      };
    } else {
      return {
        valid: false,
        error: 'Token verification failed'
      };
    }
  } catch (error) {
    AppLogger.error('Token verification error', error);
    return {
      valid: false,
      error: error.toString()
    };
  }
}

/**
 * GET handler (optional - cho testing)
 */
function doGet(e) {
  const output = ContentService.createTextOutput(
    JSON.stringify({
      status: 'ok',
      message: 'Apps Script API is running',
      timestamp: new Date().toISOString()
    })
  );
  output.setMimeType(ContentService.MimeType.JSON);
  output.setHeader('Access-Control-Allow-Origin', '*');
  return output;
}
