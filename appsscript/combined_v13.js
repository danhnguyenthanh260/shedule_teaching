/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 13.0 - DECENTRALIZED SYNC
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
 * 🌐 Google Calendar REST API Wrapper (For acting on behalf of user)
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
      throw new Error('Google Calendar API Error: ' + text);
    }
    return JSON.parse(text);
  },

  getCalendarMetadata: function(accessToken, calendarId = 'primary') {
    return this.fetch_(accessToken, '/users/me/calendarList/' + encodeURIComponent(calendarId));
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
  }
};

/**
 * 🛠️ Core Service: Handles logic using either CalendarApp (Admin) or REST API (User)
 */
const CalendarService = {
  /**
   * Đồng bộ danh sách sự kiện
   */
  createEvents: function(calendarName, events, force = false, googleAccessToken = null) {
    if (!Array.isArray(events) || events.length === 0) {
      return { total: 0, success: 0, status: 'no_events' };
    }
    
    let calendarId = 'primary'; // Mặc định là lịch chính của người dùng
    let useRestApi = !!googleAccessToken;
    let targetCalendarName = calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME;
    let diagnosticInfo = {
      calendarName: 'Loading...',
      calendarId: 'Loading...',
      mode: useRestApi ? 'DECENTRALIZED (USER)' : 'CENTRALIZED (ADMIN)'
    };

    const results = { 
      total: events.length, 
      success: 0, 
      updated: 0, 
      skipped: 0, 
      failed: 0, 
      errors: [],
      calendarName: '',
      calendarId: '',
      availableCalendars: []
    };

    try {
      if (useRestApi) {
        // --- CHẾ ĐỘ PHÂN TÁN (User access token) ---
        // 1. Kiểm tra danh tính lịch
        const meta = GoogleCalendarAPI.getCalendarMetadata(googleAccessToken, 'primary');
        results.calendarName = meta.summary || 'User Primary Calendar';
        results.calendarId = meta.id || 'primary';
        
        events.forEach((ev, i) => {
          try {
            const start = new Date(ev.start);
            const end = new Date(ev.end);
            
            // Tìm trùng lặp (REST API)
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
               // Kiểm tra thay đổi thực sự
               const unchanged = existing.summary === ev.title && 
                                 existing.location === (ev.location || '') &&
                                 new Date(existing.start.dateTime).getTime() === start.getTime();
               if (unchanged && !force) {
                 results.skipped++;
                 return;
               }
               
               // Patch (Cập nhật)
               GoogleCalendarAPI.patchEvent(googleAccessToken, 'primary', existing.id, eventData);
               results.updated++;
            } else {
               // Tạo mới
               GoogleCalendarAPI.createEvent(googleAccessToken, 'primary', eventData);
               results.success++;
            }
          } catch (e) {
            results.failed++;
            results.errors.push({ index: i, title: ev.title, message: e.toString() });
          }
        });

      } else {
        // --- CHẾ ĐỘ TẬP TRUNG (CalendarApp) ---
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
                 
                 existing.setTitle(ev.title); 
                 existing.setTime(start, end);
                 existing.setLocation(ev.location || ''); 
                 existing.setDescription(ev.description || '');
                 results.updated++; return;
              }
            }
            
            const created = calendar.createEvent(ev.title, start, end, { 
              location: ev.location || '', 
              description: ev.description || '' 
            });
            created.setTag(CONSTANTS.SOURCE_TAG, 'fpt_scheduler');
            if (ev.signature) created.setTag(CONSTANTS.SIGNATURE_TAG, ev.signature);
            results.success++;
          } catch (e) {
            results.failed++;
            results.errors.push({ index: i, title: ev.title, message: e.toString() });
          }
        });
      }
    } catch (criticalErr) {
      AppLogger.error('Critical Sync Error', criticalErr);
      throw criticalErr;
    }

    return results;
  },

  /**
   * (Helper) Lấy lịch cho CalendarApp
   */
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
  return ContentService.createTextOutput(JSON.stringify({ 
    status: CONSTANTS.SUCCESS, version: '13.0', message: 'FPT Scheduler GAS Engine V13.0 (Decentralized Support) is ACTIVE' 
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    // Auth Check
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      const authResult = verifyFirebaseToken_(payload.idToken);
      if (!authResult.valid || !isAuthorized_(authResult.email)) {
          throw new Error('Unauthorized Access (V13.0)');
      }
    }

    if (payload.action === 'readSheet') {
      const ss = SpreadsheetApp.openByUrl(payload.url);
      const data = ss.getSheets()[0].getDataRange().getValues();
      return jsonResponse_({ status: CONSTANTS.SUCCESS, data: data.slice(parseInt(payload.startRow || '1') - 1) });
    }

    // Default: Sync
    const res = CalendarService.createEvents(
      payload.calendarName, 
      payload.events || [], 
      payload.force || false,
      payload.googleAccessToken || null
    );
    
    return jsonResponse_({ status: CONSTANTS.SUCCESS, version: '13.0', data: res });
    
  } catch (err) {
    AppLogger.error('POST Error', err);
    return jsonResponse_({ status: CONSTANTS.ERROR, version: '13.0', message: err.toString() });
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
  
  // 1. Check Admin Whitelist
  try {
    const url = `${CONSTANTS.FIREBASE_URL}admin_whitelist.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    if (!data) return false;
    const list = Object.values(data).map(v => String(v).trim().toLowerCase());
    if (list.includes(cleanEmail)) return true;
  } catch (e) {}
  
  // 2. Default Admins
  if (CONSTANTS.ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail)) return true;
  
  // 3. Normal users are technically authorized to sync their own calendar if they have a Google token
  // The isAuthorized_ check here is primarily for Admin features (readSheet, etc.)
  // For Sync, the presence of a valid Firebase token is enough for individual users.
  return true; 
}

function jsonResponse_(obj) { 
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}
