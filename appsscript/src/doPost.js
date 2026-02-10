/**
 * HTTP POST handler - Refactored as Worker (Executor)
 * Nhận request thông qua Vercel Proxy (Secure Sync Flow)
 *
 * Expected payload:
 * {
 *   "secret": "GAS_SHARED_SECRET",
 *   "calendarName": "Schedule Teaching", 
 *   "events": [ ... ]
 * }
 */

function doPost(e) {
  try {
    let payload = JSON.parse(e.postData.contents);

    // 1. 🔒 SECURITY: Kiểm tra Secret (Dùng cho Local Proxy)
    const incomingSecret = payload.secret;
    const localSecret = CONSTANTS.GAS_SECRET;

    if (incomingSecret && incomingSecret === localSecret) {
      // ✅ Bỏ qua bước kiểm tra Token nếu có mã Secret đúng
    } else {
      // 2. 🛡️ BẢO MẬT: Kiểm tra Token Firebase (Dùng cho Vercel Proxy/Prod)
      const token = payload.idToken;
      if (!token) throw new Error('Unauthorized: Missing token and invalid secret');

      const auth = verifyFirebaseToken_(token);
      if (!auth.valid) throw new Error('Unauthorized: Invalid token');

      // 3. 🔴 PHÂN QUYỀN: Kiểm tra Email
      if (!CONSTANTS.ADMIN_EMAILS.includes(auth.email.toLowerCase())) {
        throw new Error('Forbidden: Your email is not allowed to sync');
      }
    }

    // 4. KIỂM TRA ACTION: Đồng bộ hay Xóa sạch?
    const action = payload.action || 'sync';

    if (action === 'clearCalendar') {
      const clearResult = CalendarService.clearEvents(
        payload.calendarName || 'Schedule Teaching'
      );
      return jsonResponse_({
        status: 'success',
        message: `Đã xóa sạch ${clearResult.deletedCount} sự kiện cũ`,
        data: clearResult
      });
    }

    // 5. THỰC HIỆN ĐỒNG BỘ
    const result = CalendarService.createEvents(
      payload.calendarName || 'Schedule Teaching',
      payload.events
    );

    return jsonResponse_({
      status: CONSTANTS.SUCCESS,
      message: `Sync processed successfully`,
      data: result
    });

  } catch (err) {
    return jsonResponse_({ status: CONSTANTS.ERROR, message: err.toString() });
  }
}

/**
 * Build HTTP response helper
 */
function buildHttpResponse_(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Note: verifyFirebaseToken and other unused functions can be safely removed 
 * if they are no longer called by any other service.
 */
