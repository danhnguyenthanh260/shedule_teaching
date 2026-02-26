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

        const toAdd = [];
        const toDeleteIds = [];
        const exactMatches = [];

        // 🧩 4. Chiến lược "Đồng bộ Vi sai" (Differential Sync)
        // Duyệt qua danh sách MỚI (events) để quyết định Add, Update hay Skip
        events.forEach((nev) => {
          const nevStart = new Date(nev.start).getTime();
          const nevEnd = new Date(nev.end).getTime();
          const nevSignature = nev.signature || "";

          // Tìm sự kiện cũ CÙNG LOẠI (sheetType) và CÙNG ID (signature)
          const oldEvent = allAppEvents.find((o) => {
            const p =
              (o.extendedProperties && o.extendedProperties.private) || {};
            // 1. Ưu tiên trùng Signature (Row ID - Rất chính xác)
            if (nevSignature && p[CONSTANTS.SIGNATURE_TAG] === nevSignature)
              return true;

            // 🛡️ BƯỚC 4: NHẬN DIỆN DANH TÍNH (Identity Check)
            const oStartNum = new Date(
              o.start.dateTime || o.start.date,
            ).getTime();
            const oEndNum = new Date(o.end.dateTime || o.end.date).getTime();

            // Chuẩn hóa cực mạnh
            const norm = (s) => (s || "").toLowerCase().normalize("NFC").trim();
            const oldTitle = norm(o.summary);
            const newTitle = norm(nev.title);
            const personPart = norm(nev.title.split("-")[0]);

            const isTimeMatch =
              Math.abs(oStartNum - nevStart) < 300000 &&
              Math.abs(oEndNum - nevEnd) < 300000;

            if (isTimeMatch) {
              if (nevSignature && p[CONSTANTS.SIGNATURE_TAG] === nevSignature)
                return true;
              if (oldTitle === newTitle) return true;
              if (
                sheetType === "council" &&
                (oldTitle.includes(personPart) || newTitle.includes(oldTitle))
              )
                return true;
            }
            return false;
          });

          if (oldEvent) {
            const oStartNum = new Date(
              oldEvent.start.dateTime || oldEvent.start.date,
            ).getTime();
            const norm = (s) => (s || "").toLowerCase().normalize("NFC").trim();

            // Kiểm tra thay đổi thực sự
            const isChanged =
              norm(oldEvent.summary) !== norm(nev.title) ||
              norm(oldEvent.location) !== norm(nev.location) ||
              Math.abs(oStartNum - nevStart) > 120000;

            if (!isChanged) {
              exactMatches.push(oldEvent.id);
              results.skipped++;
              return; // SKIP
            } else {
              toDeleteIds.push(oldEvent.id);
            }
          }

          // 🛡️ BƯỚC 5: KIỂM TRA XUNG ĐỘT (Overlap Check)
          const overlap = allAppEvents.find((other) => {
            const p =
              (other.extendedProperties && other.extendedProperties.private) ||
              {};

            // 🛑 1. Không bao giờ xung đột với chính mình
            if (
              exactMatches.includes(other.id) ||
              toDeleteIds.includes(other.id)
            )
              return false;

            // 🛑 2. Nhận diện loại Board (Ưu tiên Council cho các lịch cũ ko nhãn)
            let otherType = p["sheet_type"];
            if (!otherType && p[CONSTANTS.SOURCE_TAG] === "fpt_scheduler") {
              otherType = "council"; // Legacy mặc định là Council
            }

            // 🛑 3. Tab Hội đồng / Review KHÔNG BAO GIỜ xung đột với cùng loại mình
            if (otherType === sheetType) return false;

            const oStartNum = new Date(
              other.start.dateTime || other.start.date,
            ).getTime();
            const oEndNum = new Date(
              other.end.dateTime || other.end.date,
            ).getTime();

            // 🛑 4. Xung đột nếu: Trùng giờ VÀ Trùng địa điểm VÀ KHÁC loại bảng
            const isOverlap = nevStart < oEndNum && nevEnd > oStartNum;
            return isOverlap && other.location === nev.location;
          });

          if (overlap && !force) {
            results.conflicts.push({
              index: events.indexOf(nev),
              newEvent: String(nev.title || "Events mới"),
              newStart: String(nev.start || ""),
              newEnd: String(nev.end || ""),
              oldEvent: String(
                overlap.summary || overlap.description || "Lịch hiện có",
              ),
              oldStart: String(
                (overlap.start &&
                  (overlap.start.dateTime || overlap.start.date)) ||
                  "",
              ),
              oldEnd: String(
                (overlap.end && (overlap.end.dateTime || overlap.end.date)) ||
                  "",
              ),
            });
          } else {
            toAdd.push(nev);
          }
        });

        // 🛡️ BƯỚC 6: DỌN DẸP "LỊCH THỪA" (Mirror Cleanup)
        // Nếu trên Calendar có lịch thuộc bảng này nhưng trong Sheet không thấy đâu -> XÓA.
        // Điều này đảm bảo Calendar luôn là bản sao khớp 100% với Sheet.
        allAppEvents.forEach((other) => {
          const p =
            (other.extendedProperties && other.extendedProperties.private) ||
            {};
          const otherType =
            p["sheet_type"] ||
            (p[CONSTANTS.SOURCE_TAG] === "fpt_scheduler"
              ? "council"
              : "unknown");

          // Chỉ dọn dẹp nếu:
          // 1. Cùng loại Board (Council dọn Council, Review dọn Review)
          // 2. Không nằm trong danh sách được Giữ lại (exactMatches)
          // 3. Không nằm trong danh sách được Update (toDeleteIds đã có sẵn)
          if (
            otherType === sheetType &&
            !exactMatches.includes(other.id) &&
            !toDeleteIds.includes(other.id)
          ) {
            toDeleteIds.push(other.id);
          }
        });

        // 🚀 THỰC THI (Execution)
        // -------------------------------------------------------------
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
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ (Không tìm thấy ID)");

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
      } catch (err) {
        return jsonResponse_({
          status: CONSTANTS.ERROR,
          message: "Lỗi truy cập Google Sheet: " + err.toString(),
          sheetId: sheetId,
        });
      }
    }

    if (action === "getTabNames") {
      const sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ (Không tìm thấy ID)");

      try {
        const ss = SpreadsheetApp.openById(sheetId);
        const tabs = ss.getSheets().map((s) => s.getName());
        return jsonResponse_({
          status: CONSTANTS.SUCCESS,
          tabs: tabs,
        });
      } catch (err) {
        return jsonResponse_({
          status: CONSTANTS.ERROR,
          message: "Không thể lấy danh sách Tab: " + err.toString(),
        });
      }
    }

    if (action === "setupNotifications") {
      const sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ (Không tìm thấy ID)");

      const res = setupNotificationTrigger(sheetId, payload.tabName);
      return jsonResponse_(res);
    }

    if (action === "disableNotifications") {
      const sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ (Không tìm thấy ID)");

      const res = disableNotificationTrigger(sheetId, payload.tabName);
      return jsonResponse_(res);
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

/**
 * 📧 NOTIFICATION SYSTEM (Council Sheets)
 * Logic for monitoring changes and sending emails after 5 minutes.
 */

const NOTIF_CONSTANTS = {
  CACHE_PREFIX: "__notif_cache_",
  DEBOUNCE_SECONDS: 20,
  EMAIL_COLUMN_INDEX: 13, // Column N (0-indexed)
};

/**
 * 🛠️ Setup: Bật tính năng thông báo cho một Spreadsheet + Tab cụ thể
 */
function setupNotificationTrigger(spreadsheetId, tabName) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sourceSheet = tabName
      ? ss.getSheetByName(tabName)
      : ss.getSheets()[0];

    if (!sourceSheet) {
      throw new Error(`Không tìm thấy tab: ${tabName || "Mặc định (Sheet1)"}`);
    }

    const actualTabName = sourceSheet.getName();
    const cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + actualTabName;

    // 1. Kiểm tra/Tạo sheet cache ẩn cho tab này
    let cacheSheet = ss.getSheetByName(cacheSheetName);
    if (!cacheSheet) {
      cacheSheet = ss.insertSheet(cacheSheetName);
      cacheSheet.hideSheet();
    }

    // Lưu dữ liệu hiện tại làm bản "stable" đầu tiên
    const currentData = sourceSheet.getDataRange().getValues();
    cacheSheet.clear();
    cacheSheet
      .getRange(1, 1, currentData.length, currentData[0].length)
      .setValues(currentData);

    // 2. Tạo trigger onChange nếu chưa có (Spreadsheet-wide)
    const triggers = ScriptApp.getProjectTriggers();
    const existing = triggers.find(
      (t) =>
        t.getHandlerFunction() === "handleSheetChange" &&
        t.getTriggerSourceId() === spreadsheetId,
    );

    if (!existing) {
      ScriptApp.newTrigger("handleSheetChange")
        .forSpreadsheet(ss)
        .onChange()
        .create();
    }

    return {
      status: "success",
      message: `Đã bật theo dõi cho tab "${actualTabName}" của sheet: ${ss.getName()}`,
    };
  } catch (e) {
    AppLogger.error("Setup trigger error", e);
    throw e;
  }
}

/**
 * 🛠️ Setup: Tắt tính năng thông báo cho một Spreadsheet + Tab cụ thể
 */
function disableNotificationTrigger(spreadsheetId, tabName) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const targetSheet = tabName
      ? ss.getSheetByName(tabName)
      : ss.getSheets()[0];
    if (!targetSheet) return { status: "error", message: "Không tìm thấy tab" };

    const cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + targetSheet.getName();
    const cacheSheet = ss.getSheetByName(cacheSheetName);

    if (cacheSheet) {
      ss.deleteSheet(cacheSheet);
    }

    return {
      status: "success",
      message: `Đã tắt theo dõi cho tab "${targetSheet.getName()}"`,
    };
  } catch (e) {
    AppLogger.error("Disable trigger error", e);
    throw e;
  }
}

/**
 * ⚡ Triggered on Change
 */
function handleSheetChange(e) {
  const ss = e.source;
  const ssId = ss.getId();
  const props = PropertiesService.getScriptProperties();
  const now = new Date().getTime();

  // 1. Throttling - Giới hạn tần suất tạo trigger
  const lastTriggerTime = parseInt(
    props.getProperty("last_trigger_time_" + ssId) || "0",
  );
  if (now - lastTriggerTime < 5000) return;
  props.setProperty("last_trigger_time_" + ssId, now.toString());

  try {
    // 2. Tạo trigger mới
    const trigger = ScriptApp.newTrigger("processNotifications")
      .timeBased()
      .after(NOTIF_CONSTANTS.DEBOUNCE_SECONDS * 1000)
      .create();

    const newTriggerId = trigger.getUniqueId();
    props.setProperty("active_trigger_" + ssId, newTriggerId);
    props.setProperty("trigger_ss_id_" + newTriggerId, ssId);
  } catch (err) {
    // 3. Fallback: Nếu hết quota, thử dọn dẹp các trigger cũ và tạo lại
    AppLogger.warn("Trigger quota reached, attempting cleanup", err);
    try {
      const triggers = ScriptApp.getProjectTriggers();
      let count = 0;
      for (let t of triggers) {
        if (t.getHandlerFunction() === "processNotifications") {
          ScriptApp.deleteTrigger(t);
          count++;
        }
      }
      if (count > 0) {
        const trigger = ScriptApp.newTrigger("processNotifications")
          .timeBased()
          .after(NOTIF_CONSTANTS.DEBOUNCE_SECONDS * 1000)
          .create();
        props.setProperty("active_trigger_" + ssId, trigger.getUniqueId());
        props.setProperty("trigger_ss_id_" + trigger.getUniqueId(), ssId);
      }
    } catch (e2) {
      AppLogger.error("Fatal trigger creation error", e2);
    }
  }
}

/**
 * �️ Helpers for Dynamic Content (Council Sheets)
 */
function findNotifyColumns_(values) {
  const keywords = {
    date: ["ngày bảo vệ", "ngày khóa luận", "ngày", "date"],
    time: ["giờ", "thời gian", "khung giờ", "slot"],
    person: [
      "họ và tên",
      "thành viên",
      "giảng viên",
      "người thực hiện",
      "gvhd",
      "nhiệm vụ",
    ],
    email: ["@fpt.edu.vn", "@gmail.com", "email", "thư điện tử"],
  };

  const Mapping = {
    date: 5, // F
    time: 6, // G
    person: 10, // K
    emails: [11, 13], // L, N
    headerRowIndex: 0,
  };

  if (!values || values.length === 0) return Mapping;

  const scanLimit = Math.min(values.length, 15);
  let bestRow = -1;
  let maxMatches = -1;

  for (let r = 0; r < scanLimit; r++) {
    const row = values[r];
    let matches = 0;
    const currentMapping = { date: -1, time: -1, person: -1, emails: [] };

    row.forEach((cell, c) => {
      const val = String(cell || "")
        .toLowerCase()
        .trim();
      if (!val) return;

      if (
        currentMapping.date === -1 &&
        keywords.date.some((k) => val.includes(k))
      ) {
        currentMapping.date = c;
        matches++;
      }
      if (
        currentMapping.time === -1 &&
        keywords.time.some((k) => val.includes(k))
      ) {
        currentMapping.time = c;
        matches++;
      }
      if (
        currentMapping.person === -1 &&
        keywords.person.some((k) => val.includes(k))
      ) {
        currentMapping.person = c;
        matches++;
      }
      if (keywords.email.some((k) => val.includes(k))) {
        currentMapping.emails.push(c);
        matches++;
      }
    });

    if (matches > maxMatches && matches >= 2) {
      maxMatches = matches;
      bestRow = r;
      if (currentMapping.date !== -1) Mapping.date = currentMapping.date;
      if (currentMapping.time !== -1) Mapping.time = currentMapping.time;
      if (currentMapping.person !== -1) Mapping.person = currentMapping.person;
      if (currentMapping.emails.length > 0) {
        Mapping.emails = [...new Set(currentMapping.emails)];
      }
      Mapping.headerRowIndex = r;
    }
  }
  return Mapping;
}

function formatNotifDate_(date) {
  if (!date) return "N/A";
  if (date instanceof Date) {
    return Utilities.formatDate(date, "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
  }
  const dStr = String(date);
  if (dStr.includes("-") || dStr.includes("/")) {
    try {
      const d = new Date(dStr);
      if (!isNaN(d))
        return Utilities.formatDate(d, "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
    } catch (e) {}
  }
  return dStr;
}

/**
 * 🛠️ Helper: So sánh an toàn giữa 2 giá trị từ Sheet
 * Coi null, undefined và chuỗi rỗng là giống nhau
 */
function isSameValue_(v1, v2) {
  if (v1 === v2) return true;

  // Xử lý Ngày tháng (Date objects)
  if (v1 instanceof Date || v2 instanceof Date) {
    const d1 =
      v1 instanceof Date ? v1.getTime() : new Date(String(v1)).getTime();
    const d2 =
      v2 instanceof Date ? v2.getTime() : new Date(String(v2)).getTime();
    if (!isNaN(d1) && !isNaN(d2)) return d1 === d2;
  }

  // So sánh chuỗi chuẩn hóa
  const s1 = String(v1 || "")
    .trim()
    .toLowerCase();
  const s2 = String(v2 || "")
    .trim()
    .toLowerCase();
  return s1 === s2;
}

/**
 * �🚀 Main Notification Engine
 */
function processNotifications(e) {
  const triggerId = e.triggerUid;
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty("trigger_ss_id_" + triggerId);

  if (!ssId) return;

  // 🚀 TỐI ƯU 1: Kiểm tra xem đây có phải là trigger cuối cùng không (Self-Cleanup Debounce)
  const activeTriggerId = props.getProperty("active_trigger_" + ssId);
  if (activeTriggerId && activeTriggerId !== triggerId) {
    // Nếu có trigger mới hơn, trigger hiện tại tự xóa mình và thoát
    deleteTriggerById_(triggerId);
    props.deleteProperty("trigger_ss_id_" + triggerId);
    return;
  }

  // Đây là trigger cuối cùng -> Tiến hành xử lý
  props.deleteProperty("active_trigger_" + ssId);
  props.deleteProperty("trigger_ss_id_" + triggerId);

  try {
    const ss = SpreadsheetApp.openById(ssId);
    const allSheets = ss.getSheets();

    const cacheSheets = allSheets.filter((s) =>
      s.getName().startsWith(NOTIF_CONSTANTS.CACHE_PREFIX),
    );
    if (cacheSheets.length === 0) {
      deleteTriggerById_(triggerId);
      return;
    }

    const lecturersChangesMap = {}; // email -> string[]

    cacheSheets.forEach((cacheSheet) => {
      const cacheName = cacheSheet.getName();
      const sourceName = cacheName.replace(NOTIF_CONSTANTS.CACHE_PREFIX, "");
      const sourceSheet = ss.getSheetByName(sourceName);

      if (!sourceSheet) return;

      const newData = sourceSheet.getDataRange().getValues();
      const oldData = cacheSheet.getDataRange().getValues();

      if (newData.length === 0) return;

      const colMap = findNotifyColumns_(newData);
      const startRow = colMap.headerRowIndex + 1;

      // Xử lý so sánh: Ngày, Giờ, Giảng viên, Email
      const targetIndices = [
        colMap.date,
        colMap.time,
        colMap.person,
        ...colMap.emails,
      ];

      const maxRows = Math.max(newData.length, oldData.length);
      for (let i = startRow; i < maxRows; i++) {
        const newRow = newData[i] || [];
        const oldRow = oldData[i] || [];

        // 🚀 TỐI ƯU 2: Chỉ so sánh các cột quan trọng
        const hasChange = targetIndices.some((idx) => {
          return !isSameValue_(newRow[idx], oldRow[idx]);
        });

        if (hasChange) {
          // Kiểm tra tất cả các cột email khả dụng
          let email = "";
          for (const emailIdx of colMap.emails) {
            const val = String(
              newRow[emailIdx] || oldRow[emailIdx] || "",
            ).trim();
            if (val.includes("@")) {
              email = val;
              break;
            }
          }

          const person = String(
            newRow[colMap.person] || oldRow[colMap.person] || "",
          ).trim();

          // 🛡️ XÁC THỰC DÒNG: Chỉ xử lý nếu có Email hoặc ít nhất là tên Giảng viên
          if (email.includes("@") || person.length > 2) {
            const lecturerEmail = email ? email.toLowerCase() : null;

            // Nếu không có email, log cảnh báo nhưng không thể gửi mail
            if (!lecturerEmail) {
              AppLogger.warn(
                `Dòng ${i + 1} thay đổi nhưng không tìm thấy Email cho: ${person}`,
              );
              continue;
            }

            const dateVal = formatNotifDate_(
              newRow[colMap.date] || oldRow[colMap.date],
            );
            const oldTime = String(oldRow[colMap.time] || "").trim();
            const newTime = String(newRow[colMap.time] || "").trim();

            if (!lecturersChangesMap[lecturerEmail])
              lecturersChangesMap[lecturerEmail] = [];

            if (!isSameValue_(oldTime, newTime) && oldTime && newTime) {
              lecturersChangesMap[lecturerEmail].push(
                `- Ngày ${dateVal}: Thay đổi giờ từ "${oldTime}" sang "${newTime}" (${person})`,
              );
            } else {
              lecturersChangesMap[lecturerEmail].push(
                `- Ngày ${dateVal}: Có cập nhật mới về lịch giảng dạy (${person})`,
              );
            }
          }
        }
      }

      // Cập nhật cache cho tab này
      cacheSheet.clear();
      if (newData.length > 0) {
        cacheSheet
          .getRange(1, 1, newData.length, newData[0].length)
          .setValues(newData);
      }
    });

    // Gửi mail cho từng giảng viên
    let totalSent = 0;
    Object.keys(lecturersChangesMap).forEach((email) => {
      try {
        const changesList = lecturersChangesMap[email];
        // Loại bỏ trùng lặp nếu có
        const uniqueChanges = [...new Set(changesList)];

        const emailBody = `Xin chào giảng viên,

Lịch giảng dạy/hội đồng của bạn trên Google Sheet đã có sự thay đổi. Chi tiết như sau:
${uniqueChanges.join("\n")}

Vui lòng truy cập trang web dưới đây để đồng bộ lại lịch vào Google Calendar cá nhân:
https://shedule-teaching.vercel.app/

Trân trọng,
Đội ngũ Admin.`;

        GmailApp.sendEmail(
          email,
          "[FPT Calendar] Thông báo thay đổi lịch giảng dạy",
          emailBody,
        );
        totalSent++;
      } catch (err) {
        AppLogger.error("Failed to send email to: " + email, err);
      }
    });

    AppLogger.info("Notifications processed", {
      ssId: ssId,
      recipients: Object.keys(lecturersChangesMap).length,
      totalSent: totalSent,
    });

    // Cuối cùng xóa trigger hiện tại
    deleteTriggerById_(triggerId);
  } catch (err) {
    AppLogger.error("Process notifications error", err);
    deleteTriggerById_(triggerId);
  }
}

/**
 * 🗑️ Helper: Xóa trigger theo ID mà không cần quét toàn bộ danh sách
 */
function deleteTriggerById_(id) {
  if (!id) return;
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getUniqueId() === id) {
      ScriptApp.deleteTrigger(triggers[i]);
      break;
    }
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
