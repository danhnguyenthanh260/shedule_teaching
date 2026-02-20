/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 12.0 - DIAGNOSTIC & FORCE SYNC
 * =====================================================
 */

const CONSTANTS = {
  DEFAULT_CALENDAR_NAME: 'Schedule Teaching',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  GAS_SECRET: 'FPTxavalo2026', 
  FIREBASE_URL: 'https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/',
  ADMIN_EMAILS: [
    'ngohoangtruongdat@gmail.com',
    'ngohoangtruongdat2@gmail.com'
  ],
  FIREBASE_WEB_API_KEY: 'AIzaSyDRwHY6mgdHKjkanLJk8BFpOQSeV5sqvaY',
  SIGNATURE_TAG: 'signature',
  SOURCE_TAG: 'app_source',
  SUCCESS: 'success',
  ERROR: 'error'
};

const AppLogger = {
  info: (msg, data) => { 
    const log = `[INFO] ${new Date().toISOString()} - ${msg}`;
    console.log(log, data || ''); 
    Logger.log(log + (data ? ' ' + JSON.stringify(data) : ''));
  },
  error: (msg, err) => { 
    const log = `[ERROR] ${new Date().toISOString()} - ${msg}`;
    console.error(log, err || ''); 
    Logger.log(log + (err ? ' ' + err.toString() : ''));
  }
};

const CalendarService = {
  /**
   * Lấy lịch theo tên hoặc ID. Nếu không thấy dùng lịch Primary.
   */
  getCalendar: function(name) {
    const calendars = CalendarApp.getAllCalendars();
    const availableNames = calendars.map(c => c.getName());
    
    AppLogger.info('Getting calendar: ' + name, { available: availableNames });

    // Trường hợp 'primary' hoặc để trống
    if (!name || name.toLowerCase() === 'primary') {
      AppLogger.info('Using default (primary) calendar');
      return CalendarApp.getDefaultCalendar();
    }

    // Tìm theo tên trước
    for (var i = 0; i < calendars.length; i++) {
        if (calendars[i].getName() === name) {
          AppLogger.info('Calendar found by name: ' + name);
          return calendars[i];
        }
    }
    
    // Thử tìm theo ID (Email)
    try {
        const cal = CalendarApp.getCalendarById(name);
        if (cal) {
          AppLogger.info('Calendar found by ID: ' + name);
          return cal;
        }
    } catch (e) {}

    AppLogger.info('Calendar "' + name + '" not found, falling back to primary');
    return CalendarApp.getDefaultCalendar();
  },

  /**
   * Tìm sự kiện dựa trên Signature tag
   */
  findEventBySignature: function(calendar, signature, start, end) {
    if (!signature) return null;
    // Tìm kiếm trong phạm vi hẹp (-1/+1 ngày) quanh thời gian sự kiện để tối ưu
    const rangeStart = new Date(start.getTime() - 24 * 60 * 60 * 1000); 
    const rangeEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);   
    const events = calendar.getEvents(rangeStart, rangeEnd);
    for (const event of events) {
      if (event.getTag(CONSTANTS.SIGNATURE_TAG) === signature) return event;
    }
    return null;
  },

  /**
   * Tạo danh sách sự kiện
   */
  createEvents: function(calendarName, events, force = false) {
    if (!Array.isArray(events) || events.length === 0) {
      return { total: 0, success: 0, status: 'no_events' };
    }
    
    const calendar = this.getCalendar(calendarName);
    const allCalendars = CalendarApp.getAllCalendars();
    const results = { 
      total: events.length, 
      success: 0, 
      updated: 0, 
      skipped: 0, 
      failed: 0, 
      errors: [],
      calendarName: calendar.getName(),
      calendarId: calendar.getId(),
      availableCalendars: allCalendars.map(c => c.getName())
    };
    
    events.forEach((ev, i) => {
      try {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        
        // Kiểm tra dữ liệu ngày tháng
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
           throw new Error('Định dạng ngày tháng không hợp lệ (ISO 8601 required)');
        }

        if (ev.signature && !force) {
          const existing = this.findEventBySignature(calendar, ev.signature, start, end);
          if (existing) {
             // Kiểm tra xem có thực sự thay đổi không
             const unchanged = existing.getTitle() === ev.title && 
                               existing.getLocation() === (ev.location || '') &&
                               Math.abs(existing.getStartTime().getTime() - start.getTime()) < 1000 &&
                               Math.abs(existing.getEndTime().getTime() - end.getTime()) < 1000;
                               
             if (unchanged) {
               results.skipped++; 
               return;
             }
             
             // Cập nhật sự kiện cũ
             existing.setTitle(ev.title); 
             existing.setTime(start, end);
             existing.setLocation(ev.location || ''); 
             existing.setDescription(ev.description || '');
             results.updated++; 
             return;
          }
        }
        
        // Tạo mới
        const created = calendar.createEvent(ev.title, start, end, { 
          location: ev.location || '', 
          description: ev.description || '' 
        });
        
        // Đánh dấu nguồn gốc và signature
        created.setTag(CONSTANTS.SOURCE_TAG, 'fpt_scheduler');
        if (ev.signature) created.setTag(CONSTANTS.SIGNATURE_TAG, ev.signature);
        results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push({ index: i, title: ev.title, message: e.toString() });
      }
    });
    return results;
  },

  /**
   * Xóa sạch các sự kiện được tạo bởi app
   */
  clearEvents: function(calendarName) {
    const calendar = this.getCalendar(calendarName);
    const now = new Date();
    // Xóa trong phạm vi +/- 180 ngày quanh thời điểm hiện tại
    const startTime = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
    const endTime = new Date(now.getTime() + (180 * 24 * 60 * 60 * 1000));
    const events = calendar.getEvents(startTime, endTime);
    let deletedCount = 0;
    
    events.forEach(event => {
      if (event.getTag(CONSTANTS.SOURCE_TAG) === 'fpt_scheduler') {
        event.deleteEvent(); 
        deletedCount++;
      }
    });
    return { deletedCount: deletedCount };
  }
};

/**
 * Xử lý GET: Thử script hoạt động
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'readSheet') return handleReadSheet_(e.parameter);
    
    return jsonResponse_({ 
        status: CONSTANTS.SUCCESS, 
        version: '12.0',
        message: 'FPT Scheduler GAS Engine V12.0 is ACTIVE' 
    });
  } catch (err) {
    return jsonResponse_({ status: CONSTANTS.ERROR, message: err.toString() });
  }
}

/**
 * Xử lý POST: Thực hiện Sync hoặc Clear
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'sync';
    
    // Auth Check: Ưu tiên Secret (Local), sau đó là idToken (Prod)
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      const authResult = verifyFirebaseToken_(payload.idToken);
      if (!authResult.valid || !isAuthorized_(authResult.email)) {
          throw new Error('Unauthorized Access: Invalid token or forbidden email (V12.0)');
      }
    }

    // Action: Đọc Sheet (Nếu Proxy gọi)
    if (action === 'readSheet') return handleReadSheet_(payload);
    
    // Action: Xóa lịch
    if (action === 'clearCalendar') {
      const res = CalendarService.clearEvents(payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME);
      return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '12.0', message: 'Cleared', data: res });
    }

    // Action mặc định: Đồng bộ sự kiện
    const res = CalendarService.createEvents(
      payload.calendarName, 
      payload.events || [], 
      payload.force || false
    );
    
    return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '12.0', data: res });
    
  } catch (err) {
    AppLogger.error('POST Error', err);
    return jsonResponse_({ status: CONSTANTS.ERROR, version: '12.0', message: err.toString() });
  }
}

/**
 * Đọc dữ liệu từ Google Sheet
 */
function handleReadSheet_(params) {
  if (!params.url) throw new Error('Missing Spreadsheet URL');
  const ss = SpreadsheetApp.openByUrl(params.url);
  const data = ss.getSheets()[0].getDataRange().getValues();
  const startRow = parseInt(params.startRow || '1', 10);
  
  return jsonResponse_({ 
      status: CONSTANTS.SUCCESS, 
      version: '12.0',
      data: data.slice(startRow - 1) 
  });
}

/**
 * Xác thực token Firebase
 */
function verifyFirebaseToken_(idToken) {
  if (!idToken) return { valid: false };
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CONSTANTS.FIREBASE_WEB_API_KEY}`;
    const res = UrlFetchApp.fetch(url, { 
        method: 'post', 
        contentType: 'application/json', 
        payload: JSON.stringify({ idToken }), 
        muteHttpExceptions: true 
    });
    const data = JSON.parse(res.getContentText());
    return (data.users && data.users.length > 0) ? { valid: true, email: data.users[0].email } : { valid: false };
  } catch (e) {
    return { valid: false };
  }
}

/**
 * Kiểm tra quyền Admin dựa trên Firebase Whitelist
 */
function isAuthorized_(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  
  // 1. Kiểm tra Admin mặc định
  if (CONSTANTS.ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail)) return true;
  
  // 2. Kiểm tra Whitelist trên Firebase REALTIME DB
  try {
    const url = `${CONSTANTS.FIREBASE_URL}admin_whitelist.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    if (!data) return false;
    
    // Whitelist có thể là Object { key: email } hoặc Array
    const list = Object.values(data).map(v => String(v).trim().toLowerCase());
    return list.includes(cleanEmail);
  } catch (e) { 
    return false; 
  }
}

/**
 * Trả về JSON cho Response
 */
function jsonResponse_(obj) { 
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}
