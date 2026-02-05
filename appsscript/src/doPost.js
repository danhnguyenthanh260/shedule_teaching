/**
 * HTTP POST handler
 * Nhận request thông qua Vercel Proxy
 */
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
    AppLogger.info('=== POST Request Received (Proxy) ===');
    
    // Parse request body
    let payload;
    try {
      const contents = e.postData.contents;
      payload = JSON.parse(contents);
    } catch (parseError) {
      AppLogger.error('JSON parse error', parseError);
      response.message = 'Invalid JSON in request body';
      return buildResponse(response);
    }

    // 🔴 SECURITY: Verify Firebase ID token FIRST
    const token = payload.idToken;
    if (!token) {
      AppLogger.error('Missing Firebase ID token');
      response.message = 'Unauthorized: Missing authentication token';
      return buildResponse(response);
    }

    // Verify token
    const verificationResult = verifyFirebaseToken(token);
    if (!verificationResult.valid) {
      AppLogger.error('Invalid Firebase token', verificationResult.error);
      response.message = 'Unauthorized: Invalid or expired token';
      return buildResponse(response);
    }

    const userEmail = verificationResult.email;
    AppLogger.info('✅ Request authenticated for user: ' + userEmail);

    // Validate events
    if (!payload.events || !Array.isArray(payload.events)) {
      AppLogger.warn('Missing or invalid events array');
      response.message = CONSTANTS.ERRORS.MISSING_EVENTS;
      return buildResponse(response);
    }

    // Use default calendar if not provided
    const calendarName = payload.calendarName || 'Schedule Teaching';

    // Create events
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

    return buildResponse(response);

  } catch (error) {
    AppLogger.error('Unhandled error in doPost', error);
    response.status = CONSTANTS.ERROR;
    response.message = error.message || CONSTANTS.ERRORS.INTERNAL_ERROR;
    return buildResponse(response);
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
 * Helper to build JSON response
 */
function buildResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 🔴 SECURITY: Verify Firebase ID token
 * Calls Firebase REST API to validate token
 */
function verifyFirebaseToken(idToken) {
  try {
    const firebaseProjectId = 'shedule-teaching'; 
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
