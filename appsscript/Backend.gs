/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 13.3 - ROBUST REST API & COLOR SUPPORT
 * =====================================================
 */

const CONSTANTS = {
  DEFAULT_CALENDAR_NAME: "Schedule Teaching",
  TIMEZONE: "Asia/Ho_Chi_Minh",
  GAS_SECRET: "FPTxavalo2026",
  FIREBASE_URL:
    "https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/",
  ADMIN_EMAILS: ["ngohoangtruongdat@gmail.com", "ngohoangtruongdat2@gmail.com"],
  FIREBASE_WEB_API_KEY: "AIzaSyDRwHY6mgdHKjkanLJk8BFpOQSeV5sqvaY",
  SIGNATURE_TAG: "signature",
  SOURCE_TAG: "app_source",
  SUCCESS: "success",
  ERROR: "error",
};

const AppLogger = {
  info: (msg, data) => {
    const log = `[INFO] ${new Date().toISOString()} - ${msg}`;
    console.log(log, data || "");
    Logger.log(log + (data ? " " + JSON.stringify(data) : ""));
  },
  error: (msg, err) => {
    const log = `[ERROR] ${new Date().toISOString()} - ${msg}`;
    console.error(log, err || "");
    Logger.log(log + (err ? " " + err.toString() : ""));
  },
};

/**
 * 🌐 Google Calendar REST API Wrapper
 */
const GoogleCalendarAPI = {
  baseUrl: "https://www.googleapis.com/calendar/v3",

  fetch_: function (accessToken, path, options = {}) {
    const url = this.baseUrl + path;
    const params = {
      method: options.method || "get",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      muteHttpExceptions: true,
    };
    if (options.payload) params.payload = JSON.stringify(options.payload);

    const response = UrlFetchApp.fetch(url, params);
    const code = response.getResponseCode();
    const text = response.getContentText();

    if (code >= 400) {
      AppLogger.error("API Error (" + code + "): " + path, text);
      const errObj = { code: code, body: text };
      throw new Error(JSON.stringify(errObj));
    }

    if (!text || text.trim() === "") {
      return { status: "success", message: "No Content (204)" };
    }

    return JSON.parse(text);
  },

  getCalendarMetadata: function (accessToken, calendarId = "primary") {
    try {
      return this.fetch_(
        accessToken,
        "/users/me/calendarList/" + encodeURIComponent(calendarId),
      );
    } catch (e) {
      AppLogger.info("Could not fetch calendar metadata", e.message);
      return { summary: "Primary Calendar", id: "primary" };
    }
  },

  listEvents: function (accessToken, calendarId, timeMin, timeMax) {
    const path =
      "/calendars/" +
      encodeURIComponent(calendarId) +
      "/events" +
      "?timeMin=" +
      encodeURIComponent(timeMin) +
      "&timeMax=" +
      encodeURIComponent(timeMax) +
      "&showDeleted=false&singleEvents=true";
    return this.fetch_(accessToken, path);
  },

  createEvent: function (accessToken, calendarId, eventData) {
    return this.fetch_(
      accessToken,
      "/calendars/" + encodeURIComponent(calendarId) + "/events",
      {
        method: "post",
        payload: eventData,
      },
    );
  },

  patchEvent: function (accessToken, calendarId, eventId, eventData) {
    return this.fetch_(
      accessToken,
      "/calendars/" +
        encodeURIComponent(calendarId) +
        "/events/" +
        encodeURIComponent(eventId),
      {
        method: "patch",
        payload: eventData,
      },
    );
  },

  deleteEvent: function (accessToken, calendarId, eventId) {
    return this.fetch_(
      accessToken,
      "/calendars/" +
        encodeURIComponent(calendarId) +
        "/events/" +
        encodeURIComponent(eventId),
      {
        method: "delete",
      },
    );
  },

  /**
   * 🔍 Tìm ID của lịch theo tên (Dùng cho REST API)
   */
  findCalendarIdByName: function (accessToken, name) {
    if (!name || name.toLowerCase() === "primary") return "primary";
    try {
      const list = this.fetch_(accessToken, "/users/me/calendarList");
      if (list.items) {
        const found = list.items.find(
          (c) => c.summary === name || c.id === name,
        );
        if (found) return found.id;
      }
    } catch (e) {
      AppLogger.error("Error finding calendar by name", e);
    }
    return "primary";
  },
};

/**
 * 🛠️ Core Service
 */
const CalendarService = {
  createEvents: function (
    calendarName,
    events,
    force = false,
    googleAccessToken = null,
    conflictMode = null,
  ) {
    if (!Array.isArray(events) || events.length === 0)
      return { total: 0, success: 0 };

    let useRestApi = !!googleAccessToken;
    let targetCalendarName = calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME;

    const results = {
      total: events.length,
      success: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      conflicts: [],
    };

    try {
      if (useRestApi) {
        const calendarId = GoogleCalendarAPI.findCalendarIdByName(
          googleAccessToken,
          targetCalendarName,
        );

        // 📅 Tìm min/max date từ tất cả events để query 1 lần
        var globalMin = Infinity,
          globalMax = -Infinity;
        events.forEach(function (ev) {
          var s = new Date(ev.start).getTime();
          var e = new Date(ev.end).getTime();
          if (s < globalMin) globalMin = s;
          if (e > globalMax) globalMax = e;
        });
        var queryMin = new Date(globalMin - 24 * 60 * 60 * 1000).toISOString();
        var queryMax = new Date(globalMax + 24 * 60 * 60 * 1000).toISOString();

        // 🔍 Lấy tất cả event hiện có trên Calendar 1 lần (tránh N+1 queries)
        var existingEvents = [];
        var pageToken = null;
        do {
          var listPath =
            "/calendars/" +
            encodeURIComponent(calendarId) +
            "/events?timeMin=" +
            encodeURIComponent(queryMin) +
            "&timeMax=" +
            encodeURIComponent(queryMax) +
            "&showDeleted=false&singleEvents=true&maxResults=250";
          if (pageToken) listPath += "&pageToken=" + pageToken;
          var listRes = GoogleCalendarAPI.fetch_(googleAccessToken, listPath);
          if (listRes.items)
            existingEvents = existingEvents.concat(listRes.items);
          pageToken = listRes.nextPageToken;
        } while (pageToken);

        AppLogger.info(
          "Fetched " +
            existingEvents.length +
            " existing events for overlap check",
        );

        events.forEach(function (ev, i) {
          try {
            var newStart = new Date(ev.start).getTime();
            var newEnd = new Date(ev.end).getTime();

            // 🕐 Tìm event cũ bị overlap thời gian
            var overlapping = existingEvents.filter(function (old) {
              var oldStart = new Date(
                old.start.dateTime || old.start.date,
              ).getTime();
              var oldEnd = new Date(old.end.dateTime || old.end.date).getTime();
              // Overlap = newStart < oldEnd AND newEnd > oldStart
              return newStart < oldEnd && newEnd > oldStart;
            });

            var eventData = {
              summary: ev.title,
              location: ev.location || "",
              description: ev.description || "",
              start: { dateTime: new Date(ev.start).toISOString() },
              end: { dateTime: new Date(ev.end).toISOString() },
              extendedProperties: {
                private: {
                  [CONSTANTS.SOURCE_TAG]: "fpt_scheduler",
                  [CONSTANTS.SIGNATURE_TAG]: ev.signature || "",
                },
              },
            };
            if (ev.colorId && String(ev.colorId).trim() !== "")
              eventData.colorId = String(ev.colorId);

            if (overlapping.length > 0) {
              // === CÓ XUNG ĐỘT ===
              if (!conflictMode) {
                // Lần đầu sync → skip + báo conflict chi tiết
                results.skipped++;
                overlapping.forEach(function (old) {
                  results.conflicts.push({
                    newEvent: ev.title,
                    newStart: ev.start,
                    newEnd: ev.end,
                    oldEvent: old.summary || "(Không có tiêu đề)",
                    oldStart: old.start.dateTime || old.start.date,
                    oldEnd: old.end.dateTime || old.end.date,
                    oldEventId: old.id,
                  });
                });
              } else if (conflictMode === "insert") {
                // Option 1: Chèn vô chung (tạo mới, bỏ qua trùng)
                GoogleCalendarAPI.createEvent(
                  googleAccessToken,
                  calendarId,
                  eventData,
                );
                results.success++;
              } else if (conflictMode === "keep_old") {
                // Option 2: Giữ lịch cũ, bỏ event mới trùng
                results.skipped++;
              } else if (conflictMode === "replace") {
                // Option 3: Xóa lịch cũ, thay bằng lịch mới
                overlapping.forEach(function (old) {
                  try {
                    GoogleCalendarAPI.deleteEvent(
                      googleAccessToken,
                      calendarId,
                      old.id,
                    );
                  } catch (delErr) {
                    AppLogger.error(
                      "Failed to delete old event " + old.id,
                      delErr,
                    );
                  }
                });
                GoogleCalendarAPI.createEvent(
                  googleAccessToken,
                  calendarId,
                  eventData,
                );
                results.updated++;
              }
            } else {
              // === KHÔNG XUNG ĐỘT → Tạo mới bình thường ===
              GoogleCalendarAPI.createEvent(
                googleAccessToken,
                calendarId,
                eventData,
              );
              results.success++;
            }
          } catch (e) {
            results.failed++;
            results.errors.push({
              index: i,
              title: ev.title,
              message: e.toString(),
            });
          }
        });
      } else {
        // --- CENTRALIZED mode ---
        var calendar = this.getCalendarInternal(targetCalendarName);
        events.forEach(function (ev, i) {
          try {
            var start = new Date(ev.start);
            var end = new Date(ev.end);
            var created = calendar.createEvent(ev.title, start, end, {
              location: ev.location || "",
              description: ev.description || "",
            });
            created.setTag(CONSTANTS.SOURCE_TAG, "fpt_scheduler");
            if (ev.signature)
              created.setTag(CONSTANTS.SIGNATURE_TAG, ev.signature);
            if (ev.colorId) created.setColor(ev.colorId);
            results.success++;
          } catch (e) {
            results.failed++;
          }
        });
      }
    } catch (e) {
      throw e;
    }
    return results;
  },

  clearEvents: function (calendarName, googleAccessToken = null) {
    let deletedCount = 0;
    const now = new Date();
    // 🔍 Dải thời gian 180 ngày như bạn yêu cầu (Jan -> Feb là ~30 ngày, 180 là dư sức)
    const startTimeNum = now.getTime() - 180 * 24 * 60 * 60 * 1000;
    const endTimeNum = now.getTime() + 180 * 24 * 60 * 60 * 1000;
    const startTimeStr = new Date(startTimeNum).toISOString();
    const endTimeStr = new Date(endTimeNum).toISOString();

    const SEARCH_KEY = "Đồng bộ từ FPT Scheduler";

    if (googleAccessToken) {
      // 🌐 Chế độ REST API
      const calendarId = GoogleCalendarAPI.findCalendarIdByName(
        googleAccessToken,
        calendarName,
      );
      let pageToken = null;
      do {
        // Sử dụng tham số g (search) để tìm xuyên suốt tất cả các sự kiện có chuỗi nhận diện
        let path =
          "/calendars/" +
          encodeURIComponent(calendarId) +
          "/events" +
          "?timeMin=" +
          encodeURIComponent(startTimeStr) +
          "&timeMax=" +
          encodeURIComponent(endTimeStr) +
          "&q=" +
          encodeURIComponent(SEARCH_KEY) +
          "&showDeleted=false&singleEvents=true&maxResults=250";
        if (pageToken) path += "&pageToken=" + pageToken;

        const listResponse = GoogleCalendarAPI.fetch_(googleAccessToken, path);
        if (listResponse.items) {
          listResponse.items.forEach((item) => {
            // Kiểm tra kỹ lại description hoặc summary để tránh xóa nhầm
            const desc = item.description || "";
            if (desc.indexOf(SEARCH_KEY) !== -1) {
              GoogleCalendarAPI.deleteEvent(
                googleAccessToken,
                calendarId,
                item.id,
              );
              deletedCount++;
            }
          });
        }
        pageToken = listResponse.nextPageToken;
      } while (pageToken);
    } else {
      // 🏠 Chế độ Apps Script (Centralized)
      const calendar = this.getCalendarInternal(calendarName);
      // CalendarApp hỗ trợ tham số search rất mạnh
      const events = calendar.getEvents(
        new Date(startTimeNum),
        new Date(endTimeNum),
        { search: SEARCH_KEY },
      );
      events.forEach((event) => {
        event.deleteEvent();
        deletedCount++;
      });
    }
    AppLogger.info(
      "Deleted " + deletedCount + " events using Search Key: " + SEARCH_KEY,
    );
    return { deletedCount: deletedCount };
  },

  getCalendarInternal: function (name) {
    if (!name || name.toLowerCase() === "primary")
      return CalendarApp.getDefaultCalendar();
    const calendars = CalendarApp.getAllCalendars();
    for (var i = 0; i < calendars.length; i++) {
      if (calendars[i].getName() === name) return calendars[i];
    }
    try {
      const cal = CalendarApp.getCalendarById(name);
      if (cal) return cal;
    } catch (e) {}
    return CalendarApp.getDefaultCalendar();
  },
};

/**
 * 📡 Entry Points
 */

function doGet(e) {
  return jsonResponse_({
    status: CONSTANTS.SUCCESS,
    version: "13.3",
    message: "FPT Scheduler GAS Engine V13.3 (204 Fix) is ACTIVE",
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || "sync";

    // Auth Check
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      const authResult = verifyFirebaseToken_(payload.idToken);
      if (!authResult.valid || !isAuthorized_(authResult.email)) {
        throw new Error("Unauthorized Access (V13.3)");
      }
    }

    if (action === "readSheet") {
      const sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("Invalid Spreadsheet URL");

      const gidMatch = payload.url.match(/[#&]gid=([0-9]+)/);
      const urlGid = gidMatch ? gidMatch[1] : null;

      try {
        const ss = SpreadsheetApp.openById(sheetId);
        let sheet = ss.getSheets()[0];
        if (payload.tabName)
          sheet = ss.getSheetByName(payload.tabName.trim()) || sheet;
        else if (urlGid)
          sheet =
            ss.getSheets().find((s) => s.getSheetId().toString() === urlGid) ||
            sheet;

        const data = sheet.getDataRange().getValues();
        return jsonResponse_({
          status: CONSTANTS.SUCCESS,
          data: data.slice(parseInt(payload.startRow || "1") - 1),
          rowCount: data.length,
          fetchTime: new Date().toISOString(),
          tabName: sheet.getName(),
          allTabs: ss.getSheets().map((s) => s.getName()), // Trả về danh sách tất cả các tab để UI dropdown
        });
      } catch (e) {
        throw e;
      }
    }

    if (action === "getTabNames") {
      const sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("Invalid Spreadsheet URL");

      try {
        const ss = SpreadsheetApp.openById(sheetId);
        const tabs = ss.getSheets().map((s) => s.getName());
        return jsonResponse_({
          status: CONSTANTS.SUCCESS,
          tabs: tabs,
        });
      } catch (e) {
        throw e;
      }
    }

    if (action === "clearCalendar") {
      const res = CalendarService.clearEvents(
        payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME,
        payload.googleAccessToken || null,
      );
      return jsonResponse_({
        status: CONSTANTS.SUCCESS,
        version: "13.3",
        message: "Cleared",
        data: res,
      });
    }

    const res = CalendarService.createEvents(
      payload.calendarName,
      payload.events || [],
      payload.force || false,
      payload.googleAccessToken || null,
      payload.conflictMode || null,
    );

    return jsonResponse_({
      status: CONSTANTS.SUCCESS,
      version: "13.3",
      data: res,
    });
  } catch (err) {
    AppLogger.error("POST Error", err);
    return jsonResponse_({
      status: CONSTANTS.ERROR,
      version: "13.3",
      message: err.toString(),
    });
  }
}

function verifyFirebaseToken_(idToken) {
  if (!idToken) return { valid: false };
  const res = UrlFetchApp.fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CONSTANTS.FIREBASE_WEB_API_KEY}`,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ idToken }),
      muteHttpExceptions: true,
    },
  );
  const data = JSON.parse(res.getContentText());
  return data.users && data.users.length > 0
    ? { valid: true, email: data.users[0].email }
    : { valid: false };
}

function isAuthorized_(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const url = `${CONSTANTS.FIREBASE_URL}admin_whitelist.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    if (data) {
      const list = Object.values(data).map((v) =>
        String(v).trim().toLowerCase(),
      );
      if (list.includes(cleanEmail)) return true;
    }
  } catch (e) {}
  if (CONSTANTS.ADMIN_EMAILS.some((e) => e.toLowerCase() === cleanEmail))
    return true;
  return true;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
