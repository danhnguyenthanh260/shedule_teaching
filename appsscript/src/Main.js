/*
 * =====================================================
 * Schedule Teaching - Google Apps Script Backend
 * Version: FINAL (Server-to-Server)
 * =====================================================
 */

/* =========================
 * 1. CONSTANTS
 * ========================= */
const CONSTANTS = {
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  FIREBASE_URL: 'https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/',
  ADMIN_EMAILS: [
    'duongkien.090905@gmail.com',
    'ngohoangtruongdat@gmail.com',
    'ngohoangtruongdat2@gmail.com'
  ],
  SUCCESS: 'success',
  ERROR: 'error'
};


/* =========================
 * 2. doGet – API ENTRY POINT
 * ========================= */
function doGet(e) {
  try {
    const action = e.parameter.action;

    /* ===== CASE 1: READ GOOGLE SHEET ===== */
    if (action === 'readSheet') {
      return handleReadSheet_(e);
    }

    /* ===== CASE 2: ADMIN UI ===== */
    if (e.parameter.view === 'true') {
      return handleAdminView_();
    }

    /* ===== DEFAULT ===== */
    return jsonResponse_({
      status: CONSTANTS.SUCCESS,
      message: 'Schedule Teaching API is running'
    });

  } catch (err) {
    return jsonResponse_({
      status: CONSTANTS.ERROR,
      message: err.toString()
    });
  }
}


/* =========================
 * 3. READ GOOGLE SHEET LOGIC
 * ========================= */
function handleReadSheet_(e) {
  const sheetUrl = e.parameter.url;
  const startRow = parseInt(e.parameter.startRow || '1', 10);

  if (!sheetUrl) {
    return jsonResponse_({
      status: CONSTANTS.ERROR,
      message: 'Missing sheet url'
    });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(sheetUrl);
    const sheet = ss.getSheets()[0];

    const values = sheet.getDataRange().getValues();
    const filtered = values.slice(startRow - 1);

    return jsonResponse_({
      status: CONSTANTS.SUCCESS,
      data: filtered
    });

  } catch (err) {
    return jsonResponse_({
      status: CONSTANTS.ERROR,
      message: 'Read sheet failed: ' + err.toString()
    });
  }
}


/* =========================
 * 4. ADMIN VIEW (HTML)
 * ========================= */
function handleAdminView_() {
  const email = Session.getActiveUser().getEmail();
  const isAdmin = CONSTANTS.ADMIN_EMAILS.includes(email);

  if (!isAdmin) {
    return HtmlService.createHtmlOutput(
      '<h3>❌ Bạn không có quyền truy cập Admin</h3>'
    );
  }

  return HtmlService
    .createTemplateFromFile('AdminPage')
    .evaluate()
    .setTitle('Admin - Schedule Teaching')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* =========================
 * 5. SAVE ADMIN SETTINGS
 * ========================= */
function saveAdminSettings(data) {
  try {
    if (!data || !data.semester) {
      throw new Error('Invalid payload');
    }

    const key = data.semester.trim().replace(/\s+/g, '_');
    const url = `${CONSTANTS.FIREBASE_URL}configs/${key}.json`;

    UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(data)
    });

    return '✅ Đã lưu cấu hình học kỳ lên Firebase';

  } catch (err) {
    return '❌ Lỗi lưu cấu hình: ' + err.toString();
  }
}


/* =========================
 * 6. GET SEMESTERS (OPTIONAL)
 * ========================= */
function getSemestersData() {
  try {
    const res = UrlFetchApp.fetch(CONSTANTS.FIREBASE_URL + 'configs.json');
    return JSON.parse(res.getContentText());
  } catch (err) {
    return null;
  }
}


/* =========================
 * 8. HELPER: JSON RESPONSE
 * ========================= */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
