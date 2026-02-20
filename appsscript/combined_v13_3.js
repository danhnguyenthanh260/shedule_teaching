/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 13.3 - ROBUST REST API & 204 FIX
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

/**
 * 🌐 Google Calendar REST API Wrapper
 */
const GoogleCalendarAPI = {
  baseUrl: 'https://www.googleapis.com/calendar/v3',
  
  fetch_: function(accessToken, path, options = {}) {
    const url = this.baseUrl + path;
    const params = {
      method: options.method || 'get',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    if (options.payload) params.payload = JSON.stringify(options.payload);
    
    const response = UrlFetchApp.fetch(url, params);
    const code = response.getResponseCode();
    const text = response.getContentText();
    
    if (code >= 400) {
      AppLogger.error('API Error (' + code + '): ' + path, text);
      const errObj = { code: code, body: text };
      throw new Error(JSON.stringify(errObj));
    }
    
    // ✅ FIX: 204 No Content (thường gặp khi DELETE) trả về text rỗng, không thể parse JSON
    if (!text || text.trim() === '') {
      return { status: 'success', message: 'No Content (204)' };
    }
    
    return JSON.parse(text);
  },

  getCalendarMetadata: function(accessToken, calendarId = 'primary') {
    try {
      return this.fetch_(accessToken, '/users/me/calendarList/' + encodeURIComponent(calendarId));
    } catch (e) {
      AppLogger.info('Could not fetch calendar metadata', e.message);
      return { summary: 'Primary Calendar', id: 'primary' };
    }
  },

  listEvents: function(accessToken, calendarId, timeMin, timeMax) {
    const path = '/calendars/' + encodeURIComponent(calendarId) + '/events' +
               '?timeMin=' + encodeURIComponent(timeMin) +
               '&timeMax=' + encodeURIComponent(timeMax) +
               '&showDeleted=false&singleEvents=true';
    return this.fetch_(accessToken, path);
  },

  createEvent: function(accessToken, calendarId, eventData) {
    return this.fetch_(accessToken, '/calendars/' + encodeURIComponent(calendarId) + '/events', {
      method: 'post',
      payload: eventData
    });
  },

  patchEvent: function(accessToken, calendarId, eventId, eventData) {
    return this.fetch_(accessToken, '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId), {
      method: 'patch',
      payload: eventData
    });
  },

  deleteEvent: function(accessToken, calendarId, eventId) {
    return this.fetch_(accessToken, '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId), {
      method: 'delete'
    });
  }
};

/**
 * 🛠️ Core Service
 */
const CalendarService = {
  createEvents: function(calendarName, events, force = false, googleAccessToken = null) {
    if (!Array.isArray(events) || events.length === 0) {
      return { total: 0, success: 0, status: 'no_events' };
    }
    
    let useRestApi = !!googleAccessToken;
    let targetCalendarName = calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME;

    const results = { 
      total: events.length, 
      success: 0, 
      updated: 0, 
      skipped: 0, 
      failed: 0, 
      errors: [],
      calendarName: '',
      calendarId: '',
      availableCalendars: [],
      mode: useRestApi ? 'DECENTRALIZED' : 'CENTRALIZED'
    };

    try {
      if (useRestApi) {
        // --- DECENTRALIZED SYNC ---
        const meta = GoogleCalendarAPI.getCalendarMetadata(googleAccessToken, 'primary');
        results.calendarName = meta.summary || 'User Primary';
        results.calendarId = meta.id || 'primary';
        
        events.forEach((ev, i) => {
          try {
            const start = new Date(ev.start);
            const end = new Date(ev.end);
            
            let existing = null;
            if (ev.signature && !force) {
               const timeMin = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString();
               const timeMax = new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString();
               const listResponse = GoogleCalendarAPI.listEvents(googleAccessToken, 'primary', timeMin, timeMax);
               
               if (listResponse.items) {
                 existing = listResponse.items.find(item => 
                   item.extendedProperties && 
                   item.extendedProperties.private && 
                   item.extendedProperties.private[CONSTANTS.SIGNATURE_TAG] === ev.signature
                 );
               }
            }

            const eventData = {
              summary: ev.title,
              location: ev.location || '',
              description: ev.description || '',
              start: { dateTime: start.toISOString(), timeZone: CONSTANTS.TIMEZONE },
              end: { dateTime: end.toISOString(), timeZone: CONSTANTS.TIMEZONE },
              extendedProperties: {
                private: {
                  [CONSTANTS.SOURCE_TAG]: 'fpt_scheduler',
                  [CONSTANTS.SIGNATURE_TAG]: ev.signature || ''
                }
              }
            };

            if (existing) {
               const unchanged = existing.summary === ev.title && 
                                 existing.location === (ev.location || '') &&
                                 Math.abs(new Date(existing.start.dateTime || existing.start.date).getTime() - start.getTime()) < 1000;
               if (unchanged && !force) {
                 results.skipped++;
                 return;
               }
               GoogleCalendarAPI.patchEvent(googleAccessToken, 'primary', existing.id, eventData);
               results.updated++;
            } else {
               GoogleCalendarAPI.createEvent(googleAccessToken, 'primary', eventData);
               results.success++;
            }
          } catch (e) {
            results.failed++;
            results.errors.push({ index: i, title: ev.title, message: e.toString() });
          }
        });
      } else {
        // --- CENTRALIZED SYNC ---
        const calendar = this.getCalendarInternal(targetCalendarName);
        results.calendarName = calendar.getName();
        results.calendarId = calendar.getId();
        results.availableCalendars = CalendarApp.getAllCalendars().map(c => c.getName());

        events.forEach((ev, i) => {
          try {
            const start = new Date(ev.start);
            const end = new Date(ev.end);
            
            if (ev.signature && !force) {
              const rangeStart = new Date(start.getTime() - 24 * 60 * 60 * 1000); 
              const rangeEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);   
              const existingEvents = calendar.getEvents(rangeStart, rangeEnd);
              const existing = existingEvents.find(e => e.getTag(CONSTANTS.SIGNATURE_TAG) === ev.signature);
              
              if (existing) {
                 const unchanged = existing.getTitle() === ev.title && 
                                   existing.getLocation() === (ev.location || '') &&
                                   Math.abs(existing.getStartTime().getTime() - start.getTime()) < 1000;
                 if (unchanged) { results.skipped++; return; }
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
      }
    } catch (e) { throw e; }
    return results;
  },

  clearEvents: function(calendarName, googleAccessToken = null) {
    let deletedCount = 0;
    const now = new Date();
    // Phạm vi xóa rộng (6 tháng)
    const startTime = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString();
    const endTime = new Date(now.getTime() + (180 * 24 * 60 * 60 * 1000)).toISOString();

    if (googleAccessToken) {
      // --- DECENTRALIZED CLEAR ---
      const listResponse = GoogleCalendarAPI.listEvents(googleAccessToken, 'primary', startTime, endTime);
      if (listResponse.items) {
        listResponse.items.forEach(item => {
          if (item.extendedProperties && 
              item.extendedProperties.private && 
              item.extendedProperties.private[CONSTANTS.SOURCE_TAG] === 'fpt_scheduler') {
            GoogleCalendarAPI.deleteEvent(googleAccessToken, 'primary', item.id);
            deletedCount++;
          }
        });
      }
    } else {
      // --- CENTRALIZED CLEAR ---
      const calendar = this.getCalendarInternal(calendarName);
      const events = calendar.getEvents(new Date(startTime), new Date(endTime));
      events.forEach(event => {
        if (event.getTag(CONSTANTS.SOURCE_TAG) === 'fpt_scheduler') {
          event.deleteEvent();
          deletedCount++;
        }
      });
    }
    return { deletedCount: deletedCount };
  },

  getCalendarInternal: function(name) {
    if (!name || name.toLowerCase() === 'primary') return CalendarApp.getDefaultCalendar();
    const calendars = CalendarApp.getAllCalendars();
    for (var i = 0; i < calendars.length; i++) {
        if (calendars[i].getName() === name) return calendars[i];
    }
    try {
        const cal = CalendarApp.getCalendarById(name);
        if (cal) return cal;
    } catch (e) {}
    return CalendarApp.getDefaultCalendar();
  }
};

/**
 * 📡 Entry Points
 */

function doGet(e) {
  return jsonResponse_({ 
    status: CONSTANTS.SUCCESS, version: '13.3', message: 'FPT Scheduler GAS Engine V13.3 (204 Fix) is ACTIVE' 
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'sync';
    
    // Auth Check
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      const authResult = verifyFirebaseToken_(payload.idToken);
      if (!authResult.valid || !isAuthorized_(authResult.email)) {
          throw new Error('Unauthorized Access (V13.3)');
      }
    }

    if (action === 'readSheet') {
      const ss = SpreadsheetApp.openByUrl(payload.url);
      const data = ss.getSheets()[0].getDataRange().getValues();
      return jsonResponse_({ status: CONSTANTS.SUCCESS, data: data.slice(parseInt(payload.startRow || '1') - 1) });
    }

    if (action === 'clearCalendar') {
      const res = CalendarService.clearEvents(
        payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME,
        payload.googleAccessToken || null
      );
      return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '13.3', message: 'Cleared', data: res });
    }

    const res = CalendarService.createEvents(
      payload.calendarName, 
      payload.events || [], 
      payload.force || false,
      payload.googleAccessToken || null
    );
    
    return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '13.3', data: res });
    
  } catch (err) {
    AppLogger.error('POST Error', err);
    return jsonResponse_({ status: CONSTANTS.ERROR, version: '13.3', message: err.toString() });
  }
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
  try {
    const url = `${CONSTANTS.FIREBASE_URL}admin_whitelist.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    if (data) {
      const list = Object.values(data).map(v => String(v).trim().toLowerCase());
      if (list.includes(cleanEmail)) return true;
    }
  } catch (e) {}
  if (CONSTANTS.ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail)) return true;
  return true; 
}

function jsonResponse_(obj) { 
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}
