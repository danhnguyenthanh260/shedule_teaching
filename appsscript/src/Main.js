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
  ERROR: 'error',
  // 🔑 SECURITY: Replace this with your actual Web API Key from Firebase Console
  FIREBASE_WEB_API_KEY: 'AIzaSy...YourActualKey...' 
};


/* =========================
 * 2. doGet – XỬ LÝ ĐỌC DỮ LIỆU (GET)
 * ========================= */
function doGet(e) {
  try {
    const action = e.parameter.action;

    // Trường hợp 1: Nhấn "Hiện dữ liệu" trên React (Proxy gọi)
    if (action === 'readSheet') {
      return handleReadSheet_(e);
    }

    // Trường hợp 2: Truy cập trang Admin trực tiếp
    if (e.parameter.view === 'true') {
      return handleAdminView_();
    }

    // Mặc định: Trả về trạng thái hoạt động
    return jsonResponse_({
      status: CONSTANTS.SUCCESS,
      message: 'API is running smoothly via Proxy'
    });

  } catch (err) {
    return jsonResponse_({ status: CONSTANTS.ERROR, message: err.toString() });
  }
}


/* =========================
 * 3. READ GOOGLE SHEET LOGIC
 * ========================= */
// Đọc Google Sheet
function handleReadSheet_(e) {
  const url = e.parameter.url;
  const startRow = parseInt(e.parameter.startRow || '1', 10);
  if (!url) throw new Error('Missing sheet url');

  const ss = SpreadsheetApp.openByUrl(url);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const filtered = data.slice(startRow - 1);

  return jsonResponse_({ status: CONSTANTS.SUCCESS, data: filtered });
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
