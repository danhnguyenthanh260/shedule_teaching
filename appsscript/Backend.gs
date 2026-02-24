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
