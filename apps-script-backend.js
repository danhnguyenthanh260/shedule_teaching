/**
 * FPT Scheduler - Google Apps Script Backend
 * Handle calendar sync with duplicate detection and update logic
 */

// ==================== CONFIGURATION ====================

const CONFIG = {
  DEFAULT_CALENDAR_NAME: 'FPT Scheduler',
  SIGNATURE_TAG: 'fpt_signature',
  SOURCE_TAG: 'fpt_source',
  SYNCED_AT_TAG: 'fpt_synced_at'
};

// ==================== MAIN HANDLER ====================

/**
 * Handle POST request from frontend
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    // Verify Firebase ID token (if needed)
    // verifyFirebaseToken(payload.idToken);
    
    const result = syncEventsToCalendar(payload);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in doPost: ' + error.message);
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Main sync logic with duplicate detection
 */
function syncEventsToCalendar(payload) {
  const { events, calendarName, idToken } = payload;
  
  if (!events || events.length === 0) {
    throw new Error('No events provided');
  }
  
  // Get or create calendar
  const calendar = getOrCreateCalendar(calendarName || CONFIG.DEFAULT_CALENDAR_NAME);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  
  for (const eventData of events) {
    try {
      const { signature } = eventData;
      
      if (!signature) {
        // No signature → always create new
        createEventWithSignature(calendar, eventData);
        created++;
        continue;
      }
      
      // ✅ Find existing event by signature
      const existingEvent = findEventBySignature(calendar, signature);
      
      if (existingEvent) {
        // ✅ Compare content
        if (hasChanges(existingEvent, eventData)) {
          // ✅ Update existing event
          updateEvent(existingEvent, eventData);
          updated++;
        } else {
          // ✅ Skip identical event
          skipped++;
        }
      } else {
        // ✅ Create new event
        createEventWithSignature(calendar, eventData);
        created++;
      }
      
    } catch (err) {
      errors.push({
        title: eventData.title || 'Unknown',
        message: err.message
      });
    }
  }
  
  return {
    status: 'success',
    message: `Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${errors.length}`,
    data: {
      created,
      updated,
      skipped,
      failed: errors.length,
      errors: errors.slice(0, 5) // Limit error log
    },
    timestamp: new Date().toISOString()
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get or create calendar by name
 */
function getOrCreateCalendar(calendarName) {
  // Try to find existing calendar
  const calendars = CalendarApp.getOwnedCalendarsByName(calendarName);
  
  if (calendars.length > 0) {
    return calendars[0];
  }
  
  // Create new calendar
  const calendar = CalendarApp.createCalendar(calendarName, {
    summary: 'Auto-synced from FPT Scheduler',
    timezone: 'Asia/Ho_Chi_Minh'
  });
  
  Logger.log(`Created new calendar: ${calendarName}`);
  return calendar;
}

/**
 * Find event by signature
 */
function findEventBySignature(calendar, signature) {
  if (!signature) return null;
  
  // Query events in next 1 year (adjust range as needed)
  const now = new Date();
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  
  const events = calendar.getEvents(now, oneYearLater);
  
  // Find by signature tag
  for (const event of events) {
    const eventSignature = event.getTag(CONFIG.SIGNATURE_TAG);
    if (eventSignature === signature) {
      return event;
    }
  }
  
  return null;
}

/**
 * Create event with signature
 */
function createEventWithSignature(calendar, eventData) {
  const { title, start, end, location, description, signature } = eventData;
  
  // Parse ISO datetime strings
  const startTime = new Date(start);
  const endTime = new Date(end);
  
  // Validate dates
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new Error(`Invalid date format: start=${start}, end=${end}`);
  }
  
  // Create event
  const event = calendar.createEvent(title, startTime, endTime, {
    location: location || '',
    description: description || ''
  });
  
  // Store metadata as tags
  if (signature) {
    event.setTag(CONFIG.SIGNATURE_TAG, signature);
  }
  event.setTag(CONFIG.SOURCE_TAG, 'FPT Scheduler');
  event.setTag(CONFIG.SYNCED_AT_TAG, new Date().toISOString());
  
  Logger.log(`Created event: ${title} at ${start}`);
  return event;
}

/**
 * Update existing event
 */
function updateEvent(existingEvent, newData) {
  const { title, start, end, location, description } = newData;
  
  // Parse dates
  const startTime = new Date(start);
  const endTime = new Date(end);
  
  // Update fields
  existingEvent.setTitle(title);
  existingEvent.setTime(startTime, endTime);
  existingEvent.setLocation(location || '');
  existingEvent.setDescription(description || '');
  
  // Update sync timestamp
  existingEvent.setTag(CONFIG.SYNCED_AT_TAG, new Date().toISOString());
  
  Logger.log(`Updated event: ${title}`);
}

/**
 * Check if event has changes
 */
function hasChanges(existingEvent, newData) {
  const currentTitle = existingEvent.getTitle();
  const currentStart = existingEvent.getStartTime().toISOString();
  const currentEnd = existingEvent.getEndTime().toISOString();
  const currentLocation = existingEvent.getLocation() || '';
  const currentDescription = existingEvent.getDescription() || '';
  
  // Compare all fields
  return (
    currentTitle !== newData.title ||
    !isSameDateTime(currentStart, newData.start) ||
    !isSameDateTime(currentEnd, newData.end) ||
    currentLocation !== (newData.location || '') ||
    currentDescription !== (newData.description || '')
  );
}

/**
 * Compare ISO datetime strings (ignore milliseconds)
 */
function isSameDateTime(iso1, iso2) {
  // Compare up to seconds (ignore milliseconds)
  const t1 = iso1.substring(0, 19);
  const t2 = iso2.substring(0, 19);
  return t1 === t2;
}

// ==================== TESTING ====================

/**
 * Test function - Run in Apps Script Editor
 */
function testSync() {
  const payload = {
    calendarName: "FPT Scheduler Test",
    events: [
      {
        title: "[Review] Nguyễn Văn A",
        start: "2026-01-25T07:30:00+07:00",
        end: "2026-01-25T09:00:00+07:00",
        location: "Room 101",
        description: "Test event from Apps Script",
        signature: "test1234567890ab"
      },
      {
        title: "[Review] Trần Thị B",
        start: "2026-01-25T09:10:00+07:00",
        end: "2026-01-25T10:40:00+07:00",
        location: "Room 102",
        description: "Test event 2",
        signature: "test2345678901bc"
      }
    ]
  };
  
  const result = syncEventsToCalendar(payload);
  Logger.log(JSON.stringify(result, null, 2));
  
  // Test again with same data → should skip
  Logger.log("\n=== Second run (should skip) ===");
  const result2 = syncEventsToCalendar(payload);
  Logger.log(JSON.stringify(result2, null, 2));
  
  // Test with changed data → should update
  Logger.log("\n=== Third run (should update) ===");
  payload.events[0].title = "[Review] Nguyễn Văn A - UPDATED";
  payload.events[0].location = "Room 999 - CHANGED";
  const result3 = syncEventsToCalendar(payload);
  Logger.log(JSON.stringify(result3, null, 2));
}

/**
 * Clean up test events
 */
function cleanupTestEvents() {
  const calendar = CalendarApp.getOwnedCalendarsByName("FPT Scheduler Test")[0];
  if (!calendar) {
    Logger.log("Test calendar not found");
    return;
  }
  
  const now = new Date();
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const events = calendar.getEvents(now, oneYearLater);
  
  let deleted = 0;
  for (const event of events) {
    if (event.getTag(CONFIG.SOURCE_TAG) === 'FPT Scheduler') {
      event.deleteEvent();
      deleted++;
    }
  }
  
  Logger.log(`Deleted ${deleted} test events`);
}
