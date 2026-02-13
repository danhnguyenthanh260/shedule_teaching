/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 10.1 - PROOF OF FIX
 * =====================================================
 */

const CONSTANTS = {
  DEFAULT_CALENDAR_NAME: 'Schedule Teaching',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  GAS_SECRET: 'FPTxavalo2026', 
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
  getCalendar: function(name) {
    if (!name || name === 'primary') return CalendarApp.getDefaultCalendar();
    const list = CalendarApp.getAllCalendars();
    for (var i = 0; i < list.length; i++) {
        if (list[i].getName() === name) return list[i];
    }
    try {
        const cal = CalendarApp.getCalendarById(name);
        if (cal) return cal;
    } catch (e) {}
    return CalendarApp.getDefaultCalendar();
  },

  findEventBySignature: function(calendar, signature) {
    if (!signature) return null;
    const now = new Date();
    const rangeStart = new Date(now.getTime() - 180 * 24 * 60 * 1000 * 24);
    const rangeEnd = new Date(now.getTime() + 450 * 24 * 60 * 1000 * 24);
    const events = calendar.getEvents(rangeStart, rangeEnd);
    for (const event of events) {
      if (event.getTag(CONSTANTS.SIGNATURE_TAG) === signature) return event;
    }
    return null;
  },

  createEvents: function(calendarName, events) {
    if (!Array.isArray(events) || events.length === 0) {
      return { total: 0, success: 0, status: 'no_events' };
    }
    
    const calendar = this.getCalendar(calendarName);
    const results = { total: events.length, success: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    
    events.forEach((ev, i) => {
      try {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        if (ev.signature) {
          const existing = this.findEventBySignature(calendar, ev.signature);
          if (existing) {
             if (existing.getTitle() === ev.title && existing.getLocation() === (ev.location || '')) {
               results.skipped++; return;
             }
             existing.setTitle(ev.title); existing.setTime(start, end);
             existing.setLocation(ev.location || ''); existing.setDescription(ev.description || '');
             results.updated++; return;
          }
        }
        const created = calendar.createEvent(ev.title, start, end, { location: ev.location || '', description: ev.description || '' });
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
        event.deleteEvent(); deletedCount++;
      }
    });
    return { deletedCount: deletedCount };
  }
};

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'readSheet') return handleReadSheet_(e.parameter);
    return jsonResponse_({ 
        status: CONSTANTS.SUCCESS, 
        version: '10.1',
        message: 'Apps Script Engine V10.1 Running' 
    });
  } catch (err) {
    return jsonResponse_({ status: CONSTANTS.ERROR, message: err.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'sync';
    
    // Auth Check
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      const auth = verifyFirebaseToken_(payload.idToken);
      if (!auth.valid || !isAuthorized_(auth.email)) {
          throw new Error('Unauthorized Access (V10.1)');
      }
    }

    if (action === 'readSheet') return handleReadSheet_(payload);
    if (action === 'clearCalendar') {
      const res = CalendarService.clearEvents(payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME);
      return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '10.1', message: 'Cleared', data: res });
    }

    // Default: Sync Actions
    const res = CalendarService.createEvents(payload.calendarName, payload.events || []);
    return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '10.1', data: res });
  } catch (err) {
    return jsonResponse_({ status: CONSTANTS.ERROR, version: '10.1', message: err.toString() });
  }
}

function handleReadSheet_(params) {
  if (!params.url) throw new Error('Missing Spreadsheet URL (V10.1)');
  const ss = SpreadsheetApp.openByUrl(params.url);
  const data = ss.getSheets()[0].getDataRange().getValues();
  return jsonResponse_({ 
      status: CONSTANTS.SUCCESS, 
      version: '10.1',
      data: data.slice(parseInt(params.startRow || '1', 10) - 1) 
  });
}

function verifyFirebaseToken_(idToken) {
  if (!idToken) return { valid: false };
  const res = UrlFetchApp.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CONSTANTS.FIREBASE_WEB_API_KEY}`, { 
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken }), muteHttpExceptions: true 
  });
  const data = JSON.parse(res.getContentText());
  return (data.users && data.users.length > 0) ? { valid: true, email: data.users[0].email } : { valid: false };
}

function isAuthorized_(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === CONSTANTS.SUPER_ADMIN_EMAIL.toLowerCase()) return true;
  try {
    const url = `${CONSTANTS.FIREBASE_URL}admin_whitelist.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    if (!data) return false;
    const list = Object.values(data).map(v => String(v).trim().toLowerCase());
    return list.includes(cleanEmail);
  } catch (e) { return false; }
}

function jsonResponse_(obj) { 
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}
