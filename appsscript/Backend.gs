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
    sheetType = "unknown",
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

        // 📅 1. Bán kính quét (180 ngày)
        var nowNum = new Date().getTime();
        var queryMin = new Date(
          nowNum - 180 * 24 * 60 * 60 * 1000,
        ).toISOString();
        var queryMax = new Date(
          nowNum + 180 * 24 * 60 * 60 * 1000,
        ).toISOString();

        // 🔍 2. Lấy tất cả lịch hiện có của App này
        var allAppEvents = [];
        var pageToken = null;
        do {
          var listPath =
            "/calendars/" +
            encodeURIComponent(calendarId) +
            "/events?timeMin=" +
            encodeURIComponent(queryMin) +
            "&timeMax=" +
            encodeURIComponent(queryMax) +
            "&showDeleted=false&singleEvents=true&maxResults=2500";
          if (pageToken) listPath += "&pageToken=" + pageToken;
          var listRes = GoogleCalendarAPI.fetch_(googleAccessToken, listPath);
          if (listRes.items) {
            allAppEvents = allAppEvents.concat(
              listRes.items.filter((it) => {
                const p =
                  (it.extendedProperties && it.extendedProperties.private) ||
                  {};
                return p[CONSTANTS.SOURCE_TAG] === "fpt_scheduler";
              }),
            );
          }
          pageToken = listRes.nextPageToken;
        } while (pageToken);

        // 👤 3. Phân lập dữ liệu theo Sheet Type (Full Sync logic)
        // existingEvents: Những gì đã có trên calendar của loại sheet này -> Cần đối soát để xóa nế không còn trong list mới
        const existingEvents = allAppEvents.filter((it) => {
          const p =
            (it.extendedProperties && it.extendedProperties.private) || {};
          // Chấp nhận cả trường hợp không có sheet_type (Legacy) để dọn dẹp/gắn nhãn lại
          return p["sheet_type"] === sheetType || !p["sheet_type"];
        });

        // otherEvents: Những gì thuộc về sheet khác -> Để check xung đột chéo
        const otherEvents = allAppEvents.filter((it) => {
          const p =
            (it.extendedProperties && it.extendedProperties.private) || {};
          return p["sheet_type"] && p["sheet_type"] !== sheetType;
        });

        const toAdd = [];
        const toDeleteIds = [];
        const exactMatches = [];

        // 🧩 4. So khớp Exact Match & Mark Delete (Xử lý dọn dẹp TOÀN BỘ sheet type này)
        existingEvents.forEach((old) => {
          const oldStart = new Date(
            old.start.dateTime || old.start.date,
          ).toISOString();
          const oldEnd = new Date(
            old.end.dateTime || old.end.date,
          ).toISOString();

          const foundExact = events.find((nev) => {
            return (
              old.summary === nev.title &&
              oldStart === new Date(nev.start).toISOString() &&
              oldEnd === new Date(nev.end).toISOString()
            );
          });

          if (foundExact) exactMatches.push(old.id);
          else toDeleteIds.push(old.id); // KHÔNG còn trong view hiện tại -> XÓA
        });

        // 🧩 5. Check Overlap & Mark Add
        events.forEach((nev) => {
          const nevStart = new Date(nev.start).getTime();
          const nevEnd = new Date(nev.end).getTime();

          // Nếu đã có y hệt trên lịch thì SKIP (Không thêm mới, không xóa cũ)
          const isExist = exactMatches.some((id) => {
            const old = existingEvents.find((o) => o.id === id);
            return (
              old &&
              old.summary === nev.title &&
              new Date(old.start.dateTime || old.start.date).getTime() ===
                nevStart
            );
          });

          if (isExist) return;

          // Check overlap với "Sheet khác" (Chỉ báo lỗi nếu trùng với loại lịch khác)
          const overlap = otherEvents.find((other) => {
            const oStart = new Date(
              other.start.dateTime || other.start.date,
            ).getTime();
            const oEnd = new Date(
              other.end.dateTime || other.end.date,
            ).getTime();
            return (
              nevStart < oEnd &&
              nevEnd > oStart &&
              other.location === nev.location
            );
          });

          if (overlap && !force) {
            results.conflicts.push({
              index: events.indexOf(nev),
              title: nev.title,
              time: nev.start,
              with: overlap.summary,
            });
          } else {
            toAdd.push(nev);
          }
        });

        // 🚀 6. Execute (Delete old, Create new)
        toDeleteIds.forEach((id) => {
          try {
            GoogleCalendarAPI.deleteEvent(googleAccessToken, calendarId, id);
          } catch (e) {}
        });

        toAdd.forEach((ev) => {
          try {
            const eventData = {
              summary: ev.title,
              location: ev.location || "",
              description: ev.description || "",
              start: { dateTime: new Date(ev.start).toISOString() },
              end: { dateTime: new Date(ev.end).toISOString() },
              extendedProperties: {
                private: {
                  [CONSTANTS.SOURCE_TAG]: "fpt_scheduler",
                  sheet_type: sheetType,
                  [CONSTANTS.SIGNATURE_TAG]: ev.signature || "",
                },
              },
            };
            if (ev.colorId) eventData.colorId = String(ev.colorId);

            GoogleCalendarAPI.createEvent(
              googleAccessToken,
              calendarId,
              eventData,
            );
            results.success++;
          } catch (e) {
            results.failed++;
            results.errors.push({ title: ev.title, message: e.toString() });
          }
        });

        results.skipped = exactMatches.length;
        results.updated = toDeleteIds.length;
        // Count modified/swapped as updated for UI feedback
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

  clearEvents: function (
    calendarName,
    googleAccessToken = null,
    sheetType = null,
  ) {
    let deletedCount = 0;
    const now = new Date();
    const startTimeNum = now.getTime() - 180 * 24 * 60 * 60 * 1000;
    const endTimeNum = now.getTime() + 180 * 24 * 60 * 60 * 1000;
    const startTimeStr = new Date(startTimeNum).toISOString();
    const endTimeStr = new Date(endTimeNum).toISOString();

    const SEARCH_KEY = "Đồng bộ từ FPT Scheduler";

    if (googleAccessToken) {
      const calendarId = GoogleCalendarAPI.findCalendarIdByName(
        googleAccessToken,
        calendarName,
      );
      let pageToken = null;
      do {
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
          "&showDeleted=false&singleEvents=true&maxResults=2500";
        if (pageToken) path += "&pageToken=" + pageToken;

        const listResponse = GoogleCalendarAPI.fetch_(googleAccessToken, path);
        if (listResponse.items) {
          listResponse.items.forEach((item) => {
            const privateProps =
              (item.extendedProperties && item.extendedProperties.private) ||
              {};
            const isFromApp =
              privateProps[CONSTANTS.SOURCE_TAG] === "fpt_scheduler";

            // 🛡️ Isolation check: If sheetType provided, must match. Else, must be from app.
            let shouldDelete = isFromApp;
            if (sheetType && privateProps["sheet_type"] !== sheetType) {
              shouldDelete = false;
            }

            if (shouldDelete) {
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
      const calendar = this.getCalendarInternal(calendarName);
      const events = calendar.getEvents(
        new Date(startTimeNum),
        new Date(endTimeNum),
        { search: SEARCH_KEY },
      );
      events.forEach((event) => {
        const typeTag = event.getTag("sheet_type");
        if (!sheetType || typeTag === sheetType) {
          event.deleteEvent();
          deletedCount++;
        }
      });
    }
    AppLogger.info(
      "Deleted " +
        deletedCount +
        " events. SheetType Filter: " +
        (sheetType || "None"),
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
        payload.sheetType || null,
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
      payload.sheetType || "unknown",
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
