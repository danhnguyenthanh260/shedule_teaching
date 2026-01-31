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
    AppLogger.info('Content type: ' + e.contentType);

    // Parse request body
    let payload;
    try {
      const contents = e.postData.contents;
      AppLogger.info('Raw payload received', contents);
      payload = JSON.parse(contents);
    } catch (parseError) {
      AppLogger.error('JSON parse error', parseError);
      response.message = 'Invalid JSON in request body';
      return buildHttpResponse(response, 400);
    }

    // Validate payload
    if (!payload.calendarName) {
      AppLogger.warn('Missing calendarName');
      response.message = CONSTANTS.ERRORS.MISSING_CALENDAR;
      return buildHttpResponse(response, 400);
    }

    if (!payload.events || !Array.isArray(payload.events)) {
      AppLogger.warn('Missing or invalid events array');
      response.message = CONSTANTS.ERRORS.MISSING_EVENTS;
      return buildHttpResponse(response, 400);
    }

    AppLogger.info('Payload validated', {
      calendarName: payload.calendarName,
      eventCount: payload.events.length
    });

    // Create events
    const result = CalendarService.createEvents(
      payload.calendarName,
      payload.events
    );

    AppLogger.info('Events creation completed', result);

    response.status = CONSTANTS.SUCCESS;
    response.message = `Successfully created ${result.success} out of ${result.total} events`;
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
    response.executionTime = endTime - startTime + 'ms';
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
  
  // Add CORS headers to allow requests from any origin
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Note: Apps Script không hỗ trợ custom HTTP status code
  // Dùng header hoặc payload để indicate status
  return output;
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
function doOptions(e) {
  const output = ContentService.createTextOutput('');
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  output.setHeader('Access-Control-Max-Age', '3600');
  return output;
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
