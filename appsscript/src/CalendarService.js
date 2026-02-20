const CalendarService = {
  /**
   * Get or create calendar by name
   * @param {string} calendarName - Name of calendar
   * @returns {Calendar} Calendar object
   */
  getOrCreateCalendar: function(calendarName) {
    try {
      const calendars = CalendarApp.getAllCalendars();
      const availableNames = calendars.map(c => c.getName());
      AppLogger.info('Getting calendar: ' + calendarName, { available: availableNames });

      // 🎯 SPECIAL CASE: 'primary' or empty means the user's default calendar
      if (!calendarName || calendarName.toLowerCase() === 'primary') {
        AppLogger.info('Using default (primary) calendar');
        return CalendarApp.getDefaultCalendar();
      }

      // Thử lấy calendar theo tên
      for (let i = 0; i < calendars.length; i++) {
        if (calendars[i].getName() === calendarName) {
          AppLogger.info('Calendar found: ' + calendarName);
          return calendars[i];
        }
      }

      // Nếu không tìm thấy, dùng calendar chính (Primary)
      AppLogger.warn('Calendar nominated "' + calendarName + '" not found. Falling back to primary calendar');
      return CalendarApp.getDefaultCalendar();
    } catch (e) {
      AppLogger.error('Error getting calendar', e);
      throw new Error(CONSTANTS.ERRORS.CALENDAR_NOT_FOUND);
    }
  },

  /**
   * Validate event object
   * @param {Object} event - Event object
   * @returns {boolean} True if valid
   */
  isValidEvent: function(event) {
    if (!event.title || typeof event.title !== 'string') {
      AppLogger.warn('Invalid event title', event.title);
      return false;
    }

    if (!event.start || !this.isValidDateString(event.start)) {
      AppLogger.warn('Invalid event start date', event.start);
      return false;
    }

    if (!event.end || !this.isValidDateString(event.end)) {
      AppLogger.warn('Invalid event end date', event.end);
      return false;
    }

    return true;
  },

  /**
   * Validate ISO 8601 date string
   * @param {string} dateString - Date string
   * @returns {boolean} True if valid
   */
  isValidDateString: function(dateString) {
    try {
      const date = new Date(dateString);
      return date instanceof Date && !isNaN(date.getTime());
    } catch (e) {
      return false;
    }
  },

  /**
   * Create event in calendar
   * @param {Calendar} calendar - Calendar object
   * @param {Object} event - Event object with title, start, end, location
   * @returns {Object} Result with status and eventId
   */
  createEvent: function(calendar, event) {
    try {
      const title = event.title.trim();
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      const location = event.location ? event.location.trim() : '';
      const signature = event.signature;

      // 🔍 1. Check for duplicates using Signature (if provided)
      if (signature) {
        // Get events in this time range
        const existingEvents = calendar.getEvents(startDate, endDate);
        for (let i = 0; i < existingEvents.length; i++) {
          const ev = existingEvents[i];
          const existingSig = ev.getTag('signature');
          
          if (existingSig === signature) {
            AppLogger.info('Skipping duplicate event (signature match): ' + title, { signature });
            return {
              success: true, // Idempotent success
              eventId: ev.getId(),
              title: title,
              skipped: true
            };
          }
        }
      }

      AppLogger.info('Creating event: ' + title, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        location: location,
        signature: signature
      });

      const options = {
        location: location,
        description: event.description || '',
        guests: event.guests || ''
      };

      const createdEvent = calendar.createEvent(title, startDate, endDate, options);

      // ✅ 2. Set App Source Tag & Signature for identification
      try {
        createdEvent.setTag('app_source', 'fpt_scheduler');
        if (signature) {
          createdEvent.setTag('signature', signature);
        }
      } catch (tagError) {
        AppLogger.warn('Failed to set tags for event', tagError);
      }

      AppLogger.info('Event created successfully', {
        eventId: createdEvent.getId(),
        title: title
      });

      return {
        success: true,
        eventId: createdEvent.getId(),
        title: title
      };
    } catch (e) {
      AppLogger.error('Error creating event: ' + event.title, e);
      return {
        success: false,
        title: event.title,
        error: e.message
      };
    }
  },

  /**
   * Delete all events created by this app (identified by tag)
   * @param {string} calendarName 
   * @returns {Object} Result summary
   */
  clearEvents: function(calendarName) {
    try {
      const calendar = this.getOrCreateCalendar(calendarName);
      
      // 🎯 EXPANDED RANGE: Look back 1 year and forward 1 year (Total 2 years)
      const now = new Date();
      const startTime = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
      const endTime = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
      
      AppLogger.info(`Scanning for events to clear in range: ${startTime.toDateString()} to ${endTime.toDateString()}`);
      
      const events = calendar.getEvents(startTime, endTime);
      let deletedCount = 0;
      
      events.forEach(event => {
        const appSource = event.getTag('app_source');
        const description = event.getDescription() || '';
        const title = event.getTitle() || '';
        
        // 🔍 MULTI-LEVEL DETECTION:
        // 1. Primary: Official App Tag
        // 2. Fallback: Search for "[FPT_SCHEDULER" in description
        // 3. Fallback: Specific pattern in description from sync logic
        const isAppEvent = (appSource === 'fpt_scheduler') || 
                           (description.indexOf('[FPT_SCHEDULER') !== -1) ||
                           (description.indexOf('Resources:') !== -1 && description.length < 500); 

        if (isAppEvent) {
          event.deleteEvent();
          deletedCount++;
        }
      });
      
      AppLogger.info(`Successfully cleared ${deletedCount} events from ${calendarName}`);
      return {
        status: 'success',
        deletedCount: deletedCount
      };
    } catch (e) {
      AppLogger.error('Error clearing events', e);
      throw e;
    }
  },

  /**
   * Create multiple events
   * @param {string} calendarName - Calendar name
   * @param {Array} events - Array of event objects
   * @param {boolean} force - Whether to bypass duplicate check
   * @returns {Object} Result with count and details
   */
  createEvents: function(calendarName, events, force = false) {
    try {
      if (!Array.isArray(events)) {
        throw new Error('Events must be an array');
      }

      if (events.length === 0) {
        throw new Error('Events array cannot be empty');
      }

      const calendar = this.getOrCreateCalendar(calendarName);
      const allCalendars = CalendarApp.getAllCalendars();
      const results = {
        total: events.length,
        success: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        calendarName: calendar.getName(),
        calendarId: calendar.getId(),
        availableCalendars: allCalendars.map(c => c.getName())
      };

      for (let i = 0; i < events.length; i++) {
        const event = events[i];

        // Validate event
        if (!this.isValidEvent(event)) {
          AppLogger.warn('Invalid event at index ' + i, event);
          results.failed++;
          results.errors.push({
            index: i,
            title: event.title || 'Unknown',
            message: CONSTANTS.ERRORS.INVALID_DATE
          });
          continue;
        }

        // Create event
        const result = this.createEvent(calendar, event, force);
        if (result.success) {
          if (result.skipped) {
            results.skipped++;
          } else {
            results.success++;
          }
        } else {
          results.failed++;
          results.errors.push({
            index: i,
            title: event.title,
            message: result.error || 'Lỗi không xác định'
          });
        }
      }

      return results;
    } catch (e) {
      AppLogger.error('Error in createEvents', e);
      throw e;
    }
  }
};
