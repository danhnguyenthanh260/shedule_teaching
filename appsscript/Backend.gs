/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 13.6 - FULL SYSTEM WITH HYBRID RSVP
 * =====================================================
 */

var CONSTANTS = {
  GAS_SECRET: "FPTxavalo2026",
  DEFAULT_CALENDAR_NAME: "Schedule Teaching",
  SOURCE_TAG: "fpt_source",
  SIGNATURE_TAG: "fpt_signature",
  MAGIC_STRING: "Đồng bộ từ FPT Scheduler",
  SUCCESS: "success",
  ERROR: "error",
  FIREBASE_WEB_API_KEY: "AIzaSyDRwHY6mgdHKjkanLJk8BFpOQSeV5sqvaY",
  FIREBASE_URL:
    "https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/",
  ADMIN_EMAILS: ["ngohoangtruongdat@gmail.com", "ngohoangtruongdat2@gmail.com"],
};

var AppLogger = {
  log: function (level, message, detail) {
    var logMsg =
      "[" +
      level +
      "] " +
      new Date().toISOString() +
      " - " +
      message +
      (detail ? ": " + detail : "");
    Logger.log(logMsg);
    console.log(logMsg);
  },
  info: function (msg, detail) {
    this.log("INFO", msg, detail);
  },
  error: function (msg, detail) {
    this.log("ERROR", msg, detail);
  },
};

/**
 * 🌐 Google Calendar REST API Wrapper
 */
var GoogleCalendarAPI = {
  baseUrl: "https://www.googleapis.com/calendar/v3",

  fetch_: function (accessToken, path, options) {
    options = options || {};
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

    var response = UrlFetchApp.fetch(url, params);
    var code = response.getResponseCode();
    var text = response.getContentText();

    if (code >= 400) {
      AppLogger.error("API Error (" + code + "): " + path, text);
      var errObj = { code: code, body: text };
      throw new Error(JSON.stringify(errObj));
    }

    if (!text || text.trim() === "") {
      return { status: "success", message: "No Content (204)" };
    }

    return JSON.parse(text);
  },

  getCalendarMetadata: function (accessToken, calendarId) {
    calendarId = calendarId || "primary";
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
    var path =
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

  createEvent: function (accessToken, calendarId, eventData, sendUpdates) {
    var path = "/calendars/" + encodeURIComponent(calendarId) + "/events";
    // 📧 Luôn thêm sendUpdates=all nếu có yêu cầu gửi mail
    if (sendUpdates) {
      path += (path.indexOf("?") === -1 ? "?" : "&") + "sendUpdates=all";
    }
    return this.fetch_(accessToken, path, {
      method: "post",
      payload: eventData,
    });
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
      var list = this.fetch_(accessToken, "/users/me/calendarList");
      if (list.items) {
        var found = list.items.find(function (c) {
          return c.summary === name || c.id === name;
        });
        if (found) return found.id;
      }
    } catch (e) {
      AppLogger.error("Error finding calendar by name", e);
    }
    return "primary";
  },

  fetchAll_: function (accessToken, requests) {
    var self = this;
    var rawRequests = requests.map(function (req) {
      return {
        url: req.url || self.baseUrl + req.path,
        method: req.method || "get",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        payload: req.payload ? JSON.stringify(req.payload) : null,
        muteHttpExceptions: true,
      };
    });
    return UrlFetchApp.fetchAll(rawRequests);
  },
};

/**
 * 🛠️ Core Service
 */
var CalendarService = {
  createEvents: function (
    calendarName,
    events,
    force,
    googleAccessToken,
    conflictMode,
    sheetType,
    skipCleanup,
  ) {
    if (!Array.isArray(events) || events.length === 0)
      return { total: 0, success: 0 };

    force = force || false;
    googleAccessToken = googleAccessToken || null;
    sheetType = sheetType || "unknown";
    skipCleanup = skipCleanup || false;

    const useRestApi = !!googleAccessToken;
    var targetCalendarName = calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME;

    var results = {
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
        var calendarId = GoogleCalendarAPI.findCalendarIdByName(
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
              listRes.items.filter(function (it) {
                var p =
                  (it.extendedProperties && it.extendedProperties.private) ||
                  {};
                return p[CONSTANTS.SOURCE_TAG] === "fpt_scheduler";
              }),
            );
          }
          pageToken = listRes.nextPageToken;
        } while (pageToken);

        // 🚀 TỐI ƯU: Tạo Map để tìm kiếm (Dùng Object thay cho Map nếu là Rhino)
        var signatureMap = {};
        var norm = function (s) {
          return (s || "").toLowerCase().trim();
        };

        for (var i = 0; i < allAppEvents.length; i++) {
          var o = allAppEvents[i];
          var p = (o.extendedProperties && o.extendedProperties.private) || {};
          var sig = p[CONSTANTS.SIGNATURE_TAG];
          if (sig) signatureMap[sig] = o;
        }

        var toAdd = [];
        var toDeleteIds = [];
        var exactMatches = {};

        // 🧩 4. Chiến lược "Đồng bộ Vi sai" (Differential Sync)
        for (var i = 0; i < events.length; i++) {
          var nev = events[i];
          var nevStart = new Date(nev.start).getTime();
          var nevEnd = new Date(nev.end).getTime();
          var nevSignature = nev.signature || "";

          // Tìm theo Signature
          var oldEvent = signatureMap[nevSignature] || null;

          if (oldEvent) {
            var oStartNum = new Date(
              oldEvent.start.dateTime || oldEvent.start.date,
            ).getTime();
            var isChanged =
              norm(oldEvent.summary) !== norm(nev.title) ||
              norm(oldEvent.location) !== norm(nev.location) ||
              Math.abs(oStartNum - nevStart) > 120000;

            if (!isChanged) {
              exactMatches[oldEvent.id] = true;
              results.skipped++;
              continue;
            } else {
              toDeleteIds.push(oldEvent.id);
            }
          }

          // 🛡️ BƯỚC 5: KIỂM TRA XUNG ĐỘT (Overlap Check)
          var overlap = null;
          for (var j = 0; j < allAppEvents.length; j++) {
            var other = allAppEvents[j];
            if (exactMatches[other.id] || toDeleteIds.indexOf(other.id) !== -1)
              continue;

            var p =
              (other.extendedProperties && other.extendedProperties.private) ||
              {};
            var otherType = p["sheet_type"] || "council";
            if (otherType === sheetType) continue;

            var oStart = new Date(
              other.start.dateTime || other.start.date,
            ).getTime();
            var oEnd = new Date(other.end.dateTime || other.end.date).getTime();
            if (
              nevStart < oEnd &&
              nevEnd > oStart &&
              other.location === nev.location
            ) {
              overlap = other;
              break;
            }
          }

          if (overlap && !force) {
            results.conflicts.push({
              index: i,
              newEvent: String(nev.title || "Events mới"),
              newStart: String(nev.start || ""),
              newEnd: String(nev.end || ""),
              oldEvent: String(overlap.summary || "Lịch hiện có"),
              oldStart: String(overlap.start.dateTime || overlap.start.date),
              oldEnd: String(overlap.end.dateTime || overlap.end.date),
            });
          } else {
            toAdd.push(nev);
          }
        }

        // 🛡️ BƯỚC 6: DỌN DẸP "LỊCH THỪA" (Mirror Cleanup)
        if (!skipCleanup) {
          for (var i = 0; i < allAppEvents.length; i++) {
            var other = allAppEvents[i];
            var p =
              (other.extendedProperties && other.extendedProperties.private) ||
              {};
            var otherType = p["sheet_type"] || "council";
            if (
              otherType === sheetType &&
              !exactMatches[other.id] &&
              toDeleteIds.indexOf(other.id) === -1
            ) {
              toDeleteIds.push(other.id);
            }
          }
        }

        // 🚀 THỰC THI (Execution) - Xóa trước
        for (var i = 0; i < toDeleteIds.length; i++) {
          try {
            GoogleCalendarAPI.deleteEvent(
              googleAccessToken,
              calendarId,
              toDeleteIds[i],
            );
          } catch (e) {
            /* ignore */
          }
        }

        // Tạo mới
        for (var i = 0; i < toAdd.length; i++) {
          var ev = toAdd[i];
          try {
            var payload = {
              summary: ev.title,
              sequence: 0,
              location: ev.location || "",
              description:
                CONSTANTS.MAGIC_STRING + "\n\n" + (ev.description || ""),
              start: {
                dateTime: Utilities.formatDate(
                  new Date(ev.start),
                  "GMT+7",
                  "yyyy-MM-dd'T'HH:mm:ss+07:00",
                ),
              },
              end: {
                dateTime: Utilities.formatDate(
                  new Date(ev.end),
                  "GMT+7",
                  "yyyy-MM-dd'T'HH:mm:ss+07:00",
                ),
              },
              extendedProperties: {
                private: {
                  [CONSTANTS.SOURCE_TAG]: "fpt_scheduler",
                  sheet_type: sheetType,
                  [CONSTANTS.SIGNATURE_TAG]: ev.signature || "",
                },
              },
            };
            if (ev.colorId) payload.colorId = String(ev.colorId);

            // � LỒNG DATA VÀO DESCRIPTION (Dành cho Google Calendar Invitation)
            if (ev.guests) {
              const subItems = ev.subEvents || [
                {
                  start: ev.start,
                  end: ev.end,
                  location: ev.location,
                  description: ev.description,
                },
              ];
              const summaryBody = summarizeSchedule_(subItems);
              payload.description =
                "<b>CHI TIẾT LỊCH TRÌNH:</b><br>" +
                summaryBody +
                "<br>---<br>" +
                payload.description;
            }
            if (ev.guests) {
              var guestList = ev.guests.split(",");
              payload.attendees = guestList.map(function (email) {
                return {
                  email: email.trim(),
                  responseStatus: "needsAction",
                };
              });
            }

            // 🚀 HYBRID SERIES: Logic gom nhóm để có RSVP (Accept/Decline)
            if (ev.subEvents && ev.subEvents.length > 1) {
              // 🛡️ BẢO VỆ 400: Phân tích ngày thủ công (DD/MM/YYYY không được JS hỗ trợ tốt)
              // parseDateISO đã được khai báo ở trên nếu cần (nhưng ta sẽ dùng phiên bản dùng chung cho sạch sẽ)

              ev.subEvents.sort(function (a, b) {
                return (
                  parseDateISO_(a.start).getTime() -
                  parseDateISO_(b.start).getTime()
                );
              });

              var earliest = ev.subEvents[0];
              var earliestDate = parseDateISO_(earliest.start);
              var earliestEndDate = parseDateISO_(earliest.end);

              payload.start.dateTime = Utilities.formatDate(
                earliestDate,
                "GMT+7",
                "yyyy-MM-dd'T'HH:mm:ss+07:00",
              );
              payload.end.dateTime = Utilities.formatDate(
                earliestEndDate,
                "GMT+7",
                "yyyy-MM-dd'T'HH:mm:ss+07:00",
              );
              payload.start.timeZone = "Asia/Ho_Chi_Minh";
              payload.end.timeZone = "Asia/Ho_Chi_Minh";

              // 1. Tạo chuỗi lặp đại diện (Trigger 1 email với nút Yes/No)
              // 🔔 Dùng RDATE từng dòng và TZID để khớp tuyệt đối (Fix 400)
              // 🚀 FIX RSVP: Bỏ buổi đầu khỏi RDATE để tránh trùng lặp ngày đầu gây mập mờ
              var recurrence = ["RRULE:FREQ=DAILY;COUNT=1"];
              ev.subEvents.forEach(function (s, idx) {
                if (idx === 0) return; // Buổi sớm nhất đã là DTSTART của Master rồi
                var d = parseDateISO_(s.start);
                recurrence.push(
                  "RDATE;TZID=Asia/Ho_Chi_Minh:" +
                    Utilities.formatDate(d, "GMT+7", "yyyyMMdd'T'HHmmss"),
                );
              });
              payload.recurrence = recurrence;

              var res;
              try {
                AppLogger.info(
                  "Creating Hybrid Series Master (Final Alignment)",
                  {
                    summary: payload.summary,
                    count: ev.subEvents.length,
                    recurrence: payload.recurrence,
                    dtstart: payload.start.dateTime,
                  },
                );
                res = GoogleCalendarAPI.createEvent(
                  googleAccessToken,
                  calendarId,
                  payload,
                  true, // Force send email invitation
                );
              } catch (e) {
                AppLogger.error(
                  "CRITICAL: Failed to create Hybrid Master (RDATE Mode)",
                  {
                    message: e.toString(),
                    payload: JSON.stringify(payload),
                  },
                );
                throw e;
              }

              // Clear recurrence from payload for potential reuse (just in case)
              delete payload.recurrence;

              if (res && res.id) {
                // 2. Lấy danh sách Instance của chuỗi vừa tạo để điều chỉnh đúng slot giờ
                var instances = GoogleCalendarAPI.fetch_(
                  googleAccessToken,
                  "/calendars/" +
                    encodeURIComponent(calendarId) +
                    "/events/" +
                    encodeURIComponent(res.id) +
                    "/instances?maxResults=50",
                );

                if (instances && instances.items) {
                  // Sắp xếp instances theo thời gian để khớp thứ tự với subEvents
                  instances.items.sort(function (a, b) {
                    var ta = new Date(
                      a.start.dateTime || a.start.date,
                    ).getTime();
                    var tb = new Date(
                      b.start.dateTime || b.start.date,
                    ).getTime();
                    return ta - tb;
                  });

                  var updateRequests = [];
                  for (
                    var k = 0;
                    k < instances.items.length && k < ev.subEvents.length;
                    k++
                  ) {
                    var inst = instances.items[k];
                    var sub = ev.subEvents[k];
                    updateRequests.push({
                      method: "patch",
                      path:
                        "/calendars/" +
                        encodeURIComponent(calendarId) +
                        "/events/" +
                        encodeURIComponent(inst.id) +
                        "?sendUpdates=none",
                      payload: {
                        start: {
                          dateTime: Utilities.formatDate(
                            parseDateISO_(sub.start),
                            "GMT+7",
                            "yyyy-MM-dd'T'HH:mm:ss+07:00",
                          ),
                        },
                        end: {
                          dateTime: Utilities.formatDate(
                            parseDateISO_(sub.end),
                            "GMT+7",
                            "yyyy-MM-dd'T'HH:mm:ss+07:00",
                          ),
                        },
                        location: sub.location || payload.location,
                        description:
                          CONSTANTS.MAGIC_STRING +
                          "\n\n" +
                          (sub.description || payload.description),
                        // 🛡️ BẢO VỆ THU HỒI (RECALL): Patch lại tag ẩn để clearEvents tìm thấy
                        extendedProperties: payload.extendedProperties,
                      },
                    });
                  }

                  // 3. Batch update các buổi lẻ mà không gửi thêm email báo (TỐI ƯU)
                  if (updateRequests.length > 0) {
                    GoogleCalendarAPI.fetchAll_(
                      googleAccessToken,
                      updateRequests,
                    );
                  }
                }
              }
            } else {
              // Xử lý sự kiện đơn lẻ thông thường
              res = GoogleCalendarAPI.createEvent(
                googleAccessToken,
                calendarId,
                payload,
                true, // Gửi email thông thường cho 1 sự kiện
              );
            }

            // 📧 KHÔNG CẦN EMAIL BỔ SUNG NẾU ĐÃ LỒNG VÀO DESCRIPTION
            // Việc lồng bảng vào mô tả giúp Google Invitation chứa đầy đủ thông tin + Nút Có/Không

            results.success++;
          } catch (e) {
            results.failed++;
            results.errors.push({
              title: ev.title,
              message: e.toString(),
            });
          }
        }

        results.updated = toDeleteIds.length;
      } else {
        // --- CENTRALIZED mode (Legacy) ---
        var calendar = this.getCalendarInternal(targetCalendarName);
        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          try {
            var options = {
              location: ev.location || "",
              description: ev.description || "",
            };
            if (ev.guests) {
              options.guests = ev.guests;
              options.sendInvites = true;
            }
            var created = calendar.createEvent(
              ev.title,
              new Date(ev.start),
              new Date(ev.end),
              options,
            );
            created.setTag(CONSTANTS.SOURCE_TAG, "fpt_scheduler");
            if (ev.signature)
              created.setTag(CONSTANTS.SIGNATURE_TAG, ev.signature);
            if (ev.colorId) created.setColor(ev.colorId);
            results.success++;
          } catch (e) {
            results.failed++;
          }
        }
      }
    } catch (e) {
      throw e;
    }
    return results;
  },

  clearEvents: function (
    calendarName,
    googleAccessToken,
    sheetType,
    sendUpdates,
  ) {
    googleAccessToken = googleAccessToken || null;
    sheetType = sheetType || null;
    sendUpdates = sendUpdates || false;

    let deletedCount = 0;
    const now = new Date();
    const startTimeNum = now.getTime() - 365 * 24 * 60 * 60 * 1000; // Mở rộng 1 năm
    const endTimeNum = now.getTime() + 365 * 24 * 60 * 60 * 1000;
    const startTimeStr = new Date(startTimeNum).toISOString();
    const endTimeStr = new Date(endTimeNum).toISOString();

    const SEARCH_KEY = CONSTANTS.MAGIC_STRING;

    if (googleAccessToken) {
      var calendarId = GoogleCalendarAPI.findCalendarIdByName(
        googleAccessToken,
        calendarName,
      );
      if (!calendarId) return { success: false, message: "Calendar not found" };

      let pageToken = null;
      const idsToDeleteMap = {}; // Gom nhóm ID duy nhất trên toàn bộ trang

      do {
        let path =
          "/calendars/" +
          encodeURIComponent(calendarId) +
          "/events" +
          "?timeMin=" +
          encodeURIComponent(startTimeStr) +
          "&timeMax=" +
          encodeURIComponent(endTimeStr) +
          "&showDeleted=false&singleEvents=false&maxResults=2500"; // singleEvents=false để liệt kê theo chuỗi
        if (pageToken) path += "&pageToken=" + pageToken;

        const listResponse = GoogleCalendarAPI.fetch_(googleAccessToken, path);
        if (listResponse.items) {
          AppLogger.info(
            "Scanning page: " + listResponse.items.length + " events",
          );

          listResponse.items.forEach(function (item) {
            const privateProps =
              (item.extendedProperties && item.extendedProperties.private) ||
              {};
            var isFromApp =
              privateProps[CONSTANTS.SOURCE_TAG] === "fpt_scheduler" ||
              (item.description &&
                item.description.indexOf(CONSTANTS.MAGIC_STRING) !== -1);

            if (
              sheetType &&
              privateProps["sheet_type"] &&
              privateProps["sheet_type"] !== sheetType
            ) {
              isFromApp = false;
            }

            if (isFromApp) {
              // Với singleEvents=false, item.id chính là Master ID nếu là chuỗi, hoặc ID đơn lẻ.
              idsToDeleteMap[item.id] = true;
            }
          });
        }
        pageToken = listResponse.nextPageToken;
      } while (pageToken);

      // 🚀 THỰC THI XÓA (Execution) - Sau khi đã gom đủ ID
      const allIds = Object.keys(idsToDeleteMap);
      AppLogger.info("Starting deletion of " + allIds.length + " items");

      const deleteRequests = [];
      allIds.forEach(function (id) {
        var deletePath =
          "/calendars/" +
          encodeURIComponent(calendarId) +
          "/events/" +
          encodeURIComponent(id);
        if (sendUpdates) deletePath += "?sendUpdates=all";
        deleteRequests.push({ method: "delete", path: deletePath });
      });

      // Batch delete (40 per chunk)
      const CHUNK_SIZE = 40;
      for (let i = 0; i < deleteRequests.length; i += CHUNK_SIZE) {
        const chunk = deleteRequests.slice(i, i + CHUNK_SIZE);
        GoogleCalendarAPI.fetchAll_(googleAccessToken, chunk);
        deletedCount += chunk.length;
      }
    } else {
      var calendar = this.getCalendarInternal(calendarName);
      var events = calendar.getEvents(
        new Date(startTimeNum),
        new Date(endTimeNum),
        { search: SEARCH_KEY },
      );
      events.forEach(function (event) {
        var typeTag = event.getTag("sheet_type");
        if (!sheetType || typeTag === sheetType) {
          event.deleteEvent();
          deletedCount++;
        }
      });
    }
    return { deletedCount: deletedCount };
  },

  getCalendarInternal: function (name) {
    if (!name || name.toLowerCase() === "primary")
      return CalendarApp.getDefaultCalendar();
    var calendars = CalendarApp.getAllCalendars();
    for (var i = 0; i < calendars.length; i++) {
      if (calendars[i].getName() === name) return calendars[i];
    }
    try {
      var cal = CalendarApp.getCalendarById(name);
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
    version: "13.6",
    message: "FPT Scheduler GAS Engine V13.6 (ES5 SAFE) is ACTIVE",
  });
}

function doPost(e) {
  var payload,
    action,
    res,
    sheetIdMatch,
    sheetId,
    ss,
    sheets,
    sheet,
    data,
    found,
    authResult;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Empty POST body received");
    }
    payload = JSON.parse(e.postData.contents);
    action = payload.action || "sync";

    // Auth Check
    if (payload.secret !== CONSTANTS.GAS_SECRET) {
      authResult = verifyFirebaseToken_(payload.idToken);
      if (!authResult.valid || !isAuthorized_(authResult.email)) {
        throw new Error("Unauthorized Access (V13.6)");
      }
    }

    if (action === "readSheet") {
      sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ (ID)");

      ss = SpreadsheetApp.openById(sheetId);
      sheets = ss.getSheets();
      sheet = sheets[0];

      if (payload.tabName) {
        found = ss.getSheetByName(payload.tabName.trim());
        if (found) sheet = found;
      }

      data = sheet.getDataRange().getValues();
      return jsonResponse_({
        status: CONSTANTS.SUCCESS,
        data: data.slice(parseInt(payload.startRow || "1") - 1),
        rowCount: data.length,
        fetchTime: new Date().toISOString(),
        tabName: sheet.getName(),
        allTabs: sheets.map(function (s) {
          return s.getName();
        }),
      });
    }

    if (action === "getTabNames") {
      sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ");

      ss = SpreadsheetApp.openById(sheetId);
      return jsonResponse_({
        status: CONSTANTS.SUCCESS,
        tabs: ss.getSheets().map(function (s) {
          return s.getName();
        }),
      });
    }

    if (action === "setupNotifications") {
      sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ");

      res = setupNotificationTrigger(sheetId, payload.tabName);
      return jsonResponse_(res);
    }

    if (action === "disableNotifications") {
      sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet không hợp lệ");

      res = disableNotificationTrigger(sheetId, payload.tabName);
      return jsonResponse_(res);
    }

    if (action === "clearCalendar") {
      res = CalendarService.clearEvents(
        payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME,
        payload.googleAccessToken || null,
        payload.sheetType || null,
        payload.sendUpdates || false,
      );
      return jsonResponse_({
        status: CONSTANTS.SUCCESS,
        version: "13.6",
        message: "Cleared",
        data: res,
      });
    }

    res = CalendarService.createEvents(
      payload.calendarName,
      payload.events || [],
      payload.force || false,
      payload.googleAccessToken || null,
      payload.conflictMode || null,
      payload.sheetType || "unknown",
      payload.skipCleanup || false,
    );

    return jsonResponse_({
      status: CONSTANTS.SUCCESS,
      version: "13.6",
      data: res,
    });
  } catch (err) {
    AppLogger.error("POST Error", err.toString());
    return jsonResponse_({
      status: CONSTANTS.ERROR,
      version: "13.6",
      message: err.toString(),
    });
  }
}

function verifyFirebaseToken_(idToken) {
  if (!idToken) return { valid: false };
  var res = UrlFetchApp.fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
      CONSTANTS.FIREBASE_WEB_API_KEY,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true,
    },
  );
  var data = JSON.parse(res.getContentText());
  return data.users && data.users.length > 0
    ? { valid: true, email: data.users[0].email }
    : { valid: false };
}

function isAuthorized_(email) {
  if (!email) return false;
  var cleanEmail = email.trim().toLowerCase();
  try {
    var url = CONSTANTS.FIREBASE_URL + "admin_whitelist.json";
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(res.getContentText());
    if (data) {
      for (var key in data) {
        if (String(data[key]).trim().toLowerCase() === cleanEmail) return true;
      }
    }
  } catch (e) {}
  for (var i = 0; i < CONSTANTS.ADMIN_EMAILS.length; i++) {
    if (CONSTANTS.ADMIN_EMAILS[i].toLowerCase() === cleanEmail) return true;
  }
  return false;
}

/**
 * 📧 NOTIFICATION SYSTEM (Council Sheets)
 */

var NOTIF_CONSTANTS = {
  CACHE_PREFIX: "__notif_cache_",
  DEBOUNCE_SECONDS: 20,
  EMAIL_COLUMN_INDEX: 13, // Column N (0-indexed)
};

function setupNotificationTrigger(spreadsheetId, tabName) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sourceSheet = tabName ? ss.getSheetByName(tabName) : ss.getSheets()[0];

    if (!sourceSheet) {
      throw new Error("Không tìm thấy tab: " + (tabName || "Mặc định"));
    }

    var actualTabName = sourceSheet.getName();
    var cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + actualTabName;

    var cacheSheet = ss.getSheetByName(cacheSheetName);
    if (!cacheSheet) {
      cacheSheet = ss.insertSheet(cacheSheetName);
      cacheSheet.hideSheet();
    }

    var currentData = sourceSheet.getDataRange().getValues();
    cacheSheet.clear();
    cacheSheet
      .getRange(1, 1, currentData.length, currentData[0].length)
      .setValues(currentData);

    var triggers = ScriptApp.getProjectTriggers();
    var existing = false;
    for (var i = 0; i < triggers.length; i++) {
      if (
        triggers[i].getHandlerFunction() === "handleSheetChange" &&
        triggers[i].getTriggerSourceId() === spreadsheetId
      ) {
        existing = true;
        break;
      }
    }

    if (!existing) {
      ScriptApp.newTrigger("handleSheetChange")
        .forSpreadsheet(ss)
        .onChange()
        .create();
    }

    return {
      status: "success",
      message: "Đã bật theo dõi cho tab " + actualTabName,
    };
  } catch (e) {
    AppLogger.error("Setup trigger error", e.toString());
    throw e;
  }
}

function disableNotificationTrigger(spreadsheetId, tabName) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var targetSheet = tabName ? ss.getSheetByName(tabName) : ss.getSheets()[0];
    if (!targetSheet) return { status: "error", message: "Không tìm thấy tab" };

    var cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + targetSheet.getName();
    var cacheSheet = ss.getSheetByName(cacheSheetName);

    if (cacheSheet) {
      ss.deleteSheet(cacheSheet);
    }

    return {
      status: "success",
      message: "Đã tắt theo dõi cho tab " + targetSheet.getName(),
    };
  } catch (e) {
    AppLogger.error("Disable trigger error", e.toString());
    throw e;
  }
}

function handleSheetChange(e) {
  var ss = e.source;
  var ssId = ss.getId();
  var props = PropertiesService.getScriptProperties();
  var now = new Date().getTime();

  var lastTriggerTime = parseInt(
    props.getProperty("last_trigger_time_" + ssId) || "0",
  );
  if (now - lastTriggerTime < 5000) return;
  props.setProperty("last_trigger_time_" + ssId, now.toString());

  try {
    var trigger = ScriptApp.newTrigger("processNotifications")
      .timeBased()
      .after(NOTIF_CONSTANTS.DEBOUNCE_SECONDS * 1000)
      .create();

    var newTriggerId = trigger.getUniqueId();
    props.setProperty("active_trigger_" + ssId, newTriggerId);
    props.setProperty("trigger_ss_id_" + newTriggerId, ssId);
  } catch (err) {
    AppLogger.error("Trigger creation error", err.toString());
  }
}

function findNotifyColumns_(values) {
  var keywords = {
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

  var Mapping = {
    date: 5,
    time: 6,
    person: 10,
    emails: [11, 13],
    headerRowIndex: 0,
  };
  if (!values || values.length === 0) return Mapping;

  var scanLimit = Math.min(values.length, 15);
  var bestRow = -1;
  var maxMatches = -1;

  for (var r = 0; r < scanLimit; r++) {
    var row = values[r];
    var matches = 0;
    var currentMapping = { date: -1, time: -1, person: -1, emails: [] };

    for (var c = 0; c < row.length; c++) {
      var val = String(row[c] || "")
        .toLowerCase()
        .trim();
      if (!val) continue;

      if (
        currentMapping.date === -1 &&
        keywords.date.some(function (k) {
          return val.indexOf(k) !== -1;
        })
      ) {
        currentMapping.date = c;
        matches++;
      }
      if (
        currentMapping.time === -1 &&
        keywords.time.some(function (k) {
          return val.indexOf(k) !== -1;
        })
      ) {
        currentMapping.time = c;
        matches++;
      }
      if (
        currentMapping.person === -1 &&
        keywords.person.some(function (k) {
          return val.indexOf(k) !== -1;
        })
      ) {
        currentMapping.person = c;
        matches++;
      }
      if (
        keywords.email.some(function (k) {
          return val.indexOf(k) !== -1;
        })
      ) {
        currentMapping.emails.push(c);
        matches++;
      }
    }

    if (matches > maxMatches && matches >= 2) {
      maxMatches = matches;
      bestRow = r;
      if (currentMapping.date !== -1) Mapping.date = currentMapping.date;
      if (currentMapping.time !== -1) Mapping.time = currentMapping.time;
      if (currentMapping.person !== -1) Mapping.person = currentMapping.person;
      if (currentMapping.emails.length > 0)
        Mapping.emails = currentMapping.emails;
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
  var dStr = String(date);
  if (dStr.indexOf("-") !== -1 || dStr.indexOf("/") !== -1) {
    try {
      var d = new Date(dStr);
      if (!isNaN(d.getTime()))
        return Utilities.formatDate(d, "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
    } catch (e) {}
  }
  return dStr;
}

function isSameValue_(v1, v2) {
  if (v1 === v2) return true;
  if (v1 instanceof Date || v2 instanceof Date) {
    var d1 = v1 instanceof Date ? v1.getTime() : new Date(String(v1)).getTime();
    var d2 = v2 instanceof Date ? v2.getTime() : new Date(String(v2)).getTime();
    if (!isNaN(d1) && !isNaN(d2)) return d1 === d2;
  }
  var s1 = String(v1 || "")
    .trim()
    .toLowerCase();
  var s2 = String(v2 || "")
    .trim()
    .toLowerCase();
  return s1 === s2;
}

function processNotifications(e) {
  var triggerId = e.triggerUid;
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty("trigger_ss_id_" + triggerId);

  if (!ssId) return;

  var activeTriggerId = props.getProperty("active_trigger_" + ssId);
  if (activeTriggerId && activeTriggerId !== triggerId) {
    deleteTriggerById_(triggerId);
    props.deleteProperty("trigger_ss_id_" + triggerId);
    return;
  }

  props.deleteProperty("active_trigger_" + ssId);
  props.deleteProperty("trigger_ss_id_" + triggerId);

  try {
    var ss = SpreadsheetApp.openById(ssId);
    var allSheets = ss.getSheets();
    var cacheSheets = [];
    for (var i = 0; i < allSheets.length; i++) {
      if (allSheets[i].getName().indexOf(NOTIF_CONSTANTS.CACHE_PREFIX) === 0) {
        cacheSheets.push(allSheets[i]);
      }
    }

    if (cacheSheets.length === 0) {
      deleteTriggerById_(triggerId);
      return;
    }

    var lecturersChangesMap = {};

    cacheSheets.forEach(function (cacheSheet) {
      var sourceName = cacheSheet
        .getName()
        .replace(NOTIF_CONSTANTS.CACHE_PREFIX, "");
      var sourceSheet = ss.getSheetByName(sourceName);
      if (!sourceSheet) return;

      var newData = sourceSheet.getDataRange().getValues();
      var oldData = cacheSheet.getDataRange().getValues();
      if (newData.length === 0) return;

      var colMap = findNotifyColumns_(newData);
      var startRow = colMap.headerRowIndex + 1;
      var targetIndices = [colMap.date, colMap.time, colMap.person].concat(
        colMap.emails,
      );

      var maxRows = Math.max(newData.length, oldData.length);
      for (var i = startRow; i < maxRows; i++) {
        var newRow = newData[i] || [];
        var oldRow = oldData[i] || [];

        var hasChange = false;
        for (var j = 0; j < targetIndices.length; j++) {
          if (
            !isSameValue_(newRow[targetIndices[j]], oldRow[targetIndices[j]])
          ) {
            hasChange = true;
            break;
          }
        }

        if (hasChange) {
          var email = "";
          for (var k = 0; k < colMap.emails.length; k++) {
            var val = String(
              newRow[colMap.emails[k]] || oldRow[colMap.emails[k]] || "",
            ).trim();
            if (val.indexOf("@") !== -1) {
              email = val;
              break;
            }
          }

          var person = String(
            newRow[colMap.person] || oldRow[colMap.person] || "",
          ).trim();
          if (email.indexOf("@") !== -1 || person.length > 2) {
            var lecturerEmail = email ? email.toLowerCase() : null;
            if (!lecturerEmail) continue;

            var dateVal = formatNotifDate_(
              newRow[colMap.date] || oldRow[colMap.date],
            );
            var oldTime = String(oldRow[colMap.time] || "").trim();
            var newTime = String(newRow[colMap.time] || "").trim();

            if (!lecturersChangesMap[lecturerEmail])
              lecturersChangesMap[lecturerEmail] = [];

            if (!isSameValue_(oldTime, newTime) && oldTime && newTime) {
              lecturersChangesMap[lecturerEmail].push(
                "- Ngày " +
                  dateVal +
                  ": Thay đổi giờ từ " +
                  oldTime +
                  " sang " +
                  newTime +
                  " (" +
                  person +
                  ")",
              );
            } else {
              lecturersChangesMap[lecturerEmail].push(
                "- Ngày " +
                  dateVal +
                  ": Có cập nhật mới về lịch giảng dạy (" +
                  person +
                  ")",
              );
            }
          }
        }
      }

      cacheSheet.clear();
      if (newData.length > 0) {
        cacheSheet
          .getRange(1, 1, newData.length, newData[0].length)
          .setValues(newData);
      }
    });

    var emails = Object.keys(lecturersChangesMap);
    var totalSent = 0;
    for (var i = 0; i < emails.length; i++) {
      var email = emails[i];
      try {
        var changes = lecturersChangesMap[email];
        var emailBody =
          "Xin chào giảng viên,\n\nLịch giảng dạy/hội đồng của bạn trên Google Sheet đã có sự thay đổi. Chi tiết như sau:\n" +
          changes.join("\n") +
          "\n\nVui lòng truy cập trang web để đồng bộ lại: https://shedule-teaching.vercel.app/\n\nTrân trọng.";
        GmailApp.sendEmail(
          email,
          "[FPT Calendar] Thông báo thay đổi lịch",
          emailBody,
        );
        totalSent++;
      } catch (err) {
        AppLogger.error("Failed to send email to " + email, err.toString());
      }
    }

    AppLogger.info("Notifications processed", { totalSent: totalSent });
    deleteTriggerById_(triggerId);
  } catch (err) {
    AppLogger.error("Process notifications error", err.toString());
    deleteTriggerById_(triggerId);
  }
}

function deleteTriggerById_(id) {
  if (!id) return;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getUniqueId() === id) {
      ScriptApp.deleteTrigger(triggers[i]);
      break;
    }
  }
}

/**
 *  Tạo bảng tóm tắt lịch trình (Text/HTML basic) cho phần mô tả Calendar
 */
function summarizeSchedule_(subEvents) {
  try {
    return subEvents
      .map(function (s, idx) {
        const d = parseDateISO_(s.start);
        const dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
        const timeStr =
          Utilities.formatDate(d, "GMT+7", "HH:mm") +
          "-" +
          Utilities.formatDate(parseDateISO_(s.end), "GMT+7", "HH:mm");
        return (
          idx +
          1 +
          ". 📅 " +
          dateStr +
          " | ⏰ " +
          timeStr +
          " | 📍 " +
          (s.location || "N/A")
        );
      })
      .join("<br>");
  } catch (e) {
    return "Không thể tải tóm tắt.";
  }
}

/**
 * 🛠️ Utility: Parse ISO date string reliably
 */
function parseDateISO_(isoStr) {
  if (!isoStr) return new Date();
  var d = new Date(isoStr);
  if (!isNaN(d.getTime())) return d;
  // Fallback for YYYY-MM-DD
  var parts = String(isoStr).split("T")[0].split("-");
  if (parts.length === 3) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
}

function sendManualSummaryEmail_(toEmails, title, subEvents, calendarName) {
  try {
    var emailList = toEmails.split(",");
    var rowsHtml = subEvents
      .map(function (s, idx) {
        var d = new Date(s.start);
        var dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
        var timeStr =
          Utilities.formatDate(d, "GMT+7", "HH:mm") +
          " - " +
          Utilities.formatDate(new Date(s.end), "GMT+7", "HH:mm");
        return (
          "<tr>" +
          "<td style='padding: 10px; border: 1px solid #ddd;'>" +
          (idx + 1) +
          "</td>" +
          "<td style='padding: 10px; border: 1px solid #ddd;'>" +
          dateStr +
          "</td>" +
          "<td style='padding: 10px; border: 1px solid #ddd;'>" +
          timeStr +
          "</td>" +
          "<td style='padding: 10px; border: 1px solid #ddd;'>" +
          s.location +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var bodyHtml =
      "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;'>" +
      "<h2 style='color: #F27024; border-bottom: 2px solid #F27024; padding-bottom: 10px;'>" +
      title +
      "</h2>" +
      "<p>Kính chào Giảng viên,</p>" +
      "<p>Bạn có lịch chấm mới trên hệ thống <b>FPT Scheduler</b>. Toàn bộ lịch trình đã được đồng bộ vào Google Calendar cá nhân của bạn.</p>" +
      "<table style='width: 100%; border-collapse: collapse; margin: 15px 0;'>" +
      "<thead style='background: #f8f8f8;'><tr><th>STT</th><th>Ngày</th><th>Giờ</th><th>Phòng</th></tr></thead>" +
      "<tbody>" +
      rowsHtml +
      "</tbody>" +
      "</table>" +
      "<p>Trân trọng,<br><b>Ban Đào Tạo FPT Polytechnic</b></p></div>";

    emailList.forEach(function (email) {
      GmailApp.sendEmail(
        email.trim(),
        "[FPT Scheduler] Thông báo lịch chấm mới",
        "",
        { htmlBody: bodyHtml },
      );
    });
  } catch (e) {
    AppLogger.error("sendManualSummaryEmail error", e.toString());
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
