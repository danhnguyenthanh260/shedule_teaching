/**
 * HTTP POST handler
 * Nhận request thông qua Vercel Proxy (v7.0)
 *
 * Expected payload:
 * {
 *   "idToken": "FIREBASE_ID_TOKEN",
 *   "calendarName": "Schedule Teaching", // Optional
 *   "events": [ ... ]
 * }
 */

// 🔒 SECURITY: List of allowed admin/lecturer emails
const ALLOWED_EMAILS = [
  'duongkien.090905@gmail.com', 
  'ngohoangtruongdat2@gmail.com',
  'ngohoangtruongdat@gmail.com'
];

function doPost(e) {
  const startTime = new Date();
  let response = {
    status: 'error',
    message: '',
    data: null,
    timestamp: startTime.toISOString(),
    executionTime: 0
  };

  try {
    // Parse request body
    let payload;
    try {
      const contents = e.postData.contents;
      payload = JSON.parse(contents);
    } catch (parseError) {
      response.message = 'Invalid JSON in request body';
      return buildHttpResponse(response);
    }

    // 🔴 SECURITY: Verify Firebase ID token FIRST
    const token = payload.idToken;
    if (!token) {
      response.message = 'Unauthorized: Missing authentication token';
      return buildHttpResponse(response);
    }

    // Verify token (call Firebase Auth REST API)
    const verificationResult = verifyFirebaseToken(token);
    if (!verificationResult.valid) {
      response.message = 'Unauthorized: Invalid or expired token';
      return buildHttpResponse(response);
    }

    const userEmail = verificationResult.email;

    // 🔴 AUTHORIZATION: Check if user is allowed
    if (!ALLOWED_EMAILS.includes(userEmail.toLowerCase())) {
        response.message = 'Forbidden: You are not authorized to perform this sync.';
        return buildHttpResponse(response);
    }

    // Validate events
    if (!payload.events || !Array.isArray(payload.events)) {
      response.message = 'Events array is required';
      return buildHttpResponse(response);
    }

    // Use default calendar if not provided
    const calendarName = payload.calendarName || 'Schedule Teaching';

    // Create events using CalendarService (Hàm này giả định đã có sẵn trong project Apps Script)
    // Nếu bạn chưa có CalendarService, hãy đảm bảo đã copy file CalendarService.gs từ repo
    const result = CalendarService.createEvents(
      calendarName,
      payload.events
    );

    response.status = 'success';
    response.message = `Successfully processed ${result.total} events`;
    response.data = {
      total: result.total,
      success: result.success,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors : null
    };

    return buildHttpResponse(response);

  } catch (error) {
    response.status = 'error';
    response.message = error.message || 'Internal server error';
    return buildHttpResponse(response);
  } finally {
    const endTime = new Date();
    response.executionTime = (endTime.getTime() - startTime.getTime()) + 'ms';
  }
}

/**
 * Build HTTP response
 */
function buildHttpResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * 🔴 SECURITY: Verify Firebase ID token
 * Calls Firebase REST API to validate token
 */
function verifyFirebaseToken(idToken) {
  try {
    // Get FIREBASE_WEB_API_KEY from Constants.js
    const apiKey = CONSTANTS.FIREBASE_WEB_API_KEY;
    if (!apiKey || apiKey.includes('YOUR_FIREBASE_WEB_API_KEY')) {
      throw new Error('FIREBASE_WEB_API_KEY not configured in Constants.js');
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
    
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
    return {
      valid: false,
      error: error.toString()
    };
  }
}
