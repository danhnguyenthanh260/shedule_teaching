const CalendarService = {
  /**
   * Get or create calendar by name
   * @param {string} calendarName - Name of calendar
   * @returns {Calendar} Calendar object
   */
  getOrCreateCalendar: function(calendarName) {
    try {
      AppLogger.info('Getting calendar: ' + calendarName);

      // Thử lấy calendar theo tên
      const calendars = CalendarApp.getAllCalendars();
      for (let i = 0; i < calendars.length; i++) {
        if (calendars[i].getName() === calendarName) {
          AppLogger.info('Calendar found: ' + calendarName);
          return calendars[i];
        }
      }

      // Nếu không tìm thấy, dùng calendar chính (Primary)
      AppLogger.warn('Calendar not found, using primary calendar');
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

      AppLogger.info('Creating event: ' + title, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        location: location
      });

      const options = {
        location: location,
        description: event.description || '',
        guests: event.guests || ''
      };

      const createdEvent = calendar.createEvent(title, startDate, endDate, options);

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
   * Create multiple events
   * @param {string} calendarName - Calendar name
   * @param {Array} events - Array of event objects
   * @returns {Object} Result with count and details
   */
  createEvents: function(calendarName, events) {
    try {
      if (!Array.isArray(events)) {
        throw new Error('Events must be an array');
      }

      if (events.length === 0) {
        throw new Error('Events array cannot be empty');
      }

      const calendar = this.getOrCreateCalendar(calendarName);
      const results = {
        total: events.length,
        success: 0,
        failed: 0,
        errors: []
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
        const result = this.createEvent(calendar, event);
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({
            index: i,
            title: event.title,
            message: result.error
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
