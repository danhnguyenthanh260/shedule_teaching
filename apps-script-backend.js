/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 9.6 (Merged with Multi-Calendar & Direct Support)
 * =====================================================
 */

const CONSTANTS = {
  DEFAULT_CALENDAR_NAME: 'Schedule Teaching',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  GAS_SECRET: 'YOUR_SECURE_SECRET_HERE', 
  FIREBASE_URL: 'https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/',
  SUPER_ADMIN_EMAIL: 'ngohoangtruongdat2@gmail.com',
  FIREBASE_WEB_API_KEY: 'AIzaSyDRwHY6mgdHKjkanLJk8BFpOQSeV5sqvaY',
  SIGNATURE_TAG: 'signature',
  SOURCE_TAG: 'app_source',
  SUCCESS: 'success',
  ERROR: 'error'
};

const AppLogger = {
  info: (msg, data) => { console.log(`[INFO] ${msg}`, data || ''); },
  error: (msg, err) => { console.error(`[ERROR] ${msg}`, err || ''); }
};

const CalendarService = {
  /**
   * Resolve calendar by name or ID, with primary fallback
   */
  getCalendar: function(name) {
    if (!name || name === 'primary') return CalendarApp.getDefaultCalendar();
    
    // Search by name
    const list = CalendarApp.getAllCalendars();
    for (var i = 0; i < list.length; i++) {
        if (list[i].getName() === name) return list[i];
    }
    
    // Search by ID fallback
    try {
        const cal = CalendarApp.getCalendarById(name);
        if (cal) return cal;
    } catch (e) {}

    return CalendarApp.getDefaultCalendar();
  },

  /**
   * Find existing event by signature tag
   */
  findEventBySignature: function(calendar, signature) {
    if (!signature) return null;
    const now = new Date();
    // Search from 6 months ago to 1.5 years ahead
    const rangeStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(now.getTime() + 450 * 24 * 60 * 60 * 1000);
    const events = calendar.getEvents(rangeStart, rangeEnd);
    
    for (const event of events) {
      if (event.getTag(CONSTANTS.SIGNATURE_TAG) === signature) return event;
    }
    return null;
  },

  createEvents: function(calendarName, events) {
    const calendar = this.getCalendar(calendarName);
    const results = { total: events.length, success: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    
    events.forEach((ev, i) => {
      try {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        
        // --- 🛡️ DUPLICATE DETECTION AND UPDATE LOGIC ---
        if (ev.signature) {
          const existing = this.findEventBySignature(calendar, ev.signature);
          if (existing) {
             // Check if content is same to avoid unnecessary updates
             if (existing.getTitle() === ev.title && 
                 existing.getLocation() === (ev.location || '')) {
               results.skipped++;
               return;
             }
             // Update existing event
             existing.setTitle(ev.title);
             existing.setTime(start, end);
             existing.setLocation(ev.location || '');
             existing.setDescription(ev.description || '');
             results.updated++;
             return;
          }
        }

        // --- 🆕 CREATE NEW EVENT ---
        const created = calendar.createEvent(ev.title, start, end, { 
            location: ev.location || '', 
            description: ev.description || '' 
        });
        
        // Add tags for tracing
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

  clearEvents: function(calendarName) {
    const calendar = this.getCalendar(calendarName);
    const now = new Date();
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

// ==================== API HANDLERS ====================

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'readSheet') {
      const ss = SpreadsheetApp.openByUrl(e.parameter.url);
      const data = ss.getSheets()[0].getDataRange().getValues();
      return jsonResponse_({ 
          status: CONSTANTS.SUCCESS, 
          data: data.slice(parseInt(e.parameter.startRow || '1', 10) - 1) 
      });
    }
    if (e.parameter.view === 'true') return handleAdminView_();
    return jsonResponse_({ status: CONSTANTS.SUCCESS, message: 'API is ready' });
  } catch (err) {
    return jsonResponse_({ status: CONSTANTS.ERROR, message: err.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    // Auth Check: Skip if matching GAS_SECRET, else verify ID Token against Whitelist
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      const auth = verifyFirebaseToken_(payload.idToken);
      if (!auth.valid || !isAuthorized_(auth.email)) {
          throw new Error('Unauthorized access: ' + (auth.email || 'Unknown User'));
      }
    }

    if (payload.action === 'clearCalendar') {
      const res = CalendarService.clearEvents(payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME);
      return jsonResponse_({ status: CONSTANTS.SUCCESS, message: `Đã xóa ${res.deletedCount} sự kiện`, data: res });
    }

    // Default Action: Create/Sync Events
    // 💡 Fix "primary" visibility issue
    const targetCalendarName = (payload.calendarName === 'primary' || !payload.calendarName) ? null : payload.calendarName;
    const res = CalendarService.createEvents(targetCalendarName, payload.events);
    
    return jsonResponse_({ status: CONSTANTS.SUCCESS, data: res });
  } catch (err) {
    AppLogger.error('Execution failed', err);
    return jsonResponse_({ status: CONSTANTS.ERROR, message: err.toString() });
  }
}

// ==================== HELPERS ====================

function verifyFirebaseToken_(idToken) {
  if (!idToken) return { valid: false };
  const res = UrlFetchApp.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CONSTANTS.FIREBASE_WEB_API_KEY}`, { 
      method: 'post', 
      contentType: 'application/json', 
      payload: JSON.stringify({ idToken }), 
      muteHttpExceptions: true 
  });
  const data = JSON.parse(res.getContentText());
  return (data.users && data.users.length > 0) ? { valid: true, email: data.users[0].email } : { valid: false };
}

/**
 * Check if email is in the dynamic whitelist or is Super Admin
 */
function isAuthorized_(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  
  // 1. Super Admin Fallback
  if (cleanEmail === CONSTANTS.SUPER_ADMIN_EMAIL.toLowerCase()) return true;
  
  // 2. Dynamic Whitelist check
  try {
    const whitelist = fetchAdminWhitelist_();
    return whitelist.includes(cleanEmail);
  } catch (e) {
    AppLogger.error('Whitelist check failed', e);
    return false;
  }
}

/**
 * Fetch Admin Whitelist from RTDB
 */
function fetchAdminWhitelist_() {
  const url = `${CONSTANTS.FIREBASE_URL}admin_whitelist.json`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  
  if (!data) return [];
  if (typeof data === 'object') return Object.values(data).map(v => String(v).trim().toLowerCase());
  return [];
}

function jsonResponse_(obj) { 
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}

function handleAdminView_() { 
    return HtmlService.createTemplateFromFile('AdminPage').evaluate()
        .setTitle('Admin')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); 
}

function saveAdminSettings(data) {
  const key = data.semester.trim().replace(/\s+/g, '_');
  UrlFetchApp.fetch(`${CONSTANTS.FIREBASE_URL}configs/${key}.json`, { 
      method: 'put', 
      contentType: 'application/json', 
      payload: JSON.stringify(data) 
  });
  return '✅ Saved to Firestore';
}

/**
 * Run this once manually to grant permissions
 */
function triggerPermission() {
  const name = CalendarApp.getDefaultCalendar().getName();
  Logger.log("Permission granted for calendar: " + name);
}
