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
 * 🛠️ Calendar Service v13.3 (Enhanced with ColorId support)
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

    AppLogger.info('Starting sync for ' + events.length + ' events. Force: ' + force + ', Mode: ' + results.mode);

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
              colorId: ev.colorId || '', // 🎨 Color Support
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
            AppLogger.error('Event ' + i + ' failed', e.toString());
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
                 if (ev.colorId) existing.setColor(ev.colorId); // 🎨 Color Support
                 results.updated++; return;
              }
            }
            const created = calendar.createEvent(ev.title, start, end, { location: ev.location || '', description: ev.description || '' });
            created.setTag(CONSTANTS.SOURCE_TAG, 'fpt_scheduler');
            if (ev.signature) created.setTag(CONSTANTS.SIGNATURE_TAG, ev.signature);
            if (ev.colorId) created.setColor(ev.colorId); // 🎨 Color Support
            results.success++;
          } catch (e) {
            results.failed++;
            results.errors.push({ index: i, title: ev.title, message: e.toString() });
          }
        });
      }
    } catch (e) { 
      AppLogger.error('createEvents Critical failure', e.toString());
      throw e; 
    }
    
    return {
      total: results.total,
      success: results.success,
      updated: results.updated,
      skipped: results.skipped,
      failed: results.failed,
      errors: results.errors,
      calendarName: results.calendarName,
      calendarId: results.calendarId,
      mode: results.mode
    };
  },

  clearEvents: function(calendarName, googleAccessToken = null) {
    let deletedCount = 0;
    const now = new Date();
    const startTime = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString();
    const endTime = new Date(now.getTime() + (180 * 24 * 60 * 60 * 1000)).toISOString();

    if (googleAccessToken) {
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

