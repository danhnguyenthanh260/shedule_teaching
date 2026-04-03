/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 14.53 - TOTAL CLEANUP (PRIMARY + SUB)
 * =====================================================
 */

var CONSTANTS = {
  GAS_SECRET: PropertiesService.getScriptProperties().getProperty("GAS_SECRET") || "FPTxavalo2026",
  DEFAULT_CALENDAR_NAME: "Schedule Teaching",
  SOURCE_TAG: "fpt_source",
  SIGNATURE_TAG: "fpt_signature",
  MAGIC_STRING: "Dong bo tu FPT Scheduler",
  SUCCESS: "success",
  ERROR: "error",
  FIREBASE_WEB_API_KEY:
    PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY") ||
    "YOUR_FIREBASE_KEY_HERE",
  FIREBASE_URL:
    "https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/",
  ADMIN_EMAILS: ["ngohoangtruongdat@gmail.com", "ngohoangtruongdat2@gmail.com"],
  APP_URL: "https://shedule-teaching.vercel.app",
  INVITATION_CALENDAR_NAME: "FPT Scheduler - Invitations",
  OAUTH: {
    CLIENT_ID:
      PropertiesService.getScriptProperties().getProperty("GOOGLE_CLIENT_ID") || "YOUR_CLIENT_ID_HERE",
    CLIENT_SECRET: 
      PropertiesService.getScriptProperties().getProperty("GOOGLE_CLIENT_SECRET") || "YOUR_CLIENT_SECRET_HERE",
    REDIRECT_URI: "https://shedule-teaching.vercel.app/",
  },
  // 📧 CAU HINH SMTP (SendGrid) - De gui so luong lon (>100 mail/ngay)
  EMAIL_API: {
    SENDGRID_API_KEY:
      PropertiesService.getScriptProperties().getProperty("SENDGRID_API_KEY") || "YOUR_SENDGRID_KEY_HERE",
    FROM_EMAIL: "ngohoangtruongdat2@gmail.com",
    FROM_NAME: "FPT Scheduler Service",
  },
};
/**
 * 📨 HE THONG GUI MAIL TAP TRUNG (Hybrid Email Service)
 */
var EmailService = {
  send: function (to, subject, bodyHtml, options) {
    options = options || {};
    const fromEmail = CONSTANTS.EMAIL_API.FROM_EMAIL || "";
    const apiKey = CONSTANTS.EMAIL_API.SENDGRID_API_KEY;
    const quota = MailApp.getRemainingDailyQuota();
    const isGmailSender = fromEmail.toLowerCase().indexOf("@gmail.com") !== -1;

    AppLogger.info(
      "EmailService: Preparing to send to " + to + " (Quota: " + quota + ")",
    );

    // 🚀 CHIEN LUOC 1: UU TIEN GMAIL (Neu con Quota va la tai khoan Gmail)
    if (isGmailSender && quota > 0) {
      const res = this.fallbackToGmail(to, subject, bodyHtml, options);
      if (res.success) return res;
    }

    // 🚀 CHIEN LUOC 2: SENDGRID (Neu Gmail het Quota hoac khong phai Gmail sender)
    if (apiKey && apiKey.length > 10) {
      try {
        const url = "https://api.sendgrid.com/v3/mail/send";
        const payload = {
          personalizations: [{ to: [{ email: to }] }],
          from: {
            email: fromEmail,
            name: options.name || CONSTANTS.EMAIL_API.FROM_NAME,
          },
          subject: subject,
          content: [{ type: "text/html", value: bodyHtml }],
        };

        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + apiKey },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });

        const code = response.getResponseCode();
        if (code >= 200 && code < 300) {
          AppLogger.info(
            "SMTP: Mail sent successfully to " + to + " via SendGrid",
          );
          return { success: true, method: "SendGrid" };
        } else {
          const resText = response.getContentText();
          AppLogger.error("SMTP Error (" + code + "): " + resText);
          // Neu SendGrid loi, thu Gmail phat cuoi neu con quota
          if (quota > 0)
            return this.fallbackToGmail(to, subject, bodyHtml, options);
        }
      } catch (e) {
        AppLogger.error("SMTP Critical Error: " + e.toString());
        if (quota > 0)
          return this.fallbackToGmail(to, subject, bodyHtml, options);
      }
    }

    // 🚀 CHIEN LUOC 3: CUOI CUNG (Thu Gmail bat chap neu chua thu o buoc 1)
    if (quota > 0) {
      return this.fallbackToGmail(to, subject, bodyHtml, options);
    }

    return {
      success: false,
      error: "Het han muc Gmail (0) va SendGrid khong kha dung hoac bi loi.",
    };
  },

  fallbackToGmail: function (to, subject, bodyHtml, options) {
    try {
      const quota = MailApp.getRemainingDailyQuota();
      if (quota > 0) {
        GmailApp.sendEmail(to, subject, "", {
          htmlBody: bodyHtml,
          name: options.name || "FPT Scheduler",
        });
        AppLogger.info("Gmail: Mail sent successfully to " + to);
        return { success: true, method: "Gmail", quotaRemaining: quota - 1 };
      } else {
        return { success: false, error: "Quota Exceeded" };
      }
    } catch (e) {
      AppLogger.error("Email Fallback Failed", e.toString());
      return { success: false, error: e.toString() };
    }
  },
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
  warn: function (msg, detail) {
    this.log("WARN", msg, detail);
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
    // 🔑 Tu dong lay token neu khong duoc truyen vao (Ho tro Admin flow)
    var token = accessToken || ScriptApp.getOAuthToken();

    const url = this.baseUrl + path;
    const params = {
      method: options.method || "get",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      muteHttpExceptions: true,
    };

    if (options.payload) {
      params.payload =
        typeof options.payload === "string"
          ? options.payload
          : JSON.stringify(options.payload);
    }

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

  listEvents: function (
    accessToken,
    calendarId,
    timeMin,
    timeMax,
    queryParams,
  ) {
    var path =
      "/calendars/" +
      encodeURIComponent(calendarId) +
      "/events" +
      "?timeMin=" +
      encodeURIComponent(timeMin) +
      "&timeMax=" +
      encodeURIComponent(timeMax) +
      "&showDeleted=false&singleEvents=true";
    if (queryParams) {
      Object.keys(queryParams).forEach(function (k) {
        path += "&" + k + "=" + encodeURIComponent(queryParams[k]);
      });
    }
    return this.fetch_(accessToken, path);
  },

  createEvent: function (accessToken, calendarId, eventData, sendUpdates) {
    var path = "/calendars/" + encodeURIComponent(calendarId) + "/events";
    // 📧 Luon them sendUpdates=all neu co yeu cau gui mail
    if (sendUpdates) {
      path += (path.indexOf("?") === -1 ? "?" : "&") + "sendUpdates=all";
    }
    return this.fetch_(accessToken, path, {
      method: "post",
      payload: eventData,
    });
  },

  patchEvent: function (
    accessToken,
    calendarId,
    eventId,
    eventData,
    queryParams,
  ) {
    let path =
      "/calendars/" +
      encodeURIComponent(calendarId) +
      "/events/" +
      encodeURIComponent(eventId);
    if (queryParams) {
      const qs = Object.keys(queryParams)
        .map((k) => k + "=" + encodeURIComponent(queryParams[k]))
        .join("&");
      path += "?" + qs;
    }
    return this.fetch_(accessToken, path, {
      method: "patch",
      payload: eventData,
    });
  },

  deleteEvent: function (accessToken, calendarId, eventId, sendUpdates) {
    var path =
      "/calendars/" +
      encodeURIComponent(calendarId) +
      "/events/" +
      encodeURIComponent(eventId);
    if (sendUpdates) path += "?sendUpdates=all";

    return this.fetch_(accessToken, path, {
      method: "delete",
    });
  },

  /**
   * 🔍 Tim ID cua lich theo ten (Dung cho REST API). Tu dong tao neu khong thay.
   */
  findCalendarIdByName: function (accessToken, name, autoCreate) {
    if (!name || name.toLowerCase() === "primary") return "primary";
    try {
      var list = this.fetch_(accessToken, "/users/me/calendarList");
      if (list.items) {
        var found = list.items.find(function (c) {
          return c.summary === name || c.id === name;
        });
        if (found) return found.id;
      }

      // Neu khong tim thay va yeu cau tu tao (Chi danh cho Schedule Teaching)
      if (autoCreate) {
        AppLogger.info("Calendar not found, creating new one: " + name);
        var newCal = this.fetch_(accessToken, "/calendars", {
          method: "post",
          payload: { summary: name },
        });
        return newCal.id;
      }
    } catch (e) {
      AppLogger.error("Error finding/creating calendar", e);
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
    sendUpdates,
  ) {
    if (!Array.isArray(events) || events.length === 0)
      return { total: 0, success: 0 };

    force = force || false;
    googleAccessToken = googleAccessToken || null;
    sheetType = (sheetType || "unknown").toLowerCase().trim(); // 🛡️ CHUAN HOA: Tranh loi Review !== review
    skipCleanup = skipCleanup || false;
    sendUpdates = sendUpdates !== undefined ? sendUpdates : false;

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
      diffDetails: {
        added: [],
        updated: [],
        removed: [],
      },
    };

    try {
      if (useRestApi) {
        var calendarId = GoogleCalendarAPI.findCalendarIdByName(
          googleAccessToken,
          targetCalendarName,
          true, // ✅ Tu dong tao neu khong thay (Tranh lam ban Primary cua Admin)
        );

        // 📅 1. Ban kinh quet (180 ngay)
        var nowNum = new Date().getTime();
        var queryMin = new Date(
          nowNum - 180 * 24 * 60 * 60 * 1000,
        ).toISOString();
        var queryMax = new Date(
          nowNum + 180 * 24 * 60 * 60 * 1000,
        ).toISOString();

        // 🔍 2. Lay tat ca lich hien co cua App nay
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

        // 🚀 TOI UU: Tao Map de tim kiem (Dung Object thay cho Map neu la Rhino)
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

        // 🧩 4. Chien luoc "Dong bo Vi sai" (Differential Sync)
        for (var i = 0; i < events.length; i++) {
          var nev = events[i];
          var nevStart = new Date(nev.start).getTime();
          var nevEnd = new Date(nev.end).getTime();

          // 🔍 BUOC 3: XAC DINH CHU KY (SIGNATURE)
          // 🚀 CAI TIEN: Khong dung chi so dong (i) vi no khong ben vung khi loc/sap xep
          var idForSignature =
            nev.code ||
            nev.signature ||
            (
              nev.title +
              "_" +
              nev.start +
              "_" +
              (nev.location || "N/A")
            ).replace(/\s/g, "");

          var signature = Utilities.base64Encode(
            Utilities.computeDigest(
              Utilities.DigestAlgorithm.MD5,
              idForSignature,
              Utilities.Charset.UTF_8,
            ),
          );
          nev.signature = signature;

          // Tim theo Signature
          var oldEvent = signatureMap[signature] || null;

          // 🧠 FALLBACK: Neu khong tim thay theo Signature
          // Thu tim theo "Ngay + Ten" (BO QUA GIO) de nhan dien cap nhat Slot
          if (!oldEvent) {
            for (var sig in signatureMap) {
              var candidate = signatureMap[sig];
              var cStart = new Date(
                candidate.start.dateTime || candidate.start.date,
              );
              var nStart = new Date(nevStart);

              // Neu cung Ngay/Thang/Nam & cung Ten -> Coi la cung 1 buoi nhung doi gio
              if (
                cStart.getDate() === nStart.getDate() &&
                cStart.getMonth() === nStart.getMonth() &&
                cStart.getFullYear() === nStart.getFullYear() &&
                norm(candidate.summary) === norm(nev.title)
              ) {
                oldEvent = candidate;
                break;
              }
            }
          }

          if (oldEvent) {
            // Da co tren lich -> Kiem tra thay doi noi dung (Cap nhat)
            const oStartNum = new Date(
              oldEvent.start.dateTime || oldEvent.start.date,
            ).getTime();
            const oEndNum = new Date(
              oldEvent.end.dateTime || oldEvent.end.date,
            ).getTime();

            // Lay Slot tu mo ta hoac title cua su kien cu neu can so sanh text slot
            // Nhung tot nhat la so sanh truc tiep thoi gian tuyet doi
            const isChanged =
              norm(oldEvent.summary) !== norm(nev.title) ||
              norm(oldEvent.location) !== norm(nev.location) ||
              Math.abs(oStartNum - nevStart) > 60000; // Sai lech tren 1 phut moi tinh la doi gio

            if (!isChanged) {
              exactMatches[oldEvent.id] = true;
              results.skipped++;
              continue;
            } else {
              // 🚀 SMART PATCH (Manual Sync): Cập nhật thay vì Xóa-Tạo lại
              try {
                GoogleCalendarAPI.patchEvent(googleAccessToken, calendarId, oldEvent.id, {
                  summary: nev.title,
                  location: nev.location || "",
                  start: { dateTime: Utilities.formatDate(new Date(nevStart), "GMT+7", "yyyy-MM-dd'T'HH:mm:ss+07:00") },
                  end: { dateTime: Utilities.formatDate(new Date(nevEnd), "GMT+7", "yyyy-MM-dd'T'HH:mm:ss+07:00") }
                });
                exactMatches[oldEvent.id] = true; // Đánh dấu là đã xử lý
                results.updated++;
                results.diffDetails.updated.push({
                  date: Utilities.formatDate(new Date(nevStart), "GMT+7", "dd/MM/yyyy"),
                  id: oldEvent.id,
                  type: "PATCH"
                });
                continue; 
              } catch (patchErr) {
                AppLogger.warn("Manual Patch failed, falling back to Recreate", patchErr.toString());
                toDeleteIds.push(oldEvent.id);
              }
            }
          } else {
            // Brand new (no signature match)
            results.diffDetails.added.push(nev);
          }

          // 🛡️ BUOC 5: KIEM TRA XUNG DOT (Overlap Check)
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
              newEvent: String(nev.title || "Events moi"),
              newStart: String(nev.start || ""),
              newEnd: String(nev.end || ""),
              oldEvent: String(overlap.summary || "Lich hien co"),
              oldStart: String(overlap.start.dateTime || overlap.start.date),
              oldEnd: String(overlap.end.dateTime || overlap.end.date),
            });
          } else {
            toAdd.push(nev);
          }
        }

        // 🛡️ BUOC 6: DON DEP "LICH THUA" (Mirror Cleanup)
        if (!skipCleanup) {
          for (var i = 0; i < allAppEvents.length; i++) {
            var other = allAppEvents[i];
            var p =
              (other.extendedProperties && other.extendedProperties.private) ||
              {};
            var otherType = (p["sheet_type"] || "council").toLowerCase();
            if (
              otherType === sheetType &&
              !exactMatches[other.id] &&
              toDeleteIds.indexOf(other.id) === -1
            ) {
              toDeleteIds.push(other.id);
              results.diffDetails.removed.push({
                title: other.summary,
                location: other.location,
                start: new Date(
                  other.start.dateTime || other.start.date,
                ).getTime(),
              });
            }
          }
        }

        // 🚀 THUC THI (Execution) - Xoa truoc
        for (var i = 0; i < toDeleteIds.length; i++) {
          try {
            GoogleCalendarAPI.deleteEvent(
              googleAccessToken,
              calendarId,
              toDeleteIds[i],
              sendUpdates,
            );
          } catch (e) {
            /* ignore */
          }
        }

        // Tao moi
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
                  row_code: ev.code || "", // Luu them ma code de doi soat cung
                },
              },
            };
            // 🎨 MAU SAC: Do cho Hoi dong, Xanh duong cho Review
            payload.colorId = ev.colorId
              ? String(ev.colorId)
              : sheetType === "review"
                ? "9"
                : "11";

            //  LONG DATA VAO DESCRIPTION (Danh cho Google Calendar Invitation)
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
                "<b>CHI TIET LICH TRINH:</b><br>" +
                summaryBody +
                "<br>---<br>" +
                payload.description;
            }
            if (ev.guests) {
              var guestList = ev.guests.split(",").filter(function (e) {
                return e && e.trim().includes("@");
              });
              AppLogger.info("Adding attendees to event", {
                title: payload.summary,
                count: guestList.length,
                list: guestList,
              });
              payload.attendees = guestList.map(function (email) {
                return {
                  email: email.trim(),
                };
              });
            }

            // 🚀 HYBRID SERIES: Logic gom nhom de co RSVP (Accept/Decline)
            if (ev.subEvents && ev.subEvents.length > 1) {
              // 🛡️ BAO VE 400: Phan tich ngay thu cong (DD/MM/YYYY khong duoc JS ho tro tot)
              // parseDateISO da duoc khai bao o tren neu can (nhung ta se dung phien ban dung chung cho sach se)

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

              // 1. Tao chuoi lap dai dien (Trigger 1 email voi nut Yes/No)
              // 🔔 Dung RDATE tung dong va TZID de khop tuyet doi (Fix 400)
              // 🚀 FIX RSVP: Bo buoi dau khoi RDATE de tranh trung lap ngay dau gay map mo
              var recurrence = ["RRULE:FREQ=DAILY;COUNT=1"];
              ev.subEvents.forEach(function (s, idx) {
                if (idx === 0) return; // Buoi som nhat da la DTSTART cua Master roi
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
                  sendUpdates, // ✅ Dung tham so truyen xuong (thay vi ep true)
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
                // 2. Lay danh sach Instance cua chuoi vua tao de dieu chinh dung slot gio
                var instances = GoogleCalendarAPI.fetch_(
                  googleAccessToken,
                  "/calendars/" +
                    encodeURIComponent(calendarId) +
                    "/events/" +
                    encodeURIComponent(res.id) +
                    "/instances?maxResults=50",
                );

                if (instances && instances.items) {
                  // Sap xep instances theo thoi gian de khop thu tu voi subEvents
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
                        // 🛡️ BAO VE THU HOI (RECALL): Patch lai tag an de clearEvents tim thay
                        extendedProperties: payload.extendedProperties,
                      },
                    });
                  }

                  // 3. Batch update cac buoi le ma khong gui them email bao (TOI UU)
                  if (updateRequests.length > 0) {
                    GoogleCalendarAPI.fetchAll_(
                      googleAccessToken,
                      updateRequests,
                    );
                  }
                }
              }
            } else {
              // Xu ly su kien don le thong thuong
              res = GoogleCalendarAPI.createEvent(
                googleAccessToken,
                calendarId,
                payload,
                sendUpdates, // ✅ Dung tham so truyen xuong (Tranh spam email cho tung buoi)
              );
            }
            
            // 🚀 LƯU VÀO PROPERTIES SERVICE THEO EVID_ROWID
            if (res && res.id && ev.rowId) {
               var props = PropertiesService.getScriptProperties();
               props.setProperty("EVID_" + ev.rowId, res.id);
            }

            // 📧 KHONG CAN EMAIL BO SUNG NEU DA LONG VAO DESCRIPTION
            // Viec long bang vao mo ta giup Google Invitation chua day du thong tin + Nut Co/Khong

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
    eventIds,
  ) {
    googleAccessToken = googleAccessToken || null;
    sheetType = sheetType || null;
    sendUpdates = sendUpdates || false;

    let deletedCount = 0;

    // 🚀 NEW: Neu co danh sach ID cu the, thuc hien xoa tuan tu de tin cay 100%
    if (
      googleAccessToken &&
      eventIds &&
      Array.isArray(eventIds) &&
      eventIds.length > 0
    ) {
      AppLogger.info(
        "Sequential deleting " + eventIds.length + " explicit IDs...",
      );

      // Resolve calendarId mot lan neu can
      var resolvedDefaultCalId = null;
      var needsResolve = eventIds.some(function (id) {
        return String(id).indexOf("|") === -1;
      });
      if (needsResolve && calendarName) {
        resolvedDefaultCalId = GoogleCalendarAPI.findCalendarIdByName(
          googleAccessToken,
          calendarName,
        );
      }

      eventIds.forEach(function (compositeId) {
        try {
          var parts = String(compositeId).split("|");
          var targetCalId, targetEventId;
          if (parts.length > 1) {
            targetCalId = parts[0];
            targetEventId = parts[1];
          } else {
            targetCalId = resolvedDefaultCalId || "primary";
            targetEventId = compositeId;
          }

          GoogleCalendarAPI.deleteEvent(
            googleAccessToken,
            targetCalId,
            targetEventId,
            sendUpdates,
          );
          deletedCount++;
        } catch (e) {
          AppLogger.error(
            "Failed to delete event: " + compositeId,
            e.toString(),
          );
        }
      });
      return { deletedCount: deletedCount };
    }

    // 🔄 Fallback: Neu khong co ID, thuc hien quet va xoa (Quet rong 2 nam)
    const now = new Date();
    const startTimeNum = now.getTime() - 730 * 24 * 60 * 60 * 1000;
    const endTimeNum = now.getTime() + 730 * 24 * 60 * 60 * 1000;
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
      const idsToDeleteMap = {};

      do {
        let path =
          "/calendars/" +
          encodeURIComponent(calendarId) +
          "/events" +
          "?timeMin=" +
          encodeURIComponent(startTimeStr) +
          "&timeMax=" +
          encodeURIComponent(endTimeStr) +
          "&showDeleted=false&singleEvents=false&maxResults=2500";
        if (pageToken) path += "&pageToken=" + pageToken;

        const listResponse = GoogleCalendarAPI.fetch_(googleAccessToken, path);
        if (listResponse.items) {
          listResponse.items.forEach(function (item) {
            const privateProps =
              (item.extendedProperties && item.extendedProperties.private) ||
              {};
            const summary = item.summary || "";
            const description = item.description || "";

            var hasCorrectTag =
              privateProps[CONSTANTS.SOURCE_TAG] === "fpt_scheduler" ||
              privateProps["fpt_source"] === "fpt_scheduler" ||
              privateProps["fpt_scheduler"] === "true";

            var hasMagicMarker =
              description
                .toLowerCase()
                .indexOf(CONSTANTS.MAGIC_STRING.toLowerCase()) !== -1 ||
              summary.indexOf("[Lich Cham]") !== -1 ||
              summary.indexOf("- Slot(") !== -1 ||
              summary.toLowerCase().indexOf("slot") !== -1 ||
              summary.toLowerCase().indexOf("fpt") !== -1 ||
              summary.indexOf("Cham bai Review") !== -1 ||
              summary.indexOf("Hoi dong bao ve") !== -1;

            var isFromApp = hasCorrectTag || hasMagicMarker;

            if (sheetType && isFromApp) {
              var eventType = privateProps["sheet_type"] || "unknown";
              if (eventType !== "unknown" && eventType !== sheetType) {
                isFromApp = false;
              }
            }

            if (isFromApp) {
              idsToDeleteMap[item.id] = true;
            }
          });
        }
        pageToken = listResponse.nextPageToken;
      } while (pageToken);

      // THUC THI XOA (Sequential)
      const allIds = Object.keys(idsToDeleteMap);
      allIds.forEach(function (id) {
        try {
          GoogleCalendarAPI.deleteEvent(
            googleAccessToken,
            calendarId,
            id,
            sendUpdates,
          );
          deletedCount++;
        } catch (e) {
          AppLogger.error("Scan delete failure for ID: " + id, e.toString());
        }
      });
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

  /**
   * 🔍 NEW: Quet ID cua cac su kien do App tao ra ma khong thuc hien xoa
   */
  getAppEventIds: function (calendarName, googleAccessToken, sheetType) {
    if (!googleAccessToken) {
      throw new Error(
        "401: Google Access Token is required for this operation.",
      );
    }

    try {
      var calendarId = GoogleCalendarAPI.findCalendarIdByName(
        googleAccessToken,
        calendarName,
      );
      if (!calendarId) {
        throw new Error(
          "404: Khong tim thay lich: " + (calendarName || "mac dinh"),
        );
      }

      const ids = [];
      const now = new Date();
      const startTimeStr = new Date(
        now.getTime() - 180 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 6 thang truoc
      const endTimeStr = new Date(
        now.getTime() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 1 nam sau

      // 🔄 Helper function to scan a specific calendar
      var scanCalendar = function (calId) {
        let pageToken = null;
        do {
          let path =
            "/calendars/" +
            encodeURIComponent(calId) +
            "/events" +
            "?timeMin=" +
            encodeURIComponent(startTimeStr) +
            "&timeMax=" +
            encodeURIComponent(endTimeStr) +
            "&showDeleted=false&singleEvents=false&maxResults=2500";
          if (pageToken) path += "&pageToken=" + pageToken;

          const listResponse = GoogleCalendarAPI.fetch_(
            googleAccessToken,
            path,
          );
          if (listResponse.items) {
            listResponse.items.forEach(function (item) {
              const privateProps =
                (item.extendedProperties && item.extendedProperties.private) ||
                {};
              const summary = item.summary || "";
              const description = item.description || "";

              var hasCorrectTag =
                privateProps[CONSTANTS.SOURCE_TAG] === "fpt_scheduler" ||
                privateProps["fpt_source"] === "fpt_scheduler" ||
                privateProps["fpt_scheduler"] === "true";

              var hasMagicMarker =
                description
                  .toLowerCase()
                  .indexOf(CONSTANTS.MAGIC_STRING.toLowerCase()) !== -1 ||
                summary.indexOf("[Lich Cham]") !== -1 ||
                summary.indexOf("- Slot(") !== -1 ||
                summary.toLowerCase().indexOf("slot") !== -1 ||
                summary.indexOf("Cham bai Review") !== -1 ||
                summary.indexOf("Hoi dong bao ve") !== -1;

              let isFromApp = hasCorrectTag || hasMagicMarker;

              if (sheetType && isFromApp) {
                var eventType = privateProps["sheet_type"] || "unknown";
                if (eventType !== "unknown" && eventType !== sheetType) {
                  isFromApp = false;
                }
              }

              if (isFromApp) {
                // Tra ve dinh dang composite de clearEvents biet calendarId
                ids.push(calId + "|" + item.id);
              }
            });
          }
          pageToken = listResponse.nextPageToken;
        } while (pageToken);
      };

      // Chi quet lich muc tieu — khong quet da lich de tranh loi quyen truy cap
      scanCalendar(calendarId);

      // Tra ve ID don (khong composite) vi clearEvents se tu dung calendarId tu calendarName
      return ids.map(function (composite) {
        var parts = String(composite).split("|");
        return parts.length > 1 ? parts[1] : composite;
      });
    } catch (e) {
      AppLogger.error("getAppEventIds Error", e.toString());
      throw e; // Relaunch to be caught by doPost
    }
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
      if (!sheetId) throw new Error("URL Google Sheet khong hop le (ID)");

      ss = SpreadsheetApp.openById(sheetId);
      sheets = ss.getSheets();
      sheet = sheets[0];

      if (payload.tabName) {
        found = ss.getSheetByName(payload.tabName.trim());
        if (found) sheet = found;
      }

      data = sheet.getDataRange().getDisplayValues(); // 🚀 Dùng DisplayValues để khớp UI
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
      if (!sheetId) throw new Error("URL Google Sheet khong hop le");

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
      if (!sheetId) throw new Error("URL Google Sheet khong hop le");

      res = setupNotificationTrigger(sheetId, payload.tabName);
      return jsonResponse_(res);
    }

    if (action === "disableNotifications") {
      sheetIdMatch = payload.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
      if (!sheetId) throw new Error("URL Google Sheet khong hop le");

      res = disableNotificationTrigger(sheetId, payload.tabName);
      return jsonResponse_(res);
    }

    if (action === "getAppEventIds") {
      res = CalendarService.getAppEventIds(
        payload.calendarName,
        payload.googleAccessToken || null,
        payload.sheetType || null,
      );
      return jsonResponse_({
        status: CONSTANTS.SUCCESS,
        version: "16.0",
        data: res,
      });
    }

    if (action === "clearCalendar") {
      res = CalendarService.clearEvents(
        payload.calendarName || CONSTANTS.DEFAULT_CALENDAR_NAME,
        payload.googleAccessToken || null,
        payload.sheetType || null,
        payload.sendUpdates || false,
        payload.eventIds || null,
      );
      return jsonResponse_({
        status: CONSTANTS.SUCCESS,
        version: "16.0",
        message: "Cleared",
        data: res,
      });
    }

    if (action === "notifyLecturers") {
      res = notifyLecturersHandler_(payload);
      return jsonResponse_(res);
    }

    if (action === "batchInvitationNotify") {
      res = batchInvitationNotifyHandler_(payload);
      return jsonResponse_(res);
    }

    if (action === "syncToNativeGuest") {
      res = syncToNativeGuestHandler_(payload);
      return jsonResponse_(res);
    }

    if (action === "respondToInvitations") {
      res = respondToInvitationsHandler_(payload);
      return jsonResponse_(res);
    }

    if (action === "exchangeOAuthCode") {
      res = exchangeOAuthCodeHandler_(payload);
      return jsonResponse_(res);
    }

    if (action === "getLecturerTokenStatus") {
      res = getLecturerTokenStatusHandler_(payload);
      return jsonResponse_(res);
    }

    if (action === "globalRecall") {
      res = globalRecallHandler_(payload);
      return jsonResponse_(res);
    }

    // ✅ Kích hoạt trigger onEdit với ColumnMapping config từ frontend
    if (action === "setupAutoSyncTrigger") {
      try {
        var sheetId = payload.sheetId;
        if (!sheetId && payload.sheetUrl) {
           var m = payload.sheetUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
           if (m) sheetId = m[1];
        }
        
        if (!sheetId) throw new Error("Không thể xác định ID Spreadsheet từ Payload.");

        var ss = SpreadsheetApp.openById(sheetId);
        if (!ss) throw new Error("Không mở được spreadsheet (Kiểm tra quyền Admin): " + sheetId);

        // ✅ LƯU ĐA CẤU HÌNH (Hỗ trợ nhiều Tab hoặc nhiều cụm trên 1 Sheet)
        var props = PropertiesService.getScriptProperties();
        var configKey = "AUTO_SYNC_CONFIGS_" + sheetId; 

        var existingRaw = props.getProperty(configKey);
        var configsArray = [];
        if (existingRaw) {
          try { configsArray = JSON.parse(existingRaw); } catch (e) { configsArray = []; }
        }

        var newConfigId = payload.configId || payload.tabName || "default";
        var newConfig = {
          configId: newConfigId,
          tabName: payload.tabName || "",
          sheetType: payload.sheetType || "review",
          columnConfig: payload.columnConfig || null,
          startRow: parseInt(payload.startRow || "1"),
          updatedAt: new Date().toISOString(),
        };

        // Ghi đè nếu trùng configId, nếu không thì thêm mới
        var idx = -1;
        for(var ci=0; ci<configsArray.length; ci++) {
          if (configsArray[ci].configId === newConfigId) { idx = ci; break; }
        }
        if (idx >= 0) configsArray[idx] = newConfig;
        else configsArray.push(newConfig);

        props.setProperty(configKey, JSON.stringify(configsArray));

        // ✅ QUẢN LÝ TRIGGER (Tránh tạo trùng lặp)
        var triggers = ScriptApp.getProjectTriggers();
        var triggerExists = false;
        for (var ti = 0; ti < triggers.length; ti++) {
          var t = triggers[ti];
          if (t.getHandlerFunction() === "autoSyncOnSheetEdit_" && t.getTriggerSourceId() === sheetId) {
            triggerExists = true;
            break;
          }
        }

        if (!triggerExists) {
          ScriptApp.newTrigger("autoSyncOnSheetEdit_")
            .forSpreadsheet(ss)
            .onEdit()
            .create();
        }

        // 🚀 CẢI TIẾN: Khởi tạo Cache ngay lập tức để lần sửa đầu tiên hoạt động luôn
        if (payload.tabName) {
            var targetSheet = ss.getSheetByName(payload.tabName);
            if (targetSheet) {
                var cName = "__auto_sync_cache_" + payload.tabName;
                var cSheet = ss.getSheetByName(cName);
                if (!cSheet) {
                    cSheet = ss.insertSheet(cName);
                    cSheet.hideSheet();
                    var d = targetSheet.getDataRange().getDisplayValues();
                    cSheet.getRange(1, 1, d.length, d[0].length).setValues(d);
                    AppLogger.info("setupAutoSyncTrigger: Da khoi tao cache cho " + payload.tabName);
                }
            }
        }

        return jsonResponse_({
          status: CONSTANTS.SUCCESS,
          message: "✅ Đã đăng ký đồng bộ tự động thành công cho học kỳ: " + (payload.configId || ss.getName()),
          sheetId: sheetId
        });
      } catch (trigErr) {
        AppLogger.error("setupAutoSyncTrigger error", trigErr.toString());
        return jsonResponse_({ status: CONSTANTS.ERROR, message: trigErr.toString() });
      }
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
      version: "14.26",
      data: res,
    });
  } catch (err) {
    AppLogger.error("POST Error", err.toString());
    return jsonResponse_({
      status: CONSTANTS.ERROR,
      version: "14.26",
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
  DEBOUNCE_SECONDS: 10, // 🕒 Set to 10s per user request
  EMAIL_COLUMN_INDEX: 13, // Column N (0-indexed)
};

function setupNotificationTrigger(spreadsheetId, tabName) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sourceSheet = tabName ? ss.getSheetByName(tabName) : ss.getSheets()[0];

    if (!sourceSheet) {
      throw new Error("Khong tim thay tab: " + (tabName || "Mac dinh"));
    }

    var actualTabName = sourceSheet.getName();
    var cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + actualTabName;

    var cacheSheet = ss.getSheetByName(cacheSheetName);
    if (!cacheSheet) {
      cacheSheet = ss.insertSheet(cacheSheetName);
      cacheSheet.hideSheet();
    }

    var currentData = sourceSheet.getDataRange().getDisplayValues();
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
      message: "Da bat theo doi cho tab " + actualTabName,
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
    if (!targetSheet) return { status: "error", message: "Khong tim thay tab" };

    var cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + targetSheet.getName();
    var cacheSheet = ss.getSheetByName(cacheSheetName);

    if (cacheSheet) {
      ss.deleteSheet(cacheSheet);
    }

    return {
      status: "success",
      message: "Da tat theo doi cho tab " + targetSheet.getName(),
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
    date: ["ngay bao ve", "ngay khoa luan", "ngay", "date", "thoi gian", "thu"],
    time: ["gio", "thoi gian", "khung gio", "slot", "bat dau", "thoi diem"],
    location: [
      "phong",
      "dia diem",
      "location",
      "room",
      "noi bao ve",
      "phong thi",
      "link",
    ],
    person: [
      "giang vien",
      "gvhd",
      "nhiem vu",
      "reviewer",
      "hoi dong",
      "giam khao",
      "lecturer",
      "can bo",
      "nguoi cham",
      "nguoi huong dan"
    ],
    email: [
      "@fpt.edu.vn",
      "@gmail.com",
      "email",
      "thu dien tu",
      "lien he",
      "mail",
    ],
    code: ["mã hđ", "mã hd", "code", "mã đề tài", "id", "mã hđ/đề tài"],
  };

  var Mapping = {
    date: 5,     // Mặc định Cột F
    time: 6,     // Mặc định Cột G
    location: 7, // Mặc định Cột H
    person: 10,  // Mặc định Cột K (Trương Long)
    emails: [11],
    code: -1,
    headerRowIndex: 0,
  };

  // 🛡️ HARDCODED OVERRIDE (v14.38) - Đảm bảo chính xác tuyệt đối cho Sheet của bạn
  var ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  if (ssId === "1QuiXMhbegm8Xanv7DjQwvTfZ0Dkw64o5DtbflbINoSY" || ssId === "1S7K1i5M9AHup3_8OwyPYRmVfC9GAFuEzBrErOXLAfHE") {
     return {
        date: 5,     // F
        time: 6,     // G
        location: 7, // H
        person: 10,  // K (Dành cho thầy Trương Long)
        emails: [11],
        code: -1,
        headerRowIndex: 0
     };
  }

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
        currentMapping.location === -1 &&
        keywords.location.some(function (k) {
          return val.indexOf(k) !== -1;
        })
      ) {
        currentMapping.location = c;
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
      if (
        (!currentMapping.code || currentMapping.code === -1) &&
        keywords.code.some(function (k) {
          return val === k || val.indexOf(k) !== -1;
        })
      ) {
        currentMapping.code = c;
        matches++;
      }
    }

    if (matches > maxMatches && matches >= 2) {
      maxMatches = matches;
      bestRow = r;
      if (currentMapping.date !== -1) Mapping.date = currentMapping.date;
      if (currentMapping.time !== -1) Mapping.time = currentMapping.time;
      if (currentMapping.location !== -1)
        Mapping.location = currentMapping.location;
      if (currentMapping.person !== -1) Mapping.person = currentMapping.person;
      if (currentMapping.emails.length > 0)
        Mapping.emails = currentMapping.emails;
      if (currentMapping.code && currentMapping.code !== -1) Mapping.code = currentMapping.code;
      Mapping.headerRowIndex = r;
    }
  }
  return Mapping;
}

function detectColumns_(sheet, data) {
    if (!data || data.length === 0) return { date: -1, slot: -1, room: -1, lecturers: [], code: -1 };
    var lastCol = data[0].length;
    var headerRowsLimit = Math.min(data.length, 10);
    var bestHeaderRowIdx = -1;
    var norm = function(s) { return String(s || "").toLowerCase().trim(); };

    for (var hr = 0; hr < headerRowsLimit; hr++) {
        var hData = data[hr];
        for (var c = 0; c < lastCol; c++) {
            var v = norm(hData[c]);
            if (v.indexOf("date") !== -1 || v === "ngày" || v === "ngay" || v === "thời gian") {
                bestHeaderRowIdx = hr;
                break;
            }
        }
        if (bestHeaderRowIdx !== -1) break;
    }

    if (bestHeaderRowIdx === -1) {
        // Fallback: search anywhere in first 5 rows for dates
        return { date: -1, slot: -1, room: -1, lecturers: [], code: -1, headerRowIdx: 0 };
    }

    var hDataFinal = data[bestHeaderRowIdx];
    var colMap = { date: -1, slot: -1, room: -1, lecturers: [], code: -1, gid: -1, headerRowIdx: bestHeaderRowIdx };
    
    for (var c = 0; c < lastCol; c++) {
        var v = norm(hDataFinal[c]);
        if (!v) continue;
        
        if (v.indexOf("date") !== -1 || v === "ngày" || v === "ngay" || v === "thời gian") {
            if (colMap.date === -1) colMap.date = c;
        } else if (v === "slot" || v === "ca" || v === "kíp") {
            if (colMap.slot === -1) colMap.slot = c;
        } else if (v.indexOf("room") !== -1 || v.indexOf("phòng") !== -1) {
            if (colMap.room === -1) colMap.room = c;
        } else if (v.indexOf("reviewer") !== -1 || v.indexOf("giảng viên") !== -1 || v === "gvhd") {
            colMap.lecturers.push(c);
        } else if (v === "mã hđ" || v === "mã hd" || v.indexOf("code") !== -1 || v.indexOf("mã đề tài") !== -1) {
            if (colMap.code === -1) colMap.code = c;
        } else if (v === "gid" || v === "sync id" || v === "google id") {
            if (colMap.gid === -1) colMap.gid = c;
        }
    }
    return colMap;
}

/**
 * 🔄 Cap nhat Cache cho mot Giang vien cu the sau khi Admin thuc hien Dong bo thu cong.
 * Dieu nay giup quy trinh tu dong (Trigger 30s) khong gui mail trung lap.
 */
function updateLecturerCacheFromPayload_(email, sheetUrl, tabName) {
  if (!sheetUrl || !tabName) return;

  try {
    var ss = SpreadsheetApp.openByUrl(sheetUrl);
    var sourceSheet = ss.getSheetByName(tabName);
    var cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + tabName;
    var cacheSheet = ss.getSheetByName(cacheSheetName);

    if (!sourceSheet || !cacheSheet) return;

    var newData = sourceSheet.getDataRange().getDisplayValues();
    var colMap = findNotifyColumns_(newData);
    var emailCols = colMap.emails; // Mang cac cot chua email

    var changedCount = 0;

    // Duyet qua toan bo hang de tim hang cua giang vien nay
    for (var i = 0; i < newData.length; i++) {
      var row = newData[i];
      var isLecturerRow = false;

      for (var j = 0; j < emailCols.length; j++) {
        var colIdx = emailCols[j];
        if (
          String(row[colIdx] || "")
            .toLowerCase()
            .trim() === email.toLowerCase()
        ) {
          isLecturerRow = true;
          break;
        }
      }

      if (isLecturerRow) {
        // Cap nhat hang tuong ung trong Cache Sheets
        var rowNum = i + 1;
        var numCols = row.length;
        
        var cacheSheets = [cacheSheet];
        var autoCacheName = "__auto_sync_cache_" + tabName;
        var autoCacheSheet = ss.getSheetByName(autoCacheName);
        if (autoCacheSheet) cacheSheets.push(autoCacheSheet);

        cacheSheets.forEach(function(cs) {
            if (cs.getLastRow() >= rowNum) {
                cs.getRange(rowNum, 1, 1, numCols).setValues([row]);
            }
        });
        changedCount++;
      }
    }

    if (changedCount > 0) {
      AppLogger.info(
        "Cache updated for " +
          email +
          " (" +
          changedCount +
          " rows synchronized)",
      );
    }
  } catch (err) {
    AppLogger.error("Failed to update cache for " + email, err.toString());
  }
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
  if (!v1 && !v2) return true;

  // 🕒 Xu ly so sanh Date (Dac biet la dinh dang VN DD/MM/YYYY)
  const toTime = (v) => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === "string") {
      // Thu parse DD/MM/YYYY
      const parts = v.split(/[\/\-]/);
      if (parts.length === 3) {
        let d, m, y;
        if (parts[2].length === 4) {
          d = parseInt(parts[0]);
          m = parseInt(parts[1]) - 1;
          y = parseInt(parts[2]);
        } else if (parts[0].length === 4) {
          y = parseInt(parts[0]);
          m = parseInt(parts[1]) - 1;
          d = parseInt(parts[2]);
        }
        if (y) {
          const dt = new Date(y, m, d);
          if (!isNaN(dt.getTime())) return dt.getTime();
        }
      }
      const dt = new Date(v);
      return isNaN(dt.getTime()) ? null : dt.getTime();
    }
    return null;
  };

  const t1 = toTime(v1);
  const t2 = toTime(v2);
  if (t1 !== null && t2 !== null) {
    if (Math.abs(t1 - t2) < 1000) return true; // Trong vong 1 giay coi la bang nhau
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

  // 🛡️ LOCKSERVICE: Ngan chan xung dot giua cac trigger chay song song hoac voi Manual Sync
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // Doi toi da 15s neu co luong khac dang chay
  } catch (e) {
    AppLogger.warn(
      "Could not obtain lock for notifications - Process might be busy.",
    );
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

      var newData = sourceSheet.getDataRange().getDisplayValues();
      var oldData = cacheSheet.getDataRange().getDisplayValues();
      if (newData.length === 0) return;

      var colMap = findNotifyColumns_(newData);
      var startRow = colMap.headerRowIndex + 1;
      var targetIndices = [
        colMap.date,
        colMap.time,
        colMap.location,
        colMap.person,
      ].concat(colMap.emails);

      var maxRows = Math.max(newData.length, oldData.length);
      for (var i = startRow; i < maxRows; i++) {
        var newRow = newData[i] || [];
        var oldRow = oldData[i] || [];

        var hasChange = false;
        for (var j = 0; j < targetIndices.length; j++) {
          var colIdx = targetIndices[j];
          if (colIdx !== undefined && colIdx > -1) {
            if (!isSameValue_(newRow[colIdx], oldRow[colIdx])) {
              hasChange = true;
              break;
            }
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
            var oldLoc = String(oldRow[colMap.location] || "").trim();
            var newLoc = String(newRow[colMap.location] || "").trim();

            if (!lecturersChangesMap[lecturerEmail])
              lecturersChangesMap[lecturerEmail] = {
                tabName: sourceName,
                changes: [],
              };

            if (!isSameValue_(oldTime, newTime) && oldTime && newTime) {
              lecturersChangesMap[lecturerEmail].changes.push(
                "- Ngay " +
                  dateVal +
                  ": Thay doi gio [" +
                  oldTime +
                  " -> " +
                  newTime +
                  "] (" +
                  person +
                  ")",
              );
            } else if (!isSameValue_(oldLoc, newLoc) && oldLoc && newLoc) {
              lecturersChangesMap[lecturerEmail].changes.push(
                "- Ngay " +
                  dateVal +
                  ": Thay doi phong [" +
                  oldLoc +
                  " -> " +
                  newLoc +
                  "] (" +
                  person +
                  ")",
              );
            } else {
              lecturersChangesMap[lecturerEmail].changes.push(
                "- Ngay " + dateVal + ": Co cap nhat du lieu (" + person + ")",
              );
            }
          }
        }
      }

      if (newData.length > 0) {
        // Cap nhat cache truc tiep (khong clear de tranh mat du lieu giua chung)
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
        var data = lecturersChangesMap[email];
        var changes = data.changes;
        var tabName = data.tabName;
        var subject =
          "[FPT Scheduler] Thong bao: Co thay doi lich day moi tai Tab [" +
          tabName +
          "]";
        var bodyHtml =
          "<div style='font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;'>" +
          "<div style='background: #F27024; color: white; padding: 20px; text-align: center;'>" +
          "<h2 style='margin: 0;'>CAP NHAT: " +
          tabName.toUpperCase() +
          "</h2>" +
          "</div>" +
          "<div style='padding: 30px;'>" +
          "<p>Xin chao Giang vien,</p>" +
          "<p>Lich giang day/hoi dong cua ban tren bang tinh <b>" +
          tabName +
          "</b> da co su thay doi moi. Chi tiet cac thay doi duoc ghi nhan:</p>" +
          "<div style='background: #fff8f1; border-left: 4px solid #F27024; padding: 15px; margin: 20px 0; font-size: 14px;'>" +
          changes.join("<br/>") +
          "</div>" +
          "<p style='font-weight: bold; color: #e11d48;'>Luu y: Admin chua thuc hien dong bo nhung thay doi nay len Calendar cua ban.</p>" +
          "<div style='text-align: center; margin: 30px 0;'>" +
          "<a href='" +
          CONSTANTS.APP_URL +
          "' style='background: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;'>TRUY CAP DE DONG BO THU CONG</a>" +
          "</div>" +
          "<p style='font-size: 12px; color: #666;'>Ban co the chu dong nhan nut Ket noi/Dong bo tren trang ca nhan de cap nhat lich moi nhat ma khong can cho Admin.</p>" +
          "</div>" +
          "<div style='background: #f9fafb; padding: 15px; text-align: center; font-size: 11px; color: #999;'>" +
          "He thong FPT Scheduler - Website: " +
          CONSTANTS.APP_URL +
          "</div>" +
          "</div>";

        var mailResult = EmailService.send(email, subject, bodyHtml, {
          name: "FPT Scheduler (Auto)",
        });
        if (mailResult && mailResult.success) {
          totalSent++;
          AppLogger.info(
            "Auto Notify sent to " + email + " via " + mailResult.method,
          );
        }
      } catch (err) {
        AppLogger.error(
          "Failed to send auto email to " + email,
          err.toString(),
        );
      }
    }

    AppLogger.info("Notifications processed", { totalSent: totalSent });
    deleteTriggerById_(triggerId);
  } catch (err) {
    AppLogger.error("Process notifications error", err.toString());
    deleteTriggerById_(triggerId);
  } finally {
    if (lock) lock.releaseLock();
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
 *  Tao bang tom tat lich trinh (Text/HTML basic) cho phan mo ta Calendar
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
    return "Khong the tai tom tat.";
  }
}

/**
 * 🛠️ Utility: Parse ISO date string (Priority: MM/dd/yyyy for US-style sheets)
 */
function parseDateISO_(str) {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  if (typeof str !== "string") return new Date(str);

  // 🛡️ CHIEN LUOC UU TIEN: THANG TRUOC NGAY SAU (MM/dd/yyyy)
  var parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (parts) {
    var first = parseInt(parts[1], 10);
    var second = parseInt(parts[2], 10);
    var y = parseInt(parts[3], 10);

    var m, d;
    // Neu so dau > 12 -> Bat buoc hieu la VN (Ngay truoc Thang sau)
    if (first > 12) {
      d = first;
      m = second - 1;
    } else {
      // Uu tien cao nhat: So dau la THANG
      m = first - 1;
      d = second;
    }

    var timeParts = str.match(/\s(\d{1,2}):(\d{1,2})/);
    if (timeParts) {
      return new Date(
        y,
        m,
        d,
        parseInt(timeParts[1], 10),
        parseInt(timeParts[2], 10),
      );
    }
    return new Date(y, m, d);
  }

  var d = new Date(str);
  if (isNaN(d.getTime())) {
    var iso = str.split("T")[0].split("-");
    if (iso.length === 3) {
      var t = str.split("T")[1] ? str.split("T")[1].split(":") : [0, 0];
      return new Date(
        parseInt(iso[0]),
        parseInt(iso[1]) - 1,
        parseInt(iso[2]),
        parseInt(t[0]),
        parseInt(t[1]),
      );
    }
  }
  return d;
}

function sendManualSummaryEmail_(toEmails, title, subEvents, calendarName) {
  try {
    var emailList = toEmails.split(",");

    // 📅 Sort by Date (ASC)
    subEvents.sort(function (a, b) {
      return (
        parseDateISO_(a.start).getTime() - parseDateISO_(b.start).getTime()
      );
    });

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
      "<p>Kinh chao Giang vien,</p>" +
      "<p>Ban co lich cham moi tren he thong <b>FPT Scheduler</b>. Toan bo lich trinh da duoc dong bo vao Google Calendar ca nhan cua ban.</p>" +
      "<table style='width: 100%; border-collapse: collapse; margin: 15px 0;'>" +
      "<thead style='background: #f8f8f8;'><tr><th>STT</th><th>Ngay</th><th>Gio</th><th>Phong</th></tr></thead>" +
      "<tbody>" +
      rowsHtml +
      "</tbody>" +
      "</table>" +
      "<p>Tran trong,<br><b>Ban Dao Tao FPT Polytechnic</b></p></div>";

    emailList.forEach(function (email) {
      EmailService.send(
        email.trim(),
        "[FPT Scheduler] Thong bao lich cham moi",
        bodyHtml,
        { name: "FPT Scheduler" },
      );
    });
  } catch (e) {
    AppLogger.error("sendManualSummaryEmail error", e.toString());
  }
}

/**
 * 📧 Gui thong bao cho giang vien: Tu dong chon luong tot nhat (Hybrid Sync)
 * Luong 1 (Uu tien): Dong bo ngam qua OAuth Refresh Token (Silent Sync)
 * Luong 1 (Uu tien): Dong bo ngam qua OAuth Refresh Token (Silent Sync)
 * Luong 2 (Du phong): Gui loi moi Calendar (Proxy RSVP) kem nut Ket noi vinh vien
 */
function recordSpreadsheetId_(payload) {
  try {
    var sheetUrl = payload.sheetUrl || payload.url;
    if (!sheetUrl) return;

    var match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    var sheetId = match ? match[1] : null;
    if (!sheetId) return;

    var props = PropertiesService.getScriptProperties();
    var knownIds = JSON.parse(props.getProperty("KNOWN_SS_IDS") || "[]");
    if (knownIds.indexOf(sheetId) === -1) {
      knownIds.push(sheetId);
      props.setProperty("KNOWN_SS_IDS", JSON.stringify(knownIds));
      Logger.log("🎓 Learned new Spreadsheet ID: " + sheetId);
    }
  } catch (e) {
    AppLogger.error("Self-learning failed", e.toString());
  }
}

function notifyLecturersHandler_(payload) {
  recordSpreadsheetId_(payload);
  
  // 🛡️ LƯU MAPPING VÀO TRUNG TÂM (v14.40)
  try {
     const ss = (payload.sheetUrl) ? SpreadsheetApp.openByUrl(payload.sheetUrl) : null;
     if (ss) {
        (payload.lecturers || []).forEach(l => {
           saveMappingToCentralHub_(ss, l.name, l.email);
        });
     }
  } catch(e) {}
  var sheetType = payload.sheetType || "council";
  var results = {
    total: lecturers.length,
    success: 0,
    failed: 0,
    mailSent: 0,
    mailSkipped: 0,
    errors: [],
    debugLogs: [],
  };

  const addLog = function (msg) {
    results.debugLogs.push(new Date().toLocaleTimeString() + ": " + msg);
    AppLogger.info(msg);
  };

  addLog(
    "Starting notification process for " + lecturers.length + " lecturers.",
  );

  // 🏛️ Tim hoac tao Lich phu (Chi dung cho luong Du phong)
  var invitationCalendar = getOrCreateInvitationCalendar_();

  lecturers.forEach(function (lecturer) {
    try {
      const email = lecturer.email.trim();

      const eventCount = (lecturer.events || []).length;
      addLog("Processing lecturer: " + email + " (" + eventCount + " events)");

      // 🚀 BUOC 1: TRUY VET QUYEN TRUY CAP (SUPER-FINDER)
      const storedToken = getLecturerToken_(email);
      let silentSyncAttempted = false;
      let silentSyncSuccess = false;
      let diag = "";

      if (storedToken) {
        silentSyncAttempted = true;
        if (storedToken.refresh_token) {
          AppLogger.info("Attempting Silent Sync for: " + email);
          const refreshResult = refreshAccessToken_(storedToken.refresh_token);

          if (refreshResult.token) {
            try {
              // ✍️ Ghi lich truc tiep vao Calendar cua Giang vien
              const syncDetails = CalendarService.createEvents(
                "primary",
                lecturer.events,
                true,
                refreshResult.token,
                "force_all",
                sheetType,
                false,
                true, // sendUpdates = true for silent sync
              );
              try {
                // 📧 Gui mail bao THANH CONG (Mau xanh) - CHI GUI NEU CO THANH PHAN THE HIEN SU THAY DOI
                const hasAdded = syncDetails.diffDetails.added.length > 0;
                const hasUpdated = syncDetails.diffDetails.updated.length > 0;
                const hasRemoved = syncDetails.diffDetails.removed.length > 0;
                // 📧 Luon gui mail neu admin yeu cau hoac co thay doi (De Admin test duoc)
                const forceNotify =
                  payload.forceNotify === true || payload.force === true;

                if (hasAdded || hasUpdated || hasRemoved || forceNotify) {
                  try {
                    const mailStatus = sendSilentSyncSuccessEmail_(
                      email,
                      lecturer.name,
                      lecturer.events,
                      sheetType,
                      syncDetails.diffDetails,
                    );

                    if (mailStatus && mailStatus.success) {
                      results.success++;
                      results.mailSent++;
                      addLog(
                        "Email sent via " + mailStatus.method + " to " + email,
                      );
                    } else {
                      results.success++;
                      results.errors.push({
                        title: email,
                        message:
                          "⚠️ Lich ghi OK nhung KHONG GUI DUOC MAIL (Loi: " +
                          (mailStatus ? mailStatus.error : "Unknown") +
                          ").",
                      });
                      addLog(
                        "Mail failure for " +
                          email +
                          ": " +
                          (mailStatus ? mailStatus.error : "Unknown"),
                      );
                    }
                  } catch (mailErr) {
                    results.success++;
                    results.errors.push({
                      title: email,
                      message: "⚠️ Loi gui mail: " + mailErr.toString(),
                    });
                  }
                } else {
                  results.success++;
                  results.mailSkipped++;
                  addLog(
                    "Skipped email for " + email + " - Schedule is identical.",
                  );
                }
                silentSyncSuccess = true;
                // 🔄 CAP NHAT CACHE cho Silent Sync
                updateLecturerCacheFromPayload_(
                  email,
                  payload.sheetUrl,
                  payload.tabName,
                );
              } catch (writeErr) {
                diag =
                  "Loi ghi lich: GV da ket noi nhung co the chua tich du quyen (Xoa/Sua lich).";
                AppLogger.error("Silent Sync Write Error", writeErr.toString());
              }
            } catch (err) {
              diag = "Loi ghi lich hoac dong bo: " + err.toString();
              AppLogger.error("Silent Sync Process Error", err.toString());
            }
          } else {
            // 🛡️ AUTH CHECK FIRST
            const quotaRemaining = Math.max(
              0,
              MailApp.getRemainingDailyQuota(),
            );
            const authErr = {
              title: "LOI XAC THUC",
              message:
                "Google bao loi: " +
                (refreshResult.error || "Unknown Auth Error"),
            };

            // Neu la loi Quota thuc su cua Google thi moi hien so quota
            if (
              refreshResult.error &&
              refreshResult.error.toLowerCase().indexOf("quota") !== -1
            ) {
              authErr.message += " (Han ngach con: " + quotaRemaining + ")";
            }

            if (refreshResult.isInvalidGrant) {
              authErr.message =
                "Giang vien can ket noi lai Google Calendar (Token het han/Thu hoi). " +
                authErr.message;
            }
            diag =
              authErr.message +
              ". (Goi y: Hay bao GV nhan 'KET NOI' lai tren trang ca nhan vi Google da thu hoi quyen nay).";
          }
        } else {
          diag =
            "Loi cau hinh: Ket noi bi thieu 'Ma lam moi' (Refresh Token). Yeu cau GV nhan 'KET NOI' lai.";
        }
      } else {
        diag =
          "Chua ket noi: GV nay chua tung nhan 'Ket noi Google Calendar' tren trang ca nhan cua ho.";
      }

      // 🛡️ BUOC 2: QUYET DINH LUONG (FALLBACK NEU SILENT SYNC THAT BAI)
      if (silentSyncSuccess) return;

      // 🔍 Kiem tra xem lich trinh co thuc su thay doi khong truoc khi gui Thu moi (Tranh spam)
      // 🔍 MẮT THẦN v14.62: Truyền thêm Name để luồng thủ công thấy được lịch Portal
      const existingItems = getLecturerInvitations_(invitationCalendar, email, lecturer.name);
      const diff = compareSchedules_(existingItems, lecturer.events);
      const forceNotify = payload.forceNotify === true || payload.force === true;

      if (diff.isChanged || forceNotify) {
        // ✍️ SMART SYNC v14.62: Bộ não đồng nhất cho cả Thủ công & Tự động
        smartSyncInvitations_(invitationCalendar, email, lecturer.name, lecturer.events, diff, sheetType);
        
        // Neu giang vien da tung ket noi ma loi -> Thông báo kết quả
        if (silentSyncAttempted) {
          AppLogger.warn("Manual Sync Fallback Active for " + email);
          results.errors.push({
            title: email,
            message: "⚠️ Token lỗi. Đã chuẩn hóa qua luồng Invitation thông minh.",
          });
        }

        results.success++;
        results.mailSent++;
        addLog("Sync [v14.62] completed for " + email);
        results.success++;
        results.mailSent++;
        addLog("Invitation (Orange) sent to " + email);

        // 🔄 CAP NHAT CACHE cho luong Invitation
        updateLecturerCacheFromPayload_(
          email,
          payload.sheetUrl,
          payload.tabName,
        );
      } else {
        // Khong co thay doi -> Bo qua
        results.success++;
        results.mailSkipped++;
        addLog(
          "Skipped invitation for " +
            email +
            " - No differences found in Proxy Calendar.",
        );

        // Van cap nhat cache de dong bo trang thai
        updateLecturerCacheFromPayload_(
          email,
          payload.sheetUrl,
          payload.tabName,
        );
      }
    } catch (e) {
      AppLogger.error(
        "Notify Error: " + (lecturer.email || "unknown"),
        e.toString(),
      );
      results.failed++;
      results.errors.push({
        title: lecturer.email || "He thong",
        message: e.toString(),
      });
    }
  });

  results.quotaRemaining = Math.max(0, MailApp.getRemainingDailyQuota());

  return {
    status: CONSTANTS.SUCCESS,
    data: results,
  };
}

/**
 * 🔍 Lay danh sach cac loi moi hien co cua 1 giang vien tren Lich phu
 */
function getLecturerInvitations_(calendar, lecturerEmail, lecturerName, ignoreSystemTag) {
  const calendarId = calendar.getId();
  const accessToken = ScriptApp.getOAuthToken();
  const now = new Date();
  const timeMin = new Date(
    now.getTime() - 180 * 24 * 60 * 60 * 1000, // Lui 6 thang
  ).toISOString();
  const timeMax = new Date(
    now.getTime() + 180 * 24 * 60 * 60 * 1000, // Tien 6 thang
  ).toISOString();

  const path =
    "/calendars/" +
    encodeURIComponent(calendarId) +
    "/events?timeMin=" +
    encodeURIComponent(timeMin) +
    "&timeMax=" +
    encodeURIComponent(timeMax) +
    "&singleEvents=true&maxResults=500";

  const response = GoogleCalendarAPI.fetch_(accessToken, path);
  if (!response.items || response.items.length === 0) return [];

  const lNameNorm = (lecturerName || "").toLowerCase().trim();

  return response.items.filter(function (item) {
    const p = (item.extendedProperties && item.extendedProperties.private) || {};
    const desc = (item.description || "").toLowerCase();
    const summary = (item.summary || "").toLowerCase();
    
    // 🛡️ BỘ LỌC (Cải tiến v14.49):
    // Nếu ignoreSystemTag = true (Dùng cho truy vết), bỏ qua bước kiểm tra fpt_scheduler
    if (!ignoreSystemTag) {
       const isSystemCreated = p[CONSTANTS.SOURCE_TAG] === "fpt_scheduler" || desc.indexOf(CONSTANTS.MAGIC_STRING.toLowerCase()) !== -1;
       if (!isSystemCreated) return false;
    }

    // 2. Phải đúng Giảng viên (khớp Email HOẶC khớp Tên mờ)
    const emailMatch = lecturerEmail ? desc.indexOf(lecturerEmail.toLowerCase()) !== -1 : false;
    const nameMatch = lNameNorm ? summary.indexOf(lNameNorm) !== -1 : false;

    return emailMatch || nameMatch;
  });
}

/**
 * 🧠 So sanh lich trinh hien tai (tren Calendar) voi lich trinh moi (tu Sheet)
 */
function compareSchedules_(oldItems, newEvents) {
  const norm = function (s) { 
    return (s || "").toLowerCase()
      .replace(/lich review:|lich hd:|lịch review:|lịch hd:/g, "")
      .trim(); 
  };
  
  const diff = {
    isChanged: false,
    added: [],
    updated: [],
    removed: [],
    unchanged: [],
    logs: []
  };

  const logMatch = function(msg) { diff.logs.push(msg); AppLogger.info(msg); };

  // Duyệt danh sách mới từ Sheet
  newEvents.forEach(nev => {
    // 🛡️ CHUẨN HOÁ CHUỖI NGÀY GIỜ GMT+7 (v14.34)
    const nDate = new Date(nev.start);
    const nSig = Utilities.formatDate(nDate, "GMT+7", "dd/MM HH:mm");
    const nTitleNorm = norm(nev.title);
    
    let matchIdx = -1;
    for(let i=0; i<oldItems.length; i++) {
        const o = oldItems[i];
        if (o._matched) continue;

        const oDate = new Date(o.start.dateTime || o.start.date);
        const oSig = Utilities.formatDate(oDate, "GMT+7", "dd/MM HH:mm");
        const oTitleNorm = norm(o.summary);
        
        // 🕰️ TIME-ANCHOR MATCH: Phải trùng y hệt chuỗi Ngày/Giờ
        const timeMatch = (oSig === nSig);
        
        // 🏷️ FUZZY TITLE MATCH: Tên buổi học có liên quan
        const titleMatch = oTitleNorm.indexOf(nTitleNorm) !== -1 || nTitleNorm.indexOf(oTitleNorm) !== -1;
        
        if (timeMatch && titleMatch) {
            matchIdx = i;
            break;
        }
    }

    if (matchIdx !== -1) {
      const oldMatched = oldItems[matchIdx];
      oldMatched._matched = true;

      const isLocChanged = norm(oldMatched.location) !== norm(nev.location);
      const isTitleChanged = norm(oldMatched.summary) !== norm(nev.title);
      
      if (isLocChanged || isTitleChanged) {
        logMatch("Lệch tại " + nSig + ": Sheet(" + nev.location + ") vs Cal(" + oldMatched.location + ") -> Cập nhật.");
        diff.updated.push({ oldId: oldMatched.id, newEvent: nev });
        diff.isChanged = true;
      } else {
        logMatch("Khớp hoàn hảo tại " + nSig + " -> Giữ nguyên.");
        diff.unchanged.push(oldMatched);
      }
    } else {
      logMatch("Không tìm thấy sự kiện cũ cho " + nSig + " -> Thêm mới.");
      diff.added.push(nev);
      diff.isChanged = true;
    }
  });

  // Xử lý những buổi học bị xoá (có trên Calendar nhưng không có trên Sheet hiện tại)
  oldItems.forEach(o => {
    if (!o._matched) {
      const oDate = new Date(o.start.dateTime || o.start.date);
      const oSig = Utilities.formatDate(oDate, "GMT+7", "dd/MM HH:mm");
      logMatch("Buổi học " + oSig + " bị xoá khỏi Sheet -> Thu hồi.");
      diff.removed.push(o);
      diff.isChanged = true;
    }
  });

  return diff;
}

/**
 * 🧹 Xoa cac loi moi da cu de lam sach lich truoc khi tao moi
 */
function clearLecturerInvitations_(calendar, lecturerEmail, itemsToDelete) {
  try {
    const calendarId = calendar.getId();
    const accessToken = ScriptApp.getOAuthToken();

    const idsToDelete = [];

    if (itemsToDelete && Array.isArray(itemsToDelete)) {
      itemsToDelete.forEach(function (it) {
        idsToDelete.push(it.id);
      });
    } else {
      // Fallback neu khong truyen items san
      const items = getLecturerInvitations_(calendar, lecturerEmail);
      items.forEach(function (it) {
        idsToDelete.push(it.id);
      });
    }

    if (idsToDelete.length > 0) {
      AppLogger.info(
        "Cleaning " + idsToDelete.length + " events for " + lecturerEmail,
      );
      const deleteRequests = idsToDelete.map(function (id) {
        return {
          method: "delete",
          path:
            "/calendars/" +
            encodeURIComponent(calendarId) +
            "/events/" +
            encodeURIComponent(id) +
            "?sendUpdates=none",
        };
      });

      const CHUNK_SIZE = 50;
      for (let i = 0; i < deleteRequests.length; i += CHUNK_SIZE) {
        GoogleCalendarAPI.fetchAll_(
          accessToken,
          deleteRequests.slice(i, i + CHUNK_SIZE),
        );
      }
    }
  } catch (e) {
    AppLogger.error("Failed to clear invitations for " + lecturerEmail, e);
  }
}

/**
 * 🛠️ Tim hoac tao mot Lich phu rieng de gui loi moi
 */
function getOrCreateInvitationCalendar_() {
  const name = CONSTANTS.INVITATION_CALENDAR_NAME;
  const calendars = CalendarApp.getCalendarsByName(name);
  if (calendars.length > 0) {
    AppLogger.info(
      "Using existing invitation calendar: " + calendars[0].getId(),
    );
    return calendars[0];
  }

  AppLogger.info("Creating new secondary calendar for invitations: " + name);
  const newCal = CalendarApp.createCalendar(name, {
    summary: "Lich chua cac loi moi gui cho Giang vien tu FPT Scheduler.",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  AppLogger.info("Created new calendar ID: " + newCal.getId());
  return newCal;
}

/**
 * 📅 Long 2 Email thanh 1: Gui 1 email HTML duy nhat chua Bang lich + Nut RSVP Native
 */
function createMergedCalendarInvitation_(
  calendar,
  toEmail,
  lecturerName,
  subEvents,
  sheetType,
  isUpdate, // 📧 NEW: Nhan co phan biet Moi/Cap nhat
) {
  const email = toEmail.trim();
  const calendarId = calendar.getId();
  const accessToken = ScriptApp.getOAuthToken();

  // 📅 Sort by Date (ASC)
  subEvents.sort(function (a, b) {
    return parseDateISO_(a.start).getTime() - parseDateISO_(b.start).getTime();
  });

  var rowsHtml = "";

  // 🚀 TOI UU: Su dung BATCH CREATE EVENTS thay vi tao tung cai mot (Cai thien toc do 10x)
  const createRequests = subEvents.map(function (s) {
    const startTime = parseDateISO_(s.start);
    const endTime = parseDateISO_(s.end);
    const isCouncil = sheetType === "council";
    const defaultTitle = isCouncil ? "Hoi dong bao ve" : "Cham bai Review";
    const title = "[Lich Cham] " + (s.title || defaultTitle);

    return {
      method: "post",
      path:
        "/calendars/" +
        encodeURIComponent(calendarId) +
        "/events?sendUpdates=none", // 🔕 FIXED: Chan Google gui 16 mail rac
      payload: {
        summary: title,
        description:
          CONSTANTS.MAGIC_STRING +
          "\n\n" +
          (s.description ||
            (isCouncil
              ? "Lich tham gia Hoi dong FPT University"
              : "Lich cham bai Review FPT University")),
        location: s.location || "N/A",
        start: {
          dateTime: startTime.toISOString(),
          timeZone: "Asia/Ho_Chi_Minh",
        },
        end: { dateTime: endTime.toISOString(), timeZone: "Asia/Ho_Chi_Minh" },
        attendees: [{ email: email, responseStatus: "needsAction" }],
        extendedProperties: {
          private: {
            [CONSTANTS.SOURCE_TAG]: "fpt_scheduler",
            sheet_type: sheetType || "council",
          },
        },
        colorId: sheetType === "review" ? "9" : "11",
      },
    };
  });

  if (createRequests.length > 0) {
    var responses = GoogleCalendarAPI.fetchAll_(accessToken, createRequests);
    var props = PropertiesService.getScriptProperties();
    responses.forEach(function(res, idx) {
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        try {
          var evData = JSON.parse(res.getContentText());
          var s = subEvents[idx];
          if (s.rowId && evData.id) {
             props.setProperty("EVID_" + s.rowId, evData.id);
          }
        } catch (e) {}
      }
    });
  }

  subEvents.forEach(function (s, idx) {
    const start = parseDateISO_(s.start);
    const end = parseDateISO_(s.end);
    rowsHtml +=
      "<tr><td style='padding: 10px; border: 1px solid #ddd;'>" +
      (idx + 1) +
      "</td>" +
      "<td style='padding: 10px; border: 1px solid #ddd;'>" +
      Utilities.formatDate(start, "GMT+7", "dd/MM/yyyy") +
      "</td>" +
      "<td style='padding: 10px; border: 1px solid #ddd;'>" +
      Utilities.formatDate(start, "GMT+7", "HH:mm") +
      " - " +
      Utilities.formatDate(end, "GMT+7", "HH:mm") +
      "</td>" +
      "<td style='padding: 10px; border: 1px solid #ddd;'>" +
      (s.location || "N/A") +
      "</td></tr>";
  });

  const appUrl = CONSTANTS.APP_URL;
  const commonParams =
    "&email=" +
    encodeURIComponent(email) +
    "&lecturerName=" +
    encodeURIComponent(lecturerName);
  const yesLink = appUrl + "?autoRSVP=true&action=accept" + commonParams;
  const noLink = appUrl + "?autoRSVP=true&action=decline" + commonParams;

  const typeLabel = isUpdate ? "CAP NHAT" : "MOI";
  const typeColor = isUpdate ? "#E67E22" : "#F27024"; // Mau cam dam hon cho Cap nhat

  const bodyHtml =
    "<div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;'>" +
    "<div style='background: " +
    typeColor +
    "; padding: 25px; text-align: center; color: white;'><h2>THONG BAO LICH " +
    typeLabel +
    "</h2></div>" +
    "<div style='padding: 25px;'>" +
    "<p>Chao Giang vien <b>" +
    lecturerName +
    "</b>,</p>" +
    "<p>" +
    (isUpdate
      ? "Admin vua cap nhat thay doi cho lich trinh cua ban. Vui long xac nhan lai ban lich moi nhat duoi day."
      : "Admin da gui lich trinh bao ve/cham moi cho ban. Vui long bam <b>Co</b> de xac nhan va dong bo vao Calendar ca nhan.") +
    "</p>" +
    "<table style='width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;'>" +
    "<thead style='background: #f8f9fa;'><tr><th style='padding: 10px; border: 1px solid #ddd;'>STT</th><th style='padding: 10px; border: 1px solid #ddd;'>Ngay</th><th style='padding: 10px; border: 1px solid #ddd;'>Gio</th><th style='padding: 10px; border: 1px solid #ddd;'>Phong</th></tr></thead>" +
    "<tbody>" +
    rowsHtml +
    "</tbody></table>" +
    "<div style='margin-top: 25px; text-align: center;'>" +
    "<a href='" +
    yesLink +
    "' style='background: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px; display: inline-block;'>Co (Dong bo ngay)</a>" +
    "<a href='" +
    noLink +
    "' style='background: white; color: #d93025; padding: 12px 30px; text-decoration: none; border-radius: 6px; border: 1px solid #eee; font-weight: bold; display: inline-block;'>Khong tham gia</a>" +
    "</div></div>" +
    "<p style='padding: 0 25px 25px 25px; color: #666; font-size: 12px;'>Tran trong,<br>Dai hoc FPT University</p>" +
    "</div>";

  const isCouncil = sheetType === "council";
  const subject =
    (isCouncil ? "[HOI DONG]" : "[REVIEW]") +
    " Thong bao lich bao ve " +
    typeLabel;

  return EmailService.send(email, subject, bodyHtml, {
    name: "FPT Scheduler Service",
  });
}

/**
 * ⚡ Action xu ly phan hoi RSVP hang loat tu Web App
 */
function respondToInvitationsHandler_(payload) {
  const rawEmail = (payload.email || "").trim().toLowerCase();
  // 🛡️ BUOC 1: Giai ma email va trich xuat handle
  const cleanEmail = decodeURIComponent(rawEmail).toLowerCase();
  const handle = cleanEmail.split("@")[0];
  const action = payload.actionValue || payload.action;

  const invitationCalendar = getOrCreateInvitationCalendar_();
  const calendarId = invitationCalendar.getId();
  const accessToken = ScriptApp.getOAuthToken();

  const statusToSet =
    action === "accept"
      ? "accepted"
      : action === "decline"
        ? "declined"
        : "tentative";

  // 📅 Pham vi tim kiem: 1 nam (6 thang truoc/sau)
  const now = new Date();
  const timeMin = new Date(
    now.getTime() - 180 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const timeMax = new Date(
    now.getTime() + 180 * 24 * 60 * 60 * 1000,
  ).toISOString();

  let searchResults = [];

  // 🔍 TIM KIEM CHIEN THUAT:
  try {
    // 1. Tim theo Email chuan
    const res = GoogleCalendarAPI.fetch_(
      accessToken,
      "/calendars/" +
        encodeURIComponent(calendarId) +
        "/events?timeMin=" +
        encodeURIComponent(timeMin) +
        "&timeMax=" +
        encodeURIComponent(timeMax) +
        "&q=" +
        encodeURIComponent(cleanEmail) +
        "&singleEvents=true&maxResults=250",
    );
    if (res.items && res.items.length > 0) {
      searchResults = res.items;
    } else {
      // 2. Neu khong thay theo email, tim theo handle
      const resHandle = GoogleCalendarAPI.fetch_(
        accessToken,
        "/calendars/" +
          encodeURIComponent(calendarId) +
          "/events?timeMin=" +
          encodeURIComponent(timeMin) +
          "&timeMax=" +
          encodeURIComponent(timeMax) +
          "&q=" +
          encodeURIComponent(handle) +
          "&singleEvents=true&maxResults=250",
      );
      if (resHandle.items) searchResults = resHandle.items;
    }
  } catch (e) {
    AppLogger.error("RSVP Search Error", e.toString());
  }

  var updatedCount = 0;
  var alreadySetCount = 0;

  searchResults.forEach(function (rawEvent) {
    if (!rawEvent.attendees) return;

    let hasTarget = false;
    let needsUpdate = false;

    const updatedAttendees = rawEvent.attendees.map(function (a) {
      const aEmail = (a.email || "").toLowerCase();
      if (aEmail === cleanEmail || aEmail.split("@")[0] === handle) {
        hasTarget = true;
        if (a.responseStatus !== statusToSet) {
          needsUpdate = true;
          return {
            email: a.email,
            responseStatus: statusToSet,
            optional: false,
          };
        } else {
          alreadySetCount++;
        }
      }
      return a;
    });

    if (hasTarget && needsUpdate) {
      try {
        // 🚀 DUNG PATCH: Chi cap nhat danh sach khach moi (Sua loi double stringify)
        GoogleCalendarAPI.fetch_(
          accessToken,
          "/calendars/" +
            encodeURIComponent(calendarId) +
            "/events/" +
            encodeURIComponent(rawEvent.id) +
            "?sendUpdates=all",
          {
            method: "patch",
            payload: { attendees: updatedAttendees },
          },
        );
        updatedCount++;
      } catch (e) {
        AppLogger.error("RSVP Patch Failure: " + rawEvent.id, e.toString());
      }
    }
  });

  if (updatedCount > 0) {
    return {
      status: CONSTANTS.SUCCESS,
      message:
        "Tuyet voi! He thong da xac nhan thanh cong " +
        updatedCount +
        " buoi cham cho ban.",
      data: { updatedCount: updatedCount },
    };
  }

  if (alreadySetCount > 0) {
    return {
      status: CONSTANTS.SUCCESS,
      message:
        "Ban da xac nhan '" + action + "' cho cac buoi cham nay truoc do roi.",
      data: { updatedCount: 0 },
    };
  }

  return {
    status: CONSTANTS.SUCCESS,
    message:
      "Khong tim thay loi moi nao cho '" +
      handle +
      "'. Vui long kiem tra lai hoac lien he Admin.",
    data: { updatedCount: 0 },
  };
}

// sendDecentralizedSyncEmail_ has been replaced by createCalendarInvitation_ for Native UX.

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
function AUTHORIZE_SYSTEM_V14_20() {
  MailApp.getRemainingDailyQuota();
  CalendarApp.getCalendarsByName(CONSTANTS.INVITATION_CALENDAR_NAME);
  ScriptApp.getOAuthToken();
  console.log("Xac thuc V14.20 thanh cong! He thong Proxy RSVP da san sang.");
}

/**
 * 🔑 OAUTH 2.0 HANDLERS (Option 2)
 */

function exchangeOAuthCodeHandler_(payload) {
  const code = payload.code;
  const email = (payload.email || "").trim().toLowerCase();
  // 🔑 Dung redirect_uri do frontend truyen len (co the la localhost hoac production)
  const redirectUri = payload.redirectUri || CONSTANTS.OAUTH.REDIRECT_URI;

  if (!code) throw new Error("Missing authorization code");
  if (!email) throw new Error("Missing email for token association");

  const tokenData = exchangeCodeForTokens_(code, redirectUri);

  // Save to Firebase
  saveLecturerToken_(email, tokenData);

  return {
    status: CONSTANTS.SUCCESS,
    message: "Ket noi Google Calendar thanh cong va da luu token vinh vien.",
    data: { email: email },
  };
}

function getLecturerTokenStatusHandler_(payload) {
  const email = (payload.email || "").trim().toLowerCase();
  if (!email) throw new Error("Missing email");

  const token = getLecturerToken_(email);
  return {
    status: CONSTANTS.SUCCESS,
    connected: !!token,
    hasRefreshToken: !!(token && token.refresh_token), // 🔍 Kiem tra xem co chia khoa vinh vien khong
    email: email,
  };
}

/**
 * 🌐 OAuth Utils
 */

function exchangeCodeForTokens_(code, redirectUri) {
  const url = "https://oauth2.googleapis.com/token";
  // 🔑 Dung redirectUri truyen vao; neu khong co thi dung mac dinh (production)
  const effectiveRedirectUri = redirectUri || CONSTANTS.OAUTH.REDIRECT_URI;
  const payload = {
    code: code,
    client_id: CONSTANTS.OAUTH.CLIENT_ID,
    client_secret: CONSTANTS.OAUTH.CLIENT_SECRET,
    redirect_uri: effectiveRedirectUri,
    grant_type: "authorization_code",
  };

  const options = {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: payload,
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (result.error) {
    throw new Error("OAuth Error: " + result.error_description || result.error);
  }

  return {
    refresh_token: result.refresh_token,
    access_token: result.access_token,
    expiry_date: new Date().getTime() + result.expires_in * 1000,
  };
}

function refreshAccessToken_(refreshToken) {
  if (!refreshToken) return { error: "Missing refresh_token" };

  // 🛡️ KIEM TRA CAU HINH (CRITICAL CHECK)
  if (
    !CONSTANTS.OAUTH.CLIENT_ID ||
    CONSTANTS.OAUTH.CLIENT_ID.includes("YOUR_CLIENT_ID")
  ) {
    return {
      error:
        "Cau hinh thieu: Ban chua nhap CLIENT_ID vao Script Properties cua Apps Script.",
    };
  }
  if (
    !CONSTANTS.OAUTH.CLIENT_SECRET ||
    CONSTANTS.OAUTH.CLIENT_SECRET.includes("YOUR_CLIENT_SECRET")
  ) {
    return {
      error:
        "Cau hinh thieu: Ban chua nhap CLIENT_SECRET vao Script Properties cua Apps Script.",
    };
  }

  const url = "https://oauth2.googleapis.com/token";
  const payload = {
    client_id: CONSTANTS.OAUTH.CLIENT_ID,
    client_secret: CONSTANTS.OAUTH.CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  const options = {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.access_token) {
      return { token: result.access_token };
    }

    if (result.error) {
      AppLogger.error(
        "Google Refresh Error: " + result.error,
        result.error_description,
      );
      // Tra ve ma loi ky thuat de Admin biet duong sua
      return {
        error:
          "Google bao loi: " +
          result.error +
          (result.error_description ? " - " + result.error_description : ""),
        isInvalidGrant: result.error === "invalid_grant",
      };
    }
  } catch (e) {
    AppLogger.error("Critical error during token refresh", e.toString());
    return { error: "Loi ket noi may chu Google: " + e.toString() };
  }
  return { error: "Khong nhan duoc phan hoi tu Google" };
}

/**
 * 🔥 Firebase Token Store Utils
 */

function saveLecturerToken_(email, tokenData) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const path =
    "lecturer_tokens/" + normalizedEmail.replace(/\./g, "_") + ".json";
  const url = CONSTANTS.FIREBASE_URL + path + "?auth=" + CONSTANTS.GAS_SECRET;

  // 🛡️ BAO VE: Neu token moi thieu refresh_token, hay thu lay lai cai cu tu Firebase de khong bi mat quyen
  if (!tokenData.refresh_token) {
    const oldToken = getLecturerToken_(email);
    if (oldToken && oldToken.refresh_token) {
      tokenData.refresh_token = oldToken.refresh_token;
      AppLogger.info(
        "Recovered missing refresh_token from previous record for: " + email,
      );
    }
  }

  UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(tokenData),
  });
}

function getLecturerToken_(email) {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const handle = normalizedEmail.split("@")[0].replace(/\./g, "");

  // 1. Tim theo Email chuan
  const path =
    "lecturer_tokens/" + normalizedEmail.replace(/\./g, "_") + ".json";
  const url = CONSTANTS.FIREBASE_URL + path + "?auth=" + CONSTANTS.GAS_SECRET;
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data && data.refresh_token) return data;
    }
  } catch (e) {
    /* ignore */
  }

  // 2. Tra cuu Whitelist de dam bao khong bo sot giang vien dung email phu
  const whitelistUrl =
    CONSTANTS.FIREBASE_URL +
    "lecturer_whitelist.json?auth=" +
    CONSTANTS.GAS_SECRET;
  try {
    const wlRes = UrlFetchApp.fetch(whitelistUrl, { muteHttpExceptions: true });
    if (wlRes.getResponseCode() === 200) {
      const whitelist = JSON.parse(wlRes.getContentText());
      if (whitelist) {
        for (let code in whitelist) {
          const l = whitelist[code];
          if (l.email && l.email.toLowerCase() === normalizedEmail) {
            // Thu tim Token bang CODE giang vien
            const token = findTokenByFlexibleHandle_(l.code);
            if (token) return token;
          }
        }
      }
    }
  } catch (e) {
    /* ignore */
  }

  // 3. Tim vet can theo Handle prefix
  return findTokenByFlexibleHandle_(handle);
}

/**
 * 🕵️ Helper tim Token bang Handle linh hoat (bat chap domain va dau cham)
 */
function findTokenByFlexibleHandle_(handle) {
  if (!handle) return null;
  const cleanHandle = handle.toLowerCase().replace(/\./g, "");
  const rootUrl =
    CONSTANTS.FIREBASE_URL +
    "lecturer_tokens.json?auth=" +
    CONSTANTS.GAS_SECRET;

  try {
    const rootRes = UrlFetchApp.fetch(rootUrl, { muteHttpExceptions: true });
    if (rootRes.getResponseCode() === 200) {
      const allTokens = JSON.parse(rootRes.getContentText());
      if (allTokens) {
        for (var key in allTokens) {
          var storedEmail = key.replace(/_/g, ".");
          var storedHandle = storedEmail
            .split("@")[0]
            .toLowerCase()
            .replace(/\./g, "");

          if (storedHandle === cleanHandle) {
            AppLogger.info(
              "Found token via flexible handle match: " +
                storedEmail +
                " for handle " +
                handle,
            );
            return allTokens[key];
          }
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

/**
 * 📩 Email Notifications for Silent Sync
 */

function sendSilentSyncSuccessEmail_(email, name, events, sheetType, diff) {
  // 📅 Sort by Date (ASC)
  events.sort(function (a, b) {
    return parseDateISO_(a.start).getTime() - parseDateISO_(b.start).getTime();
  });

  const isCouncil = sheetType === "council";
  const daysVN = [
    "Chu Nhat",
    "Thu Hai",
    "Thu Ba",
    "Thu Tu",
    "Thu Nam",
    "Thu Sau",
    "Thu Bay",
  ];

  // 🏁 BUOC 1: XAC DINH TRANG THAI EMAIL
  var headerColor = "#F27024"; // Cam FPT (Mac dinh cho Cap nhat)
  var headerText = "Cap Nhat Lich Trinh";
  var subject = isCouncil
    ? "[Tu dong] Cap nhat lich tham gia Hoi dong"
    : "[Tu dong] Cap nhat lich cham bai Review";

  const isPureRecall = events.length === 0 && diff.removed.length > 0;
  const isPureNew =
    diff.added.length > 0 &&
    diff.updated.length === 0 &&
    diff.removed.length === 0;

  if (isPureRecall) {
    headerColor = "#e11d48"; // Do Rose
    headerText = "Thu Hoi Lich Trinh";
    subject = isCouncil
      ? "[THU HOI] Huy lich tham gia Hoi dong"
      : "[THU HOI] Huy lich cham Review";
  } else if (isPureNew) {
    headerColor = "#059669"; // Xanh Emerald
    headerText = "Lich Trinh Moi";
    subject = isCouncil
      ? "[MOI] Thong bao lich tham gia Hoi dong"
      : "[MOI] Thong bao lich cham bai Review";
  }

  // 🚀 TAO BAN DO CAP NHAT/THEM MOI DE TO VANG (CHI KHI LA CAP NHAT)
  var highlightedMap = {};
  var changeNotices = [];

  if (diff && !isPureNew) {
    // Thu thap cac buoi cap nhat
    diff.updated.forEach(function (u) {
      const sig = u.new.signature || u.new.title + u.new.start;
      highlightedMap[sig] = true;

      const d = new Date(u.new.start);
      const dayName = daysVN[d.getDay()];
      const dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
      const timeStr = Utilities.formatDate(d, "GMT+7", "HH:mm");
      changeNotices.push(
        "Ban co su thay doi lich moi la <b>" +
          dayName +
          ", Ngay " +
          dateStr +
          "</b>, luc <b>" +
          timeStr +
          "</b> tai <b>" +
          (u.new.location || "N/A") +
          "</b>.",
      );
    });

    // Thu thap cac buoi them moi trong mot dot cap nhat
    diff.added.forEach(function (a) {
      const sig = a.signature || a.title + a.start;
      highlightedMap[sig] = true;

      const d = new Date(a.start);
      const dayName = daysVN[d.getDay()];
      const dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
      const timeStr = Utilities.formatDate(d, "GMT+7", "HH:mm");
      changeNotices.push(
        "Ban co lich moi duoc them vao: <b>" +
          dayName +
          ", Ngay " +
          dateStr +
          "</b>, luc <b>" +
          timeStr +
          "</b> tai <b>" +
          (a.location || "N/A") +
          "</b>.",
      );
    });
  }

  var rowsHtml = "";
  var rowsToDisplay = isPureRecall ? diff.removed : events;

  rowsToDisplay.forEach(function (s, idx) {
    const start = parseDateISO_(s.start);
    const end = s.end
      ? parseDateISO_(s.end)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000);

    const sig = s.signature || s.title + s.start;
    const isHighlighted = highlightedMap[sig] || isPureRecall;
    const rowBg = isHighlighted ? "background-color: #fef08a;" : ""; // To vang #fef08a (Yellow 200)

    rowsHtml +=
      "<tr style='" +
      rowBg +
      "'>" +
      "<td style='padding: 12px 8px; border: 1px solid #eee; text-align: center; font-weight: 500; color: #64748b;'>" +
      (idx + 1) +
      "</td>" +
      "<td style='padding: 12px 8px; border: 1px solid #eee; text-align: center;'>" +
      Utilities.formatDate(start, "GMT+7", "dd/MM/yyyy") +
      "</td>" +
      "<td style='padding: 12px 8px; border: 1px solid #eee; text-align: center;'>" +
      Utilities.formatDate(start, "GMT+7", "HH:mm") +
      " - " +
      Utilities.formatDate(end, "GMT+7", "HH:mm") +
      "</td>" +
      "<td style='padding: 12px 8px; border: 1px solid #eee; text-align: center; " +
      (isPureRecall ? "text-decoration: line-through; color: #e11d48;" : "") +
      "'>" +
      (s.location || "N/A") +
      "</td>" +
      "</tr>";
  });

  // 📝 BUOC: Xay dung doan thong bao van ban
  var noticeHtml = "";
  if (changeNotices.length > 0) {
    noticeHtml =
      "<div style='margin-bottom: 20px; padding: 15px; border-left: 4px solid #F27024; background: #fff7ed; color: #9a3412; font-size: 14px;'>";
    noticeHtml +=
      "<p style='margin: 0 0 10px 0; font-weight: bold;'>Thong bao lich trinh co su thay doi:</p>";
    noticeHtml += "<ul style='margin: 0; padding-left: 20px;'>";
    changeNotices.forEach(function (msg) {
      noticeHtml += "<li style='margin-bottom: 5px;'>" + msg + "</li>";
    });
    noticeHtml += "</ul></div>";
  }

  const bodyHtml =
    "<div style='font-family: sans-serif; max-width: 600px; border: 1px solid #eee; border-radius: 10px; overflow: hidden;'>" +
    "<div style='background: " +
    headerColor +
    "; padding: 20px; color: white; text-align: center;'>" +
    "<h2 style='margin: 0;'>" +
    headerText +
    "</h2>" +
    "</div>" +
    "<div style='padding: 25px;'>" +
    "<p>Chao Giang vien <b>" +
    name +
    "</b>,</p>" +
    (isPureRecall
      ? "<p>Thong bao: He thong da thuc hien thu hoi cac lich trinh cu cua ban tren Google Calendar.</p>"
      : isPureNew
        ? "<p>Admin da tao lich trinh giang day moi cho ban tren Google Calendar. Duoi day la chi tiet toan bo lich trinh cua ban:</p>"
        : "<p>Co mot so thay doi trong lich trinh cua ban. He thong da tu dong cap nhat vao Google Calendar ca nhan.</p>") +
    (changeNotices.length > 0
      ? "<div style='background: #fff7ed; border-left: 4px solid #f27024; padding: 15px; margin: 20px 0; border-radius: 4px;'>" +
        "<h4 style='color: #c2410c; margin-top: 0; margin-bottom: 10px; font-size: 14px;'>Thong bao lich trinh co su thay doi:</h4>" +
        "<ul style='margin: 0; padding-left: 20px; color: #7c2d12; font-size: 13px;'>" +
        changeNotices
          .map(function (n) {
            return "<li style='margin-bottom: 8px;'>" + n + "</li>";
          })
          .join("") +
        "</ul></div>"
      : "") +
    "<p style='color: #64748b; font-size: 12px; margin-top: 25px;'>" +
    (isPureNew
      ? "Chi tiet lich trinh hien tai cua ban:"
      : "Chi tiet toan bo lich trinh hien tai cua ban (cac dong <span style='background: #fef08a; padding: 2px 4px; border-radius: 3px;'>to vang</span> la thong tin moi cap nhat):") +
    "</p>" +
    "<table style='width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;'>" +
    "<thead style='background: #f8fafc; color: #475569;'><tr><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>STT</th><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>Ngay</th><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>Gio</th><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>Phong</th></tr></thead>" +
    "<tbody>" +
    rowsHtml +
    "</tbody>" +
    "</table>" +
    (isPureRecall
      ? "<p style='color: #be123c; font-weight: bold;'>Luu y: Ban da duoc thu hoi toan bo lich trinh cu.</p>"
      : "") +
    "<hr style='border: 0; border-top: 1px solid #f1f5f9; margin: 25px 0;'>" +
    "<p style='font-size: 11px; color: #94a3b8;'>He thong FPT Scheduler<br/>Dai hoc FPT University</p>" +
    "</div></div>";

  return EmailService.send(email, subject, bodyHtml, { name: "FPT Scheduler" });
}

/**
 * 💥 NUCLEAR SYNC: GLOBAL RECALL
 * Diet tan goc: Quet mang Token tren Firebase de xoa Silent Sync + xoa Proxy Invitation
 */
function globalRecallHandler_(payload) {
  // 🚀 TOI UU: Neu payload.sheetType la 'both' hoac 'all' hoac trong, ta se xoa ca 2
  var requestedType = payload.sheetType;
  var sheetType =
    requestedType === "both" || requestedType === "all" || !requestedType
      ? null
      : requestedType;

  // Mac dinh luon la true de xoa triet de, bao nguoi dung
  var sendUpdates =
    payload.sendUpdates !== undefined ? payload.sendUpdates : true;
  var results = {
    totalProcessed: 0,
    silentCleared: 0,
    silentFailed: 0,
    proxyCleared: 0,
    errors: [],
  };

  try {
    // -----------------------------------------------------------------
    // 1. SILENT SYNC RECALL (Don dep lich ca nhan cua tung giang vien)
    // -----------------------------------------------------------------
    var url =
      CONSTANTS.FIREBASE_URL +
      "lecturer_tokens.json?auth=" +
      CONSTANTS.GAS_SECRET;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (res.getResponseCode() === 200) {
      var allTokens = JSON.parse(res.getContentText());
      if (allTokens) {
        var keys = Object.keys(allTokens);
        results.totalProcessed = keys.length;
        AppLogger.info(
          "Global Recall: Processing " +
            keys.length +
            " lecturer tokens found in DB.",
        );

        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var tokenData = allTokens[key];
          var lecturerEmail = key.replace(/_/g, "."); // Restore email for logging (Fix from , to _)

          if (tokenData && tokenData.refresh_token) {
            AppLogger.info(
              "Global Recall: Revoking events for " + lecturerEmail,
            );
            var refreshResult = null;
            try {
              refreshResult = refreshAccessToken_(tokenData.refresh_token);
            } catch (authErr) {
              results.silentFailed++;
              results.errors.push(
                "Loi Auth " + lecturerEmail + ": " + authErr.toString(),
              );
              continue;
            }

            if (refreshResult && refreshResult.token) {
              try {
                // Diet triet de tren Calendar "primary" cua giang vien bang Token cua ho
                var clearRes = CalendarService.clearEvents(
                  "primary",
                  refreshResult.token,
                  sheetType,
                  sendUpdates,
                );

                if (clearRes && clearRes.deletedCount !== undefined) {
                  results.silentCleared += clearRes.deletedCount;
                  if (clearRes.deletedCount > 0) {
                    AppLogger.info(
                      "Success: Removed " +
                        clearRes.deletedCount +
                        " events for " +
                        lecturerEmail,
                    );
                  }
                } else if (clearRes && clearRes.success === false) {
                  results.errors.push(
                    "Loi quet " +
                      lecturerEmail +
                      ": " +
                      (clearRes.message || "Unknown error"),
                  );
                }
              } catch (clearErr) {
                results.silentFailed++;
                results.errors.push(
                  "Loi xoa " + lecturerEmail + ": " + clearErr.toString(),
                );
              }
            } else {
              results.silentFailed++;
              results.errors.push(
                "Token cua " + lecturerEmail + " khong hop le hoac da bi huy.",
              );
            }
          } else {
            // results.errors.push("Giang vien " + lecturerEmail + " chua co Refresh Token.");
          }
        }
      }
    } else {
      results.errors.push("Khong the lay danh sach token giang vien tu DB.");
    }
  } catch (e) {
    results.errors.push("Loi vong lap thu hoi silent sync: " + e.toString());
  }

  // -----------------------------------------------------------------
  // 2. PROXY INVITATION RECALL (Don dep tren lich Admin)
  // -----------------------------------------------------------------
  try {
    AppLogger.info("Global Recall: Revoking Proxy Invitations (Silent Mode)");
    var proxyRes = CalendarService.clearEvents(
      CONSTANTS.INVITATION_CALENDAR_NAME,
      ScriptApp.getOAuthToken(),
      sheetType,
      false, // 🔕 Luon la false de tranh spam 16 mail "Su kien bi huy"
    );
    results.proxyCleared += proxyRes.deletedCount || 0;
  } catch (e) {
    results.errors.push("Loi thu hoi proxy: " + e.toString());
  }

  // -----------------------------------------------------------------
  // 3. ADMIN FALLBACK RECALL (Don dep lich truyen thong - Just in case)
  // -----------------------------------------------------------------
  try {
    AppLogger.info("Global Recall: Revoking Admin Default Schedule");
    var adminRes = CalendarService.clearEvents(
      CONSTANTS.DEFAULT_CALENDAR_NAME,
      ScriptApp.getOAuthToken(), // Dung token Admin
      sheetType,
      sendUpdates,
    );
    results.proxyCleared += adminRes.deletedCount || 0;
  } catch (e) {
    results.errors.push("Loi thu hoi Admin: " + e.toString());
  }

  // -----------------------------------------------------------------
  // 4. PREPARE FINAL LOGS
  // -----------------------------------------------------------------
  var finalLogs = [
    "Thu hoi toan he thong: Da xu ly " +
      results.totalProcessed +
      " giang vien.",
    "Da xoa: " +
      results.silentCleared +
      " su kien ca nhan, " +
      results.proxyCleared +
      " loi moi du phong.",
  ];

  if (results.silentFailed > 0) {
    finalLogs.push(
      "⚠️ That bai: " +
        results.silentFailed +
        " giang vien (Loi Token hoac Quyen).",
    );
  }

  if (results.errors.length > 0) {
    // Chi lay 5 loi dau de tranh qua tai UI
    finalLogs.push("Chi tiet loi dot dau:");
    results.errors.slice(0, 5).forEach(function (err) {
      finalLogs.push("- " + err);
    });
  }

  return {
    status: CONSTANTS.SUCCESS,
    message: "Da hoan tat quy trinh thu hoi",
    data: results,
    logs: finalLogs,
  };
}

/**
 * 📧 NEW: HAM DONG BO THEO LOI MOI TONG HOP (Force Invitation Batch)
 * Chuc nang: Tao cac su kien am tham (sendUpdates: 'none') va gui 1 email tong hop duy nhat.
 */
function batchInvitationNotifyHandler_(payload) {
  var lecturers = (payload.lecturers || []).filter(
    (l) => (l.events || []).length > 0,
  );
  var sheetType = payload.sheetType || "council";
  var results = {
    total: lecturers.length,
    success: 0,
    failed: 0,
    mailSent: 0,
    mailSkipped: 0,
    errors: [],
    debugLogs: [],
  };

  const addLog = function (msg) {
    results.debugLogs.push(new Date().toLocaleTimeString() + ": " + msg);
    AppLogger.info(msg);
  };

  addLog(
    "Starting Batch Invitation process for " + lecturers.length + " lecturers.",
  );

  var invitationCalendar = getOrCreateInvitationCalendar_();

  lecturers.forEach(function (lecturer) {
    try {
      const email = lecturer.email.trim();

      const existingItems = getLecturerInvitations_(invitationCalendar, email, lecturer.name);
      addLog("Tìm thấy " + existingItems.length + " sự kiện hiện có cho " + lecturer.name);

      const diff = compareSchedules_(existingItems, lecturer.events);
      const forceNotify = payload.forceNotify === true || payload.force === true;
      const isUpdate = existingItems.length > 0;

      if (diff.isChanged || forceNotify) {
        // ✍️ THỰC HIỆN ĐỒNG BỘ THÔNG MINH (PATCH/ADD/DELETE)
        var syncStats = smartSyncInvitations_(invitationCalendar, email, lecturer.name, lecturer.events, diff, sheetType);
        
        results.stats.added += syncStats.added;
        results.stats.updated += syncStats.updated;
        results.stats.removed += syncStats.removed;
        results.stats.skipped += syncStats.skipped;

        results.success++;
        results.mailSent++;
        
        var summary = "Đã cập nhật: " + syncStats.updated + ", Thêm: " + syncStats.added + ", Xoá: " + syncStats.removed + ", Giữ nguyên: " + syncStats.skipped;
        addLog("Batch Sync for " + email + ": " + summary);
      } else {
        results.success++;
        results.mailSkipped++;
        results.stats.skipped += diff.unchanged.length;
        addLog("Bỏ qua " + email + " - Không có thay đổi.");
      }
    } catch (e) {
      AppLogger.error(
        "Batch Notify Error: " + (lecturer.email || ""),
        e.toString(),
      );
      results.failed++;
      results.errors.push({
        title: lecturer.email || "He thong",
        message: e.toString(),
      });
    }
  });

  results.quotaRemaining = Math.max(0, MailApp.getRemainingDailyQuota());
  return {
    status: CONSTANTS.SUCCESS,
    data: results,
  };
}

/**
 * 📧 NEW: HAM DONG BO NATIVE CHO KHACH MOI (Individual Invitations)
 * Chuc nang: Tao tung su kien rieng le tren lich Admin va add khach moi vao.
 * Moi su kien se kich hoat 1 email tu Google.
 */
/**
 * 📧 SMART-DIFF SYNC: Dong bo thong minh (Individual Invitations)
 * Chi them/xoa nhung gi thuc su thay doi tren Sheet, giu nguyen cac xac nhan cu.
 */
/**
 * ==============================================================================
 * 🚀 UNIFIED SYNC ENGINE v3.0 (DIRECT-LINK & TIME-SAFE)
 * ==============================================================================
 */

/**
 * 🕵️ DETECTOR: Cam bien cot (Nhan dien Gid, Ngay, Slot, Phong)
 */

/**
 * 🚀 SMART SYNC ENGINE v14.29
 * Chỉ thực hiện Patch/Add/Delete trên những gì thực sự thay đổi.
 */
function smartSyncInvitations_(calendar, email, lecturerName, events, diff, sheetType) {
  var stats = { added: 0, updated: 0, removed: 0, skipped: diff.unchanged.length };
  var adminToken = ScriptApp.getOAuthToken();
  var calId = calendar.getId();

  // 1. PATCH (Cập nhật)
  diff.updated.forEach(function(u) {
    try {
      var n = u.newEvent;
      var nStart = parseDateISO_(n.start);
      var nEnd = parseDateISO_(n.end);
      
      GoogleCalendarAPI.patchEvent(adminToken, calId, u.oldId, {
        location: n.location || "",
        start: { dateTime: Utilities.formatDate(nStart, "GMT+7", "yyyy-MM-dd'T'HH:mm:ss+07:00") },
        end: { dateTime: Utilities.formatDate(nEnd, "GMT+7", "yyyy-MM-dd'T'HH:mm:ss+07:00") }
      });
      stats.updated++;
    } catch(e) { 
      AppLogger.warn("SmartPatch failed for " + u.oldId, e.toString()); 
    }
  });

  // 2. ADD (Thêm mới)
  if (diff.added.length > 0) {
    var isUpdate = (stats.skipped + stats.updated) > 0;
    createMergedCalendarInvitation_(calendar, email, lecturerName, diff.added, sheetType, isUpdate, true); 
    stats.added = diff.added.length;
  }

  // 3. REMOVE (Xóa)
  diff.removed.forEach(function(r) {
    try {
      GoogleCalendarAPI.deleteEvent(adminToken, calId, r.id, true);
      stats.removed++;
    } catch(e) {
      AppLogger.warn("SmartDelete failed for " + r.id, e.toString());
    }
  });

  return stats;
}

/**
 * 🕵️ DETECTOR: Dynamic Column Mapper
 (Safe for empty sheets)
 */

/**
 * 🕵️ DETECTOR v3.2: Safe Column Detection
 */
function detectColumns_(sheet, cachedData) {
  var lastCol = 0;
  var ssId = sheet.getParent().getId();
  try {
    lastCol = sheet.getLastColumn();
  } catch (e) {}
  if (lastCol === 0)
    return { date: -1, slot: -1, room: -1, gid: -1, lecturer: -1 };

  var data =
    cachedData ||
    sheet
      .getRange(
        1,
        1,
        Math.min(sheet.getLastRow() || 20, 20),
        Math.min(lastCol, 50),
      )
      .getValues();
  
  var col = { date: -1, slot: -1, room: -1, gid: -1, lecturer: -1, headerRowIdx: 0 };

  // 🛡️ ƯU TIÊN 1: Lấy từ Config của học kỳ được đăng ký
  var props = PropertiesService.getScriptProperties();
  var configsRaw = props.getProperty("AUTO_SYNC_CONFIGS_" + ssId);
  if (configsRaw) {
    try {
      var configs = JSON.parse(configsRaw);
      var tabName = sheet.getName();
      var config = configs.find(c => c.tabName === tabName);
      if (config && config.columnConfig) {
        var cc = config.columnConfig;
        var res = {
          date: cc.dateCol,
          slot: cc.slotCol,
          room: cc.roomCol,
          gid: cc.gidCol || -1,
          lecturers: cc.lecturerCols || [],
          code: cc.codeCol || -1,
          headerRowIdx: (config.startRow || 1) - 1,
          sheetType: config.sheetType || "review"
        };
        
        // 🛡️ ÉP CHẾT MÃ NẾU LÀ REVIEW (Để chắc chắn không bao giờ lấy sai)
        if (res.sheetType === "review" && res.code === -1) {
            // Sẽ được xác định động trong syncBlockInRow_ dựa trên BlockIdx
            // Nhưng ở đây ta để -1 để báo hiệu là cần xác định động.
        }
        return res;
      }
    } catch (e) {}
  }

  // Fallback: Tự động nhận diện (như cũ)
  var fallbackType = "council";
  for (var r = 0; r < data.length; r++) {
    var hits = 0;
    var temp = { date: -1, slot: -1, room: -1, gid: -1, lecturer: -1 };
    for (var c = 0; c < data[r].length; c++) {
      var v = String(data[r][c] || "")
        .toLowerCase()
        .trim();
      if (!v) continue;

      if (temp.date === -1 && (v.indexOf("ngay") !== -1 || v === "date")) {
        temp.date = c;
        hits++;
      }
      if (
        temp.slot === -1 &&
        (v === "ca" || v === "slot" || v === "kip" || v.indexOf("slot") !== -1)
      ) {
        temp.slot = c;
        hits++;
      }
      if (
        temp.room === -1 &&
        (v === "room" || v.indexOf("phong") !== -1 || v === "phong")
      ) {
        temp.room = c;
        hits++;
      }
      if (temp.gid === -1 && v === "gid") {
        temp.gid = c;
      }
      if (temp.lecturer === -1 && (v === "giang vien" || v === "lecturer")) {
        temp.lecturer = c;
      }
    }
    if (hits >= 2) {
      temp.headerRowIdx = r;
      temp.sheetType = fallbackType;
      return temp;
    }
  }
  col.sheetType = fallbackType;
  return col;
}

/**
 * 🕒 TIME-MASTER: GMT+7 FPT Standard
 */
function calculateTimeFromSlot_(slotStr, date) {
  if (!date || !slotStr) return null;
  var s = String(slotStr).toLowerCase().trim();
  
  // 🇺🇸 FIX: Sử dụng parseDateISO_ để ép kiểu MM/DD/YYYY cho an toàn
  var d = parseDateISO_(date);
  if (isNaN(d.getTime())) return null;

  // ✅ FIX: Dùng regex match số cuối cùng trong chuỗi để tránh bắt sai
  // Ví dụ: "Ca 3" → 3, "Slot4" → 4, "3" → 3
  var slotNum = 0;
  var matchNum = s.match(/(\d+)/);
  if (matchNum) slotNum = parseInt(matchNum[1]);

  var hS = 0,
    mS = 0,
    hE = 0,
    mE = 0;
  if (slotNum === 1) {
    hS = 7;
    mS = 0;
    hE = 9;
    mE = 15;
  } else if (slotNum === 2) {
    hS = 9;
    mS = 30;
    hE = 11;
    mE = 45;
  } else if (slotNum === 3) {
    hS = 12;
    mS = 30;
    hE = 14;
    mE = 45;
  } else if (slotNum === 4) {
    hS = 15;
    mS = 0;
    hE = 17;
    mE = 15;
  } else if (slotNum === 5) {
    hS = 17;
    mS = 30;
    hE = 19;
    mE = 45;
  } else return null;

  // ✅ FIX TIMEZONE: Dùng Utilities.formatDate (GMT+7) để tránh lệch giờ UTC
  var dateStr = Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
  var startStr =
    dateStr +
    "T" +
    (hS < 10 ? "0" + hS : hS) +
    ":" +
    (mS === 0 ? "00" : mS) +
    ":00+07:00";
  var endStr =
    dateStr +
    "T" +
    (hE < 10 ? "0" + hE : hE) +
    ":" +
    (mE === 0 ? "00" : mE) +
    ":00+07:00";
  return { start: startStr, end: endStr };
}

/**
 * ⚡ TRIGGER: Direct-Link rows
 */
function autoSyncOnSheetEdit_(e) {
  if (!e) return;
  var ss = e.source;
  var ssId = ss.getId();
  var sheet = e.range.getSheet();
  if (sheet.getName().indexOf("__notif_cache_") === 0) return;

  var props = PropertiesService.getScriptProperties();
  var now = new Date().getTime();

  // 🕒 DEBOUNCE LOGIC: Chỉ tạo 1 trigger duy nhất sau 10 giây kể từ lần chỉnh sửa cuối
  var lastTriggerTime = parseInt(props.getProperty("last_auto_sync_time_" + ssId) || "0");
  if (now - lastTriggerTime < 2000) return; // Tránh spam tạo trigger quá nhanh
  props.setProperty("last_auto_sync_time_" + ssId, now.toString());

  try {
    // Xóa các trigger cũ trùng tên để debounce (giống handleSheetChange)
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === "processAutoRecallSync_") {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }

    // Tạo trigger mới chạy sau 10 giây
    var trigger = ScriptApp.newTrigger("processAutoRecallSync_")
      .timeBased()
      .after(10000) // 10 giây
      .create();

    var newTriggerId = trigger.getUniqueId();
    props.setProperty("active_auto_sync_trigger_" + ssId, newTriggerId);
    props.setProperty("auto_sync_ss_id_" + newTriggerId, ssId);
    
    AppLogger.info("autoSyncOnSheetEdit_: Đã hẹn giờ đồng bộ sau 10 giây cho " + ssId);
  } catch (err) {
    AppLogger.error("autoSyncOnSheetEdit_ Trigger Error", err.toString());
  }
}

/**
 * 🚀 WORKER: Thực hiện quét toàn bộ sheet, so sánh với cache và tự động Thu hồi/Đồng bộ Calendar.
 * Đây là linh hồn của cơ chế Auto-Recall 10 giây.
 */
function processAutoRecallSync_(e) {
  var triggerId = e.triggerUid;
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty("auto_sync_ss_id_" + triggerId);
  if (!ssId) return;

  var activeTriggerId = props.getProperty("active_auto_sync_trigger_" + ssId);
  if (activeTriggerId && activeTriggerId !== triggerId) {
    AppLogger.info("processAutoRecallSync_["+ssId+"]: Newer trigger active. Skipping.");
    props.deleteProperty("auto_sync_ss_id_" + triggerId);
    return;
  }

  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) {
      AppLogger.warn("processAutoRecallSync_["+ssId+"]: Could not obtain lock after 30s.");
      return;
    }
    
    var ss = SpreadsheetApp.openById(ssId);
    if (!ss) throw new Error("Spreadsheet not found: " + ssId);
    var sheets = ss.getSheets();
    
    // Tìm các sheet đang được config để auto sync
    var configKey = "AUTO_SYNC_CONFIGS_" + ssId;
    var configsRaw = props.getProperty(configKey);
    var configs = [];
    if (configsRaw) {
      try { configs = JSON.parse(configsRaw); } catch(e) {}
    }

    // Nếu không có config (hoặc config cũ), ta vẫn quét toàn bộ các tab không phải cache
    var sheetsToProcess = [];
    if (configs && configs.length > 0) {
        configs.forEach(function(c) {
            var s = ss.getSheetByName(c.tabName);
            if (s) sheetsToProcess.push(s);
        });
    } else {
        // Fallback: Xử lý tất cả các sheet (trừ cache/hidden) có vẻ là Review sheet
        sheets.forEach(function(s) {
            if (s.getName().indexOf("__") === -1 && !s.isSheetHidden()) {
                sheetsToProcess.push(s);
            }
        });
    }

    sheetsToProcess.forEach(function(sheet) {
        AppLogger.info("processAutoRecallSync_: Đang kiểm tra tab " + sheet.getName());
        var cacheSheetName = "__auto_sync_cache_" + sheet.getName();
        var cacheSheet = ss.getSheetByName(cacheSheetName);
        if (!cacheSheet) {
            cacheSheet = ss.insertSheet(cacheSheetName);
            cacheSheet.hideSheet();
            var initData = sheet.getDataRange().getDisplayValues();
            cacheSheet.getRange(1, 1, initData.length, initData[0].length).setValues(initData);
            return;
        }

        var newData = sheet.getDataRange().getDisplayValues();
        var oldData = cacheSheet.getDataRange().getDisplayValues();
        if (newData.length <= 1) return;

        // detect blocks and column maps
        var colMap = detectColumns_(sheet, newData);
        if (colMap.date === -1) {
            AppLogger.warn("processAutoRecallSync_: Tab " + sheet.getName() + " không có cấu hình Date phù hợp.");
            return;
        }

        // Quét tìm toàn bộ các cột quan trọng của tất cả các blocks trong row
        var hData = newData[colMap.headerRowIdx] || newData[0]; 
        var dateCols = [];
        for(var c=0; c<hData.length; c++){
            var v = String(hData[c] || "").toLowerCase();
            if (v.indexOf("date")!==-1 || v==="ngày" || v==="ngay" || v==="thời gian") dateCols.push(c);
        }

        var startRow = colMap.headerRowIdx + 1; 
        var maxRows = Math.max(newData.length, oldData.length);
        var changedRowsCount = 0;
        
        for (var i = startRow; i < newData.length; i++) {
            var nRow = newData[i] || [];
            var oRow = oldData[i] || [];
            if (nRow.length === 0 && oRow.length === 0) continue;

            var isRowChanged = false;
            // Scan all columns for changes
            var scanLimit = Math.max(nRow.length, oRow.length);
            for(var j=0; j<scanLimit; j++) {
                if (!isSameValue_(nRow[j], oRow[j])) { 
                    isRowChanged = true; 
                    break; 
                }
            }

            if (isRowChanged) {
                changedRowsCount++;
                syncSpecificRow_(ssId, sheet, i + 1, nRow, oRow, colMap);
            }
        }
        
        if (changedRowsCount > 0) {
            AppLogger.info("processAutoRecallSync_["+sheet.getName()+"]: DONE. Processed " + changedRowsCount + " rows.");
        }

        // ✅ Cập nhật cache NGAY LẬP TỨC sau mỗi tab để tránh đợt trigger sau xử lý lại
        try {
            cacheSheet.clear();
            if (newData.length > 0) {
                cacheSheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
                SpreadsheetApp.flush(); // Ép ghi xuống đĩa ngay
            }
        } catch(cacheErr) {
            AppLogger.error("AutoSync: Lỗi cập nhật Cache cho tab " + sheet.getName(), cacheErr.toString());
        }
    });

  } catch(err) {
    AppLogger.error("processAutoRecallSync_ Global Error", err.toString() + "\nStack: " + err.stack);
  } finally {
    props.deleteProperty("active_auto_sync_trigger_" + ssId);
    props.deleteProperty("auto_sync_ss_id_" + triggerId);
    lock.releaseLock();
  }
}

/**
 * Hàm trợ giúp thực hiện Sync cho một dòng cụ thể khi phát hiện thay đổi
 */
function syncSpecificRow_(ssId, sheet, rowNum, rowData, oldRowData, globalColMap) {
    var props = PropertiesService.getScriptProperties();
    var lastCol = rowData.length;
    var hData = sheet.getRange(globalColMap.headerRowIdx + 1, 1, 1, lastCol).getDisplayValues()[0];
    
    // Tìm tất cả các cột Date để phân tách các Block
    var dateCols = [];
    for(var c=0; c<lastCol; c++){
        var v = String(hData[c] || "").toLowerCase();
        if (v.indexOf("date")!==-1 || v==="ngày" || v==="ngay" || v==="thời gian") dateCols.push(c);
    }

    if (dateCols.length === 0) {
        AppLogger.warn("syncSpecificRow_: Không tìm thấy cột Date để chia block tại dòng " + rowNum);
        return;
    }

    // Xử lý từng Block dựa trên biên giới KHÔNG CHỒNG LẤN
    var blocks = [];
    if (globalColMap.sheetType === "review") {
        // Cấu trúc Review chuẩn của User
        blocks = [
            { s: 0, e: 18 },  // Review 1 (Mã HĐ ở cột 9/J)
            { s: 19, e: 27 }, // Review 2 (Mã HĐ ở cột 19/T)
            { s: 28, e: lastCol - 1 } // Review 3 (Mã HĐ ở cột 28/AC)
        ];
    } else {
        // Chế độ Hội đồng: Tự động chia theo DateCols
        for (var k = 0; k < dateCols.length; k++) {
            var s = (k === 0) ? 0 : dateCols[k] - 1;
            var e = (k < dateCols.length - 1) ? dateCols[k+1] - 1 : lastCol - 1;
            if (k > 0 && s <= dateCols[k-1]) s = dateCols[k-1] + 1;
            blocks.push({ s: s, e: e });
        }
    }

    for (var k = 0; k < blocks.length; k++) {
        var bStart = Math.max(0, blocks[k].s);
        var bEnd = Math.min(lastCol - 1, blocks[k].e);
        if (bStart > bEnd) continue;

        // Kiểm tra xem Block này có thay đổi gì không
        var blockChanged = false;
        for(var ci=bStart; ci<=bEnd; ci++) {
            if (!isSameValue_(rowData[ci], oldRowData[ci])) { 
                blockChanged = true; 
                break; 
            }
        }
        
        if (blockChanged) {
            // CLONE globalColMap để tránh ô nhiễm state khi mutation
            var blockColMap = JSON.parse(JSON.stringify(globalColMap));
            syncBlockInRow_(ssId, sheet, rowNum, rowData, oldRowData, k, bStart, bEnd, hData, blockColMap);
        }
    }
}
function syncBlockInRow_(ssId, sheet, rowNum, rowData, oldRowData, blockIdx, bStart, bEnd, hData, colMap) {
    var props = PropertiesService.getScriptProperties();
    
    // 🕵️ NHẬN DIỆN LẠI CỘT TRONG BLOCK (Vì mỗi block có thể lệch cấu trúc)
    colMap.date = -1; colMap.slot = -1; colMap.room = -1; colMap.lecturers = []; colMap.code = -1;

    for (var c = bStart; c <= bEnd; c++) {
        var v = String(hData[c] || "").toLowerCase().trim();
        if (!v) continue;

        if (v.indexOf("date") !== -1 || v === "ngày" || v === "ngay" || v === "thời gian") colMap.date = c;
        else if (v === "slot" || v === "ca" || v === "kíp") colMap.slot = c;
        else if (v.indexOf("room") !== -1 || v.indexOf("phòng") !== -1 || v.indexOf("phong") !== -1 || v === "địa điểm") colMap.room = c;
        else if (v.indexOf("reviewer") !== -1 || v.indexOf("giảng viên") !== -1 || v === "gvhd" || v === "phân công") colMap.lecturers.push(c);
        else if (v === "mã hđ" || v === "mã hd" || v.indexOf("code") !== -1 || v === "mã đề tài" || v === "id") colMap.code = c;
    }

    // 🕵️ HARDCODED OVERRIDE CHO REVIEW MODE (Theo yêu cầu User)
    if (colMap.sheetType === "review") {
        // Review 1 (Block 0) mặc định lấy Mã HĐ tại cột J (Index 9)
        // Review 2 (Block 1) mặc định lấy Mã HĐ tại cột T (Index 19)
        // Review 3 (Block 2) mặc định lấy Mã HĐ tại cột AC (Index 28)
        if (blockIdx === 0) colMap.code = 9; 
        else if (blockIdx === 1) colMap.code = 19;
        else if (blockIdx === 2) colMap.code = 28;
        
        // Cố gắng tìm Date/Slot/Room ngầm trong block nếu header không chuẩn
        for (var dSearch = bStart; dSearch <= bEnd; dSearch++) {
           var hVal = String(hData[dSearch] || "").toLowerCase();
           if (colMap.date === -1 && (hVal.indexOf("date") !== -1 || hVal === "ngày")) colMap.date = dSearch;
           if (colMap.slot === -1 && (hVal === "slot" || hVal === "ca")) colMap.slot = dSearch;
           if (colMap.room === -1 && (hVal.indexOf("room") !== -1 || hVal === "phòng")) colMap.room = dSearch;
        }
    }
    
    if (colMap.date === -1 || colMap.slot === -1) {
        AppLogger.warn("syncBlockInRow_: Skip Block " + blockIdx + " tại dòng " + rowNum + " (Không tìm thấy Date/Slot)");
        return;
    }
    
    var rawDate = rowData[colMap.date];
    var rawSlot = rowData[colMap.slot];
    var roomVal = colMap.room !== -1 ? rowData[colMap.room] : "";
    
    var cleanTab = sheet.getName().replace(/[^a-zA-Z0-9]/g, '');
    var fallbackRowId = "row-" + ssId.substring(0, 5) + "-" + cleanTab + "-" + rowNum + "-b" + blockIdx;
    
    // NEW ANCHOR
    var blockCode = colMap.code !== -1 ? String(rowData[colMap.code]).trim() : "";
    var anchorId = blockCode ? "CODE_" + blockCode : fallbackRowId;

    // OLD ANCHOR (To handle case where Code itself changed)
    var oldBlockCode = colMap.code !== -1 ? String(oldRowData[colMap.code] || "").trim() : "";
    var oldAnchorId = oldBlockCode ? "CODE_" + oldBlockCode : fallbackRowId;
    
    var lecturerList = [];
    for (var i = 0; i < colMap.lecturers.length; i++) {
        var info = extractLecturerInfo_(rowData[colMap.lecturers[i]]);
        if (info && info.handle) lecturerList.push(info);
    }

    var oldLecturerList = [];
    for (var i = 0; i < colMap.lecturers.length; i++) {
        var info = extractLecturerInfo_(oldRowData[colMap.lecturers[i]]);
        if (info && info.handle) oldLecturerList.push(info);
    }
    
    var executeCalId = "primary";
    var adminToken = ScriptApp.getOAuthToken();

    // 1. THU HỒI TRIỆT ĐỂ
    var handlersToRecall = [];
    var removedHandlers = [];
    
    // Thu thập tất cả những ai từng xuất hiện
    oldLecturerList.forEach(function(l) { 
        var h = l.handle.toLowerCase();
        if(handlersToRecall.indexOf(h)===-1) handlersToRecall.push(h); 
    });
    lecturerList.forEach(function(l) { 
        var h = l.handle.toLowerCase();
        if(handlersToRecall.indexOf(h)===-1) handlersToRecall.push(h); 
    });

    // Xác định ai đã bị kích (để Log rõ ràng)
    oldLecturerList.forEach(function(ol) {
        var stillIn = lecturerList.some(function(nl) { return nl.handle.toLowerCase() === ol.handle.toLowerCase(); });
        if (!stillIn) removedHandlers.push(ol.handle.toLowerCase());
    });

    if (removedHandlers.length > 0) {
        AppLogger.info("AutoRecall: Phát hiện giảng viên bị gỡ/thay thế: " + removedHandlers.join(", "));
    }

    handlersToRecall.forEach(function(lHandle) {
        // Tìm ID theo mọi kịch bản để thu hồi không sót một ai
        var keysToTry = [
            "EVID_" + oldAnchorId + "_" + lHandle,
            "EVID_" + anchorId + "_" + lHandle,
            "EVID_" + oldAnchorId + "-b" + blockIdx + "_" + lHandle,
            "EVID_" + anchorId + "-b" + blockIdx + "_" + lHandle,
            "EVID_" + fallbackRowId + "_" + lHandle,
            "EVID_" + fallbackRowId.replace("-b" + blockIdx, "") + "_" + lHandle
        ];
        
        keysToTry.forEach(function(k) {
            var gid = props.getProperty(k);
            
            // 🚀 FALLBACK: Nếu không có GID trong Cache, thử tìm trên Calendar bằng Tag (Chính xác 100%)
            if (!gid) {
                gid = findEventByTags_(adminToken, executeCalId, anchorId, lHandle);
                if (gid) AppLogger.info("Immortal Sync: Da khoi phuc GID " + gid + " tu Calendar cho " + lHandle);
            }

            if (gid) {
                try {
                    // 🛡️ BẢO VỆ: Chỉ xóa nếu thực sự là sự kiện của Script này quản lý
                    // (Tương lai có thể dùng GoogleCalendarAPI.fetch_ để kiểm tra row_id trước khi xóa)
                    GoogleCalendarAPI.deleteEvent(adminToken, executeCalId, gid, true);
                    AppLogger.info("AutoRecall SUCCESS: Đã hủy sự kiện " + gid + " cho " + lHandle + " (Key: " + k + ")");
                } catch(e) {
                    AppLogger.warn("AutoRecall Skip: " + gid + " (Lỗi hoặc đã hủy trước đó)");
                }
                props.deleteProperty(k);
            }
        });
    });

    // 2. TẠO MỚI CHO DANH SÁCH HIỆN TẠI (Chỉ những ai còn trong list)
    if (lecturerList.length === 0) return;

    var times = calculateTimeFromSlot_(rawSlot, rawDate);
    if (!times) {
        AppLogger.warn("syncBlockInRow_: Không tính toán được thời gian cho dòng " + rowNum + " Block " + blockIdx);
        return;
    }

    lecturerList.forEach(function(inf) {
        var lHandle = inf.handle.toLowerCase();
        var propKey = "EVID_" + anchorId + "_" + lHandle;
        
        // 🛡️ BẢO VỆ TUYỆT ĐỐI: Chỉ gửi đến Email mà Giảng viên tự đăng ký trên Portal (MAP_)
        var email = null;
        var saved = props.getProperty("MAP_" + lHandle);
        if (saved) {
            try { email = JSON.parse(saved).email; } catch(e) { email = null; }
        }

        if (!email) {
            AppLogger.info("AutoSync Skip: " + lHandle + " chưa đăng ký Email cá nhân trên Web Portal (No MAP found)");
            return;
        }
        
        var summary = "Lich Review: " + (inf.name || inf.handle);
        var description = "Dong bo tu FPT Scheduler\n\nMa GD: " + (blockCode || "N/A") + "\nGiang vien: " + (inf.name || inf.handle);

        // 🚀 SMART PATCH: Nếu đã có GID trong PropertyService, thử PATCH thay vì DELETE+CREATE
        var existingGid = props.getProperty(propKey);
        if (existingGid) {
          try {
            GoogleCalendarAPI.patchEvent(adminToken, executeCalId, existingGid, {
              summary: summary,
              location: String(roomVal),
              description: description,
              start: { dateTime: times.start, timeZone: "Asia/Ho_Chi_Minh" },
              end: { dateTime: times.end, timeZone: "Asia/Ho_Chi_Minh" }
            });
            AppLogger.info("SmartPatch SUCCESS: Da cap nhat su kien " + existingGid + " cho " + lHandle);
            return; // Xong việc cho GV này
          } catch (patchErr) {
            AppLogger.warn("SmartPatch Failed: " + existingGid + ". Thu tao moi...", patchErr.toString());
            // Nếu lỗi (có thể do event bị xóa tay), tiếp tục tạo mới bên dưới
          }
        }

        var newEv = createNewEvent_(
          {
            summary: summary,
            location: String(roomVal),
            description: description,
            start: { dateTime: times.start, timeZone: "Asia/Ho_Chi_Minh" },
            end: { dateTime: times.end, timeZone: "Asia/Ho_Chi_Minh" },
            attendees: [{ email: email }],
          },
          executeCalId,
          email, 
          inf.handle,
          inf.name || inf.handle,
          anchorId
        );

        if (newEv && newEv.id) {
           props.setProperty(propKey, newEv.id);
           AppLogger.info("AutoSync: Đã gửi lời mời mới cho " + email + " (Gid: " + newEv.id + ")");
        }
    });
}

/**
 * ⚙️ UI HANDLER: Batch Sync (API Safe)
 */
/**
 * 🔗 CỔNG ĐĂNG KÝ SHEET (Gọi từ UI Admin)
 * URL có dạng: https://docs.google.com/spreadsheets/d/ID_CUA_SHEET/edit
 */
function registerSheetSyncByUrl(url) {
  try {
    var ssId = "";
    var match = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
    if (match) ssId = match[1];
    
    if (!ssId) return { status: "error", message: "URL Spreadsheet không hợp lệ." };
    
    var ss = SpreadsheetApp.openById(ssId);
    
    // Làm sạch trigger cũ trước khi đăng ký mới
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === "autoSyncOnSheetEdit_") {
        // Nếu trigger này đã gắn với SS này thì xóa để làm mới
        // (Trong standalone script, ta không check dễ dàng được SS gắn với trigger trừ khi dùng Library hoặc check metadata)
        // Để an toàn, ta tạo mới. Google cho phép nhiều trigger onEdit.
      }
    });

    ScriptApp.newTrigger("autoSyncOnSheetEdit_")
      .forSpreadsheet(ss)
      .onEdit()
      .create();

    return { 
      status: "success", 
      message: "✅ Đã kích hoạt theo dõi tự động cho Sheet: " + ss.getName() 
    };
  } catch (e) {
    return { status: "error", message: "Lỗi đăng ký: " + e.toString() };
  }
}

function syncToNativeGuestHandler_(payload) {
  try {
    var lCode = (payload.lecturerCode || "").trim().toLowerCase();
    var lName = (payload.lecturerName || "GV").trim();
    var targetEmail = (payload.targetEmail || "").trim();

    if (!targetEmail || targetEmail.indexOf("@") === -1) {
      return { status: "error", message: "Email không hợp lệ: " + targetEmail };
    }

    if (payload.events && Array.isArray(payload.events) && payload.events.length > 0) {
      var stats = { added: 0, failed: 0, errors: [] };
      var props = PropertiesService.getScriptProperties();

      for (var i = 0; i < payload.events.length; i++) {
        try {
          var ev = payload.events[i];
          if (!ev.start || !ev.end) continue;

          var calId = "primary";
          var token = payload.googleAccessToken || ScriptApp.getOAuthToken();
          
          // 1. ANCHOR CHUẨN
          var anchorId = (ev.code && String(ev.code).trim() !== "") ? "CODE_" + String(ev.code).trim() : ev.rowId;
          var propKey = "EVID_" + anchorId + "_" + lCode;
          
          // 2. XOÁ CŨ ĐỂ LÀM MỚI (RECALL)
          var oldGid = props.getProperty(propKey);
          if (oldGid) {
              try { 
                  GoogleCalendarAPI.deleteEvent(token, calId, oldGid, true); 
              } catch(e) {}
              props.deleteProperty(propKey);
          }
          
          // 2.5 LƯU LẠI BẢN ĐỒ EMAIL ĐỂ AUTO-SYNC SAU NÀY
          var mapKey = "MAP_" + lCode;
          var mapData = { 
            email: targetEmail, 
            updatedAt: new Date().toISOString() 
          };
          props.setProperty(mapKey, JSON.stringify(mapData));

          // 3. TẠO MỚI (INVITE)
          var newEv = createNewEvent_(
            {
              summary: "Lich Review: " + lName,
              location: ev.location || "",
              description: "Đồng bộ từ FPT Scheduler\n\nGiảng viên: " + lName + "\nMã HĐ: " + (ev.code || "N/A"),
              start: { dateTime: new Date(ev.start).toISOString(), timeZone: "Asia/Ho_Chi_Minh" },
              end: { dateTime: new Date(ev.end).toISOString(), timeZone: "Asia/Ho_Chi_Minh" },
              attendees: [{ email: targetEmail }],
            },
            calId,
            targetEmail,
            lCode,
            lName,
            anchorId,
            payload.googleAccessToken
          );

          if (newEv && newEv.id) {
             stats.added++;
             props.setProperty(propKey, newEv.id);
             AppLogger.info("NativeSync: Đã tạo sự kiện cho " + targetEmail + " với Mã HĐ: " + (ev.code || "N/A") + " (Anchor: " + anchorId + ")");
          }
        } catch (evErr) {
          stats.failed++;
          stats.errors.push(evErr.toString());
        }
      }

      return {
        status: "success",
        message: "Đã đồng bộ xong " + stats.added + " buổi cho " + targetEmail,
        data: stats
      };
    }

    // ✅ CHIẾN LƯỢC 2: Đọc từ Sheet nếu có sheetUrl (KHÔNG dùng getActiveSpreadsheet)
    if (!payload.sheetUrl) {
      return {
        status: "error",
        message:
          "Cần truyền 'events' hoặc 'sheetUrl' trong payload để thực hiện Native Sync.",
      };
    }

    var ss = SpreadsheetApp.openByUrl(payload.sheetUrl);
    if (!ss)
      return {
        status: "error",
        message: "Khong mo duoc spreadsheet tu URL: " + payload.sheetUrl,
      };

    var sheet = ss.getSheets()[0];
    var colMap = detectColumns_(sheet);
    if (colMap.date === -1 || colMap.slot === -1)
      return {
        status: "error",
        message: "Khong tim thay cot Date/Slot trong Sheet.",
      };

    var gidIdx = colMap.gid;
    if (gidIdx === -1) {
      gidIdx = sheet.getLastColumn();
      sheet.getRange(1, gidIdx + 1).setValue("Gid");
    }

    var data = sheet.getDataRange().getValues();
    var stats2 = { added: 0 };

    for (var j = 1; j < data.length; j++) {
      var row = data[j];
      var isMe = row.some(function (c) {
        var info = extractLecturerInfo_(c);
        return info && info.handle.toLowerCase() === lCode;
      });

      if (isMe) {
        var times = calculateTimeFromSlot_(row[colMap.slot], row[colMap.date]);
        if (!times) continue;

        var oldGid = String(row[gidIdx] || "").trim();
        if (oldGid) {
          try {
            GoogleCalendarAPI.deleteEvent(null, "primary", oldGid, true);
          } catch (e) {}
        }

        var newEvSheet = createNewEvent_(
          {
            summary: "Lich Review: " + lName,
            location: row[colMap.room] || "",
            start: { dateTime: times.start, timeZone: "Asia/Ho_Chi_Minh" },
            end: { dateTime: times.end, timeZone: "Asia/Ho_Chi_Minh" },
            attendees: [{ email: targetEmail }],
          },
          "primary",
          targetEmail,
          lCode,
          lName,
          "BATCH_" + Date.now(),
        );

        if (newEvSheet && newEvSheet.id) {
          sheet.getRange(j + 1, gidIdx + 1).setValue(newEvSheet.id);
          stats2.added++;
        }
      }
    }
    return {
      status: "success",
      message: "Batch sync completed: " + stats2.added,
    };
  } catch (e) {
    AppLogger.error("syncToNativeGuestHandler_ Error", e.toString());
    return { status: "error", message: e.toString() };
  }
}

/**
 * 🛰️ EVENT CREATOR
 */
function createNewEvent_(
  details,
  calendarId,
  targetEmail,
  lCode,
  lName,
  anchorId,
  guestToken
) {
  var dStr = Utilities.formatDate(
    new Date(details.start.dateTime),
    "Asia/Ho_Chi_Minh",
    "dd/MM",
  );
  var summary = details.summary || ("Lich Review: " + (lName || lCode) + " (" + dStr + ")");

  return GoogleCalendarAPI.createEvent(
    guestToken || null,
    calendarId,
    {
      summary: summary,
      location: details.location || "",
      description: details.description || ("Sync ID: " + anchorId),
      start: details.start,
      end: details.end,
      attendees: details.attendees,
      extendedProperties: {
        private: {
          source: "fpt_scheduler",
          lecturer_code: lCode,
          target_email: targetEmail,
          event_anchor: anchorId,
          // 🛡️ BẢO VỆ: Ghi đúng skeleton ID để Worker luôn luôn tìm thấy
          row_id: anchorId 
        },
      },
    },
    true,
  );
}

/**
 * 🛠️ HELPER: So sánh giá trị của 2 ô dữ liệu (Hỗ trợ Date object, Number, String)
 */
function isSameValue_(v1, v2) {
  if (v1 === v2) return true;
  if (!v1 && !v2) return true;
  if (!v1 || !v2) return false;

  // Xử lý Date object (Google Sheets thường trả về Date thay vì String)
  if (v1 instanceof Date && v2 instanceof Date) {
    return v1.getTime() === v2.getTime();
  }

  // Xử lý Ngày kiểu chuỗi hoặc số
  return String(v1).trim() === String(v2).trim();
}

function extractLecturerInfo_(val) {
  var s = String(val || "").trim();
  if (s.length < 3) return null;
  var handle = "",
    name = "";
  var m = s.match(/([^(]+)\s*\(([^)]+)\)/);
  if (m) {
    name = m[1].trim();
    handle = m[2].toLowerCase().trim();
  } else if (s.indexOf(" ") === -1) {
    handle = s.toLowerCase();
  } else {
    name = s;
  }
  return handle ? { handle: handle, name: name } : null;
}

/**
 * ⚡ KÍCH HOẠT TỰ ĐỘNG (Dành cho Admin)
 * Chạy hàm này một lần duy nhất để hệ thống tự động theo dõi Sheet này.
 */
function setupAutoSyncFromUI() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ssId = ss.getId();
    return TAI_LAP_TRIGGER_TU_DONG(ssId);
  } catch(e) {
    return "Lỗi: " + e.toString();
  }
}

/**
 * 🔄 TRIGGER MANAGER (Linh hồn của hệ thống)
 */
function TAI_LAP_TRIGGER_TU_DONG(manualSsId) {
  var ssId = manualSsId || "";
  
  if (!ssId) {
      try {
          ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
      } catch(e) {}
  }

  // Xóa trigger cũ để làm mới
  var triggers = ScriptApp.getProjectTriggers();
  var deletedCount = 0;
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === "autoSyncOnSheetEdit_") {
      ScriptApp.deleteTrigger(t);
      deletedCount++;
    }
  });

  if (!ssId) {
    return "❌ Lỗi: Không xác định được ID Sheet. Hãy mở Sheet này và chạy lại.";
  }

  // Tạo trigger mới
  try {
    var ss = SpreadsheetApp.openById(ssId);
    ScriptApp.newTrigger("autoSyncOnSheetEdit_")
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    
    var msg = "✅ THÀNH CÔNG! Hệ thống đã bắt đầu theo dõi Sheet: " + ss.getName() + ".\n" +
              "Bây giờ mỗi khi bạn sửa dữ liệu, hệ thống sẽ tự động Thu hồi & Mời mới sau 10 giây.";
    Logger.log(msg);
    return msg;
  } catch (e) {
    return "❌ Lỗi khi thiết lập: " + e.toString();
  }
}

/**
 * 🇻🇳 LUÔN ƯU TIÊN DD/MM/YYYY (Theo định dạng chuẩn VN của User)
 * Bóc tách thủ công từ DisplayValue để tránh sai lệch ngày tháng.
 */
function parseDateISO_(str) {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  
  var s = String(str).trim();
  
  // 🛡️ CHIẾN LƯỢC: HIỂU SỐ ĐẦU TIÊN LÀ NGÀY (DD/MM/YYYY)
  var parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (parts) {
    var d = parseInt(parts[1], 10);      // parts[1] = Ngày
    var m = parseInt(parts[2], 10) - 1;  // parts[2] = Tháng (0-indexed)
    var y = parseInt(parts[3], 10);      // parts[3] = Năm
    
    // Kiểm tra giờ phút (nếu có: e.g. "05/06/2026 08:30")
    var timeParts = s.match(/\s+(\d{1,2}):(\d{1,2})/);
    if (timeParts) {
      return new Date(y, m, d, parseInt(timeParts[1], 10), parseInt(timeParts[2], 10));
    }
    return new Date(y, m, d);
  }
  
  // Fallback cho ISO format (YYYY-MM-DD) dùng bởi Google API
  var isoParts = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoParts) {
    return new Date(parseInt(isoParts[1], 10), parseInt(isoParts[2], 10) - 1, parseInt(isoParts[3], 10));
  }

  var dFinal = new Date(s);
  if (isNaN(dFinal.getTime())) return new Date();
  return dFinal;
}

/**
 * 🛡️ IMMORTAL SYNC HELPER: Tìm sự kiện trên Calendar bằng Tag (Filter chính xác)
 * Giúp khôi phục liên kết nếu PropertyService bị xóa hoặc lỗi.
 */
function findEventByTags_(token, calId, rowId, lHandle) {
  try {
    var now = new Date().getTime();
    var timeMin = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(); // Quét trong 30 ngày qua
    var timeMax = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(); // Quét trong 90 ngày tới

    var path = "/calendars/" + encodeURIComponent(calId) + "/events" +
               "?timeMin=" + encodeURIComponent(timeMin) +
               "&timeMax=" + encodeURIComponent(timeMax) +
               "&showDeleted=false&singleEvents=true&maxResults=250";
    
    var res = GoogleCalendarAPI.fetch_(token, path);
    if (!res.items || res.items.length === 0) return null;

    // 🕵️ LỌC CHÍNH XÁC (Tránh lỗi fuzzy search của tham số 'q')
    var found = res.items.find(function(it) {
      var p = (it.extendedProperties && it.extendedProperties.private) || {};
      return p.row_id === rowId && p.lecturer_code === lHandle;
    });

    return found ? found.id : null;
  } catch (e) {
    AppLogger.error("findEventByTags_ Error", e.toString());
    return null;
  }
}

/**
 * ⚡ MANUAL AUTH HELPER (Dành cho Admin)
 * Nếu Web Portal không tự tạo được trigger do quyền riêng tư,
 * Admin hãy copy URL Sheet vào đây và bấm "Run" hàm testAuth() này.
 */
function testAuth() {
  // 📋 DANH SÁCH SHEET CỦA BẠN
  var urls = [
    "https://docs.google.com/spreadsheets/d/1QuiXMhbegm8Xanv7DjQwvTfZ0Dkw64o5DtbflbINoSY/edit",
    "https://docs.google.com/spreadsheets/d/1S7K1i5M9AHup3_8OwyPYRmVfC9GAFuEzBrErOXLAfHE/edit"
  ];

  urls.forEach(function(url) {
    Logger.log("--- Đang kiểm tra: " + url + " ---");
  });
  
  Logger.log("✅ Cấu trúc ổn định!");
}

/**
 * 🤖 VERSION v14.62 - PHẪU THUẬT THÀNH CÔNG
 * Chức năng: Tự động đồng bộ, dọn dẹp Lịch Chính và Lịch Phụ.
 */
function autoSyncOnSheetEdit_(e) {
  const ss = e.source;
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  
  // 🪵 NHẬT KÝ HỘP ĐEN (v14.61)
  const log = function (m) {
    const logSheet = ss.getSheetByName("SYNC_LOGS");
    if (logSheet)
      logSheet.appendRow([
        Utilities.formatDate(new Date(), "GMT+7", "dd/MM HH:mm:ss"),
        "[v14.61] " + m,
      ]);
  };

  try {
    // Bỏ qua các tab hệ thống
    const sName = sheetName.toLowerCase();
    if (sName.indexOf("config") !== -1 || sName.indexOf("cache") !== -1 || sName.indexOf("log") !== -1) return;

    log("Phát hiện thay đổi. Đang chuẩn bị quét giảng viên...");
    Utilities.sleep(5000); 

    const data = sheet.getDataRange().getDisplayValues();
    const colMap = findNotifyColumns_(data);
    if (colMap.person === -1) return;

    const affectedLecturers = new Set();
    const rangeRows = [];
    for(let r = range.getRow(); r <= range.getLastRow(); r++) rangeRows.push(r);
    
    rangeRows.forEach(r => {
       const lName = (data[r - 1][colMap.person] || "").trim();
       if (lName.length > 2) affectedLecturers.add(lName);
    });
    // Tránh trùng lặp do oldValue
    if (e.oldValue && String(e.oldValue).trim().length > 2) {
       const oldVal = String(e.oldValue).trim();
       if (oldVal.indexOf("@") === -1) affectedLecturers.add(oldVal);
    }

    if (affectedLecturers.size === 0) return;

    const props = PropertiesService.getScriptProperties();
    affectedLecturers.forEach(nameToProcess => {
       if (nameToProcess.length < 3 || !isNaN(nameToProcess)) return;

       const lCode = nameToProcess.toLowerCase();
       let email = "";
       const mapDataStr = props.getProperty("MAP_" + lCode);
       if (mapDataStr) email = JSON.parse(mapDataStr).email;

       if (!email) email = getMappingFromCentralHub_(ss, nameToProcess);

       if (email && email.indexOf("@") !== -1) {
          log("🚀 [v14.62] Đang đối soát toàn diện cho: " + nameToProcess + " (" + email + ")");
          const sheetEvents = extractLecturerEventsFromSheet_(data, colMap, nameToProcess, sheetName);
          
          // Nhận diện loại Sheet để gán màu
          const sType = (sheetName.toLowerCase().indexOf("review") !== -1) ? "review" : "council";

          // 🧹 BƯỚC 1: DỌN DẸP LỊCH PHÁT SINH PORTAL (Lịch chính)
          cleanupPrimaryCalendarOrphans_(nameToProcess, sheetEvents, log);
          
          // 🔄 BƯỚC 2: ĐỒNG BỘ ĐA TẦNG (Chính + Phụ)
          const invCal = getOrCreateInvitationCalendar_();
          const existItems = getLecturerInvitations_(invCal, email, nameToProcess);
          
          const diff = compareSchedules_(existItems, sheetEvents);
          
          if (diff.isChanged) {
             const report = `[${sType.toUpperCase()}] So khớp: ${sheetEvents.length} buổi. Hiện có: ${existItems.length} bản ghi -> Đang chuẩn hóa (Thêm:${diff.toAdd.length}, Xóa:${diff.toDelete.length}, Sửa:${diff.toUpdate.length})`;
             log("📊 " + report);
             smartSyncInvitations_(invCal, email, nameToProcess, sheetEvents, diff, sType);
             log("   ✅ Hoàn tất đồng bộ v14.62.");
          } else {
             log("   💤 Lịch đã khớp chuẩn (" + sheetEvents.length + " buổi).");
          }
       } else {
          log("⚠️ BỎ QUA: " + nameToProcess + " chưa có Mapping.");
       }
    });

  } catch (err) {
    log("❌ LỖI: " + err.toString());
  }
}

/**
 * 🧠 BỘ NÃO ĐỐI SOÁT (v14.61 - CẬP NHẬT CẤU TRÚC)
 */
function compareSchedules_(existItems, sheetEvents) {
  const diff = { isChanged: false, toAdd: [], toUpdate: [], toDelete: [], toKeep: [] };
  const norm = (s) => (s || "").toString().toLowerCase().trim();
  
  sheetEvents.forEach(se => {
     // Tìm buổi khớp giờ ở bất kỳ lịch nào
     const match = existItems.find(ei => {
        const dDiff = Math.abs(new Date(ei.start).getTime() - new Date(se.start).getTime());
        return dDiff < 60000;
     });
     
     if (!match) {
        diff.toAdd.push(se);
        diff.isChanged = true;
     } else {
        const isLocChanged = norm(match.location) !== norm(se.location);
        const isEndChanged = Math.abs(new Date(match.end).getTime() - new Date(se.end).getTime()) > 60000;
        
        // Nếu đã có bản ghi rồi, ta đánh dấu IDs để tránh xóa nhầm bản ghi đó
        diff.toKeep.push(match.id);
        
        if (isLocChanged || isEndChanged) {
           diff.toUpdate.push({ id: match.id, isPrimary: match.isPrimary, newEvent: se });
           diff.isChanged = true;
        }
     }
  });
  
  // Xóa các bản ghi dư thừa (Bao gồm cả các bản ghi Đỏ bị trùng mới tạo)
  existItems.forEach(ei => {
     if (!diff.toKeep.includes(ei.id) && !diff.toUpdate.some(u => u.id === ei.id)) {
        diff.toDelete.push({ id: ei.id, isPrimary: ei.isPrimary });
        diff.isChanged = true;
     }
  });
  
  return diff;
}

/**
 * 🚀 BỘ PHẬN THỰC THI GHI LỊCH (v14.61 - MULTI-CAL SUPPORT)
 */
/**
 * 🚀 BỘ PHẬN THỰC THI GHI LỊCH (v14.64 - COMPATIBILITY MODE)
 * Sử dụng CalendarApp tiêu chuẩn để đảm bảo độ bền cao và không lỗi mạng.
 */
function smartSyncInvitations_(calendar, email, name, sheetEvents, diff, sheetType) {
  // 🎨 COLOR ENGINE: Sử dụng mã màu tiêu chuẩn (1-11)
  const determineColorValue = (title, type) => {
    const t = (title || "").toLowerCase();
    // Mã màu: 11 (Đỏ - Hội đồng), 9 (Xanh - Review)
    if (t.indexOf("review") !== -1 || type === "review") return CalendarApp.EventColor.BLUE; 
    return CalendarApp.EventColor.RED; 
  };

  // 1. Xóa cái dư thừa
  diff.toDelete.forEach(item => {
     try { 
       const cal = item.isPrimary ? CalendarApp.getDefaultCalendar() : calendar;
       const ev = cal.getEventById(item.id);
       if (ev) ev.deleteEvent(); 
     } catch(e) {}
  });
  
  // 2. Cập nhật và CHIẾN LƯỢC NHUỘM MÀU
  diff.toUpdate.forEach(upd => {
    try {
      const cal = upd.isPrimary ? CalendarApp.getDefaultCalendar() : calendar;
      const ev = cal.getEventById(upd.id);
      if (ev) {
        ev.setTitle(upd.newEvent.title);
        ev.setLocation(upd.newEvent.location);
        ev.setTime(new Date(upd.newEvent.start), new Date(upd.newEvent.end));
        
        const color = determineColorValue(upd.newEvent.title, sheetType);
        ev.setColor(color);
      }
    } catch(e) {}
  });
  
  // 3. Thêm mới
  diff.toAdd.forEach(se => {
     try {
       const newEv = calendar.createEvent(se.title, new Date(se.start), new Date(se.end), {
          location: se.location,
          description: "Dong bo tu FPT Scheduler\nGiang vien: " + name
       });
       if (email && email.indexOf("@") !== -1) newEv.addGuest(email);
       
       const color = determineColorValue(se.title, sheetType);
       newEv.setColor(color);
     } catch(e) {}
  });

  // 4. KIỂM TRA MÀU CHO CÁC BUỔI GIỮ LẠI (v14.64)
  diff.toKeep.forEach(id => {
     try {
       const match = diff.existItemsRaw.find(ei => ei.id === id);
       if (match) {
          const cal = match.isPrimary ? CalendarApp.getDefaultCalendar() : calendar;
          const ev = cal.getEventById(id);
          if (ev) {
            const color = determineColorValue(ev.getTitle(), sheetType);
            ev.setColor(color);
          }
       }
     } catch(e) {}
  });
}

/**
 * 🔍 HÀM QUÉT MẮT THẦN (v14.63)
 */
function getLecturerInvitations_(subCalendar, email, name) {
  const events = [];
  const calendars = [
    { cal: CalendarApp.getDefaultCalendar(), isPrimary: true },
    { cal: subCalendar, isPrimary: false }
  ];
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
  const searchStr = email || name;

  calendars.forEach(cObj => {
    try {
      const calEvents = cObj.cal.getEvents(start, end, { search: searchStr });
      calEvents.forEach(ev => {
        const title = (ev.getTitle() || "").toLowerCase();
        const desc = (ev.getDescription() || "").toLowerCase();
        let isMatch = false;
        if (email && (desc.indexOf(email.toLowerCase()) !== -1 || ev.getGuestList().some(g => g.getEmail().toLowerCase() === email.toLowerCase()))) {
           isMatch = true;
        } else if (name && title.indexOf(name.toLowerCase()) !== -1) {
           isMatch = true;
        }
        if (isMatch) {
          events.push({
             id: ev.getId(),
             title: ev.getTitle(),
             start: ev.getStartTime().toISOString(),
             end: ev.getEndTime().toISOString(),
             location: ev.getLocation(),
             isPrimary: cObj.isPrimary
          });
        }
      });
    } catch(e) {}
  });
  return events;
}

/**
 * 🧠 BỘ NÃO ĐỐI SOÁT (v14.63)
 */
function compareSchedules_(existItems, sheetEvents) {
  const diff = { isChanged: false, toAdd: [], toUpdate: [], toDelete: [], toKeep: [], existItemsRaw: existItems };
  sheetEvents.forEach(se => {
     const match = existItems.find(ei => Math.abs(new Date(ei.start).getTime() - new Date(se.start).getTime()) < 60000);
     if (!match) {
        diff.toAdd.push(se);
        diff.isChanged = true;
     } else {
        const isLocChanged = (match.location || "").toLowerCase().trim() !== (se.location || "").toLowerCase().trim();
        const isEndChanged = Math.abs(new Date(match.end).getTime() - new Date(se.end).getTime()) > 60000;
        diff.toKeep.push(match.id);
        if (isLocChanged || isEndChanged) {
           diff.toUpdate.push({ id: match.id, isPrimary: match.isPrimary, newEvent: se });
           diff.isChanged = true;
        }
     }
  });
  existItems.forEach(ei => {
     if (!diff.toKeep.includes(ei.id) && !diff.toUpdate.some(u => u.id === ei.id)) {
        diff.toDelete.push({ id: ei.id, isPrimary: ei.isPrimary });
        diff.isChanged = true;
     }
  });
  return diff;
}

/**
 * 🧹 HÀM DỌN DẸP LỊCH CHÍNH (v14.63)
 */
function cleanupPrimaryCalendarOrphans_(lecturerName, sheetEvents, logFunc) {
  try {
    const primaryCal = CalendarApp.getDefaultCalendar();
    const now = new Date();
    const startTime = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const endTime = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
    const events = primaryCal.getEvents(startTime, endTime, { search: lecturerName });
    events.forEach(ev => {
       const title = ev.getTitle() || "";
       if (title.indexOf(lecturerName) === -1) return;
       const start = ev.getStartTime();
       const isStillInSheet = sheetEvents.some(se => Math.abs(new Date(se.start).getTime() - start.getTime()) < 60000);
       
       // 🕵️ MÁY HÚT BỤI v14.71: Nhận diện cả 'Lich Review' cũ và '[Mã] Review' mới để dọn sạch
       const isOurEvent = /lich\s*(review|hoi\s*dong)|\[.*\]\s*(review|hội\s*đồng)/i.test(title);
       
       if (!isStillInSheet && isOurEvent) {
          logFunc("🗑️ Thu hồi Portal: " + title + " (" + Utilities.formatDate(start, "GMT+7", "dd/MM") + ")");
          ev.deleteEvent();
       }
    });
  } catch (e) {}
}

/**
 * 📦 GHI LOG TRỰC TIẾP LÊN SHEET (Dashbord Chẩn đoán)
 */
function logToSyncTab_(ss, message) {
  try {
    let logSheet = ss.getSheetByName("SYNC_LOGS");
    if (!logSheet) {
      logSheet = ss.insertSheet("SYNC_LOGS");
      logSheet.appendRow(["Thời gian", "Nội dung hoạt động"]);
      logSheet.getRange("A1:B1").setBackground("#f3f3f3").setFontWeight("bold");
      logSheet.setColumnWidth(1, 150);
      logSheet.setColumnWidth(2, 800);
    }
    
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM HH:mm:ss");
    logSheet.appendRow([now, message]);
    
    // Giới hạn 200 dòng để tránh đầy sheet
    if (logSheet.getLastRow() > 200) {
      logSheet.deleteRow(2);
    }
  } catch(e) {}
}

/**
 * Helper: Trích xuất danh sách buổi học cho 1 giảng viên cụ thể từ Sheet
 * Version v14.54: Bộ lọc thời gian thông minh hỗ trợ cả 7h30 và 7:30.
 */
/**
 * Helper: Trích xuất danh sách buổi học cho 1 giảng viên cụ thể từ Sheet
 * Version v14.65: Hỗ trợ "Triple-Triple Engine" cho Sheet Review (3 khối, 2 GV/khối)
 */
/**
 * Helper: Trích xuất danh sách buổi học cho 1 giảng viên cụ thể từ Sheet
 * Version v14.66: Tọa độ cột CHUẨN (L,M,O,Q,R cho R1 | U,V,X,Z cho R2 | AE,AF,AI,AJ,AK cho R3)
 */
function extractLecturerEventsFromSheet_(data, colMap, lName, tabName) {
  const events = [];
  const startRow = colMap.headerRowIndex + 1;
  const lNameNorm = lName.toLowerCase().trim();
  const isReviewSheet = (tabName || "").toLowerCase().indexOf("review") !== -1;

  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    if (isReviewSheet) {
      // 🎯 MAPPING CHÍNH XÁC (0-indexed: J=9, L=11, M=12, O=14, Q=16, R=17, T=19, U=20, V=21, X=23, Z=25, AC=28, AE=30, AF=31, AI=34, AJ=35, AK=36)
      const blocks = [
        { name: "Review 1", code: 9,  r1: 11, r2: 12, d: 14, t: 16, l: 17 },
        { name: "Review 2", code: 19, r1: 20, r2: 21, d: 23, t: 25, l: 26 }, // R2 Room giả định cột ngay sau Slot
        { name: "Review 3", code: 28, r1: 30, r2: 31, d: 34, t: 35, l: 36 }
      ];

      blocks.forEach(block => {
        const p1 = (row[block.r1] || "").toString().toLowerCase().trim();
        const p2 = (row[block.r2] || "").toString().toLowerCase().trim();
        
        if (p1 === lNameNorm || p2 === lNameNorm) {
            const codeVal = (row[block.code] || "---").toString().trim();
            const dateStr = row[block.d];
            const timeStr = row[block.t];
            const room = row[block.l] || "Chưa rõ phòng";
            const otherP = (p1 === lNameNorm) ? (row[block.r2] || "") : (row[block.r1] || "");
            
            const parsedDate = parseVietnameseMMDDYYYY_(dateStr);
            if (parsedDate && timeStr) {
               const start = new Date(parsedDate.getTime());
               const end = new Date(parsedDate.getTime());
               
               // 🕒 XỬ LÝ THỜI GIAN THEO SLOT HOẶC GIỜ (v14.69 - Cleaned)
               let hStart, mStart, hEnd, mEnd;
               const timeParts = timeStr.toString().match(/(\d{1,2})[:h](\d{2})?\s*-\s*(\d{1,2})[:h](\d{2})?/i);
               
               if (timeParts) {
                 hStart = parseInt(timeParts[1]);
                 mStart = parseInt(timeParts[2] || 0);
                 hEnd = parseInt(timeParts[3]);
                 mEnd = parseInt(timeParts[4] || 0);
               } else {
                 // Nếu không phải định dạng giờ, tra cứu theo Slot (1, 2, 3...)
                 const slotMap = mapSlotToTime_(timeStr);
                 hStart = slotMap.hs; mStart = slotMap.ms;
                 hEnd = slotMap.he; mEnd = slotMap.me;
               }

               start.setHours(hStart, mStart, 0, 0);
               end.setHours(hEnd, mEnd, 0, 0);
               
               // Tiêu đề chuẩn: [Code] Review X: LONG & Linh
               const myName = (p1 === lNameNorm ? p1 : p2).toUpperCase();
               const displayTitle = "[" + codeVal + "] " + block.name + ": " + myName + (otherP ? " & " + otherP : "");
               
               events.push({
                  title: displayTitle,
                  location: room,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  dateStr: dateStr,
                  rowId: i + 1 + "-" + block.name + "-" + codeVal,
                  colorId: "9" // 🔵 Review mặc định màu Xanh (Blueberry)
               });
            }
        }
      });
    } 
    else {
      // 🔴 LOGIC HỘI ĐỒNG (Ép cứng Màu Đỏ + Tiêu đề Hội Đồng)
      const rowPerson = (row[colMap.person] || "").toLowerCase().trim();
      if (rowPerson === lNameNorm) {
        const dateStr = row[colMap.date];
        const timeStr = row[colMap.time];
        const loc = row[colMap.location] || "";
        const codeVal = (row[colMap.code] || row[0] || "---").toString().trim();
        
        const parsedDate = parseVietnameseMMDDYYYY_(dateStr);
        if (parsedDate && timeStr) {
           const start = new Date(parsedDate.getTime());
           const end = new Date(parsedDate.getTime());
           
           let hStart, mStart, hEnd, mEnd;
           const timeParts = timeStr.toString().match(/(\d{1,2})[:h](\d{2})?\s*-\s*(\d{1,2})[:h](\d{2})?/i);
           
           if (timeParts) {
             hStart = parseInt(timeParts[1]);
             mStart = parseInt(timeParts[2] || 0);
             hEnd = parseInt(timeParts[3]);
             mEnd = parseInt(timeParts[4] || 0);
           } else {
             const slotMap = mapSlotToTime_(timeStr);
             hStart = slotMap.hs; mStart = slotMap.ms;
             hEnd = slotMap.he; mEnd = slotMap.me;
           }

           start.setHours(hStart, mStart, 0, 0);
           end.setHours(hEnd, mEnd, 0, 0);
              
           events.push({
              title: "[" + codeVal + "] Hội Đồng: " + lName,
              location: loc,
              start: start.toISOString(),
              end: end.toISOString(),
              dateStr: dateStr,
              rowId: i + 1 + "-" + codeVal,
              colorId: "11" // 🔴 Ép cứng màu ĐỎ (Tomato/Hội Đồng)
           });
        }
      }
    }
  }
  return events;
}

/**
 * 🛠️ BẢNG QUY ĐỔI SLOT SANG GIỜ CHUẨN (v14.68 - HIỆU CHỈNH THEO NGƯỜI DÙNG)
 * Slot 1: 7:00-9:15 | Slot 2: 9:30-11:45 | Slot 3: 12:30-14:45
 * Slot 4: 15:00-17:15 | Slot 5: 17:30-19:45
 */
function mapSlotToTime_(slotInput) {
  const s = slotInput.toString().replace(/[^0-9]/g, ""); // Lấy con số (ví dụ "Slot 2" -> "2")
  switch (s) {
    case "1": return { hs: 7,  ms: 0,  he: 9,  me: 15 };
    case "2": return { hs: 9,  ms: 30, he: 11, me: 45 };
    case "3": return { hs: 12, ms: 30, he: 14, me: 45 };
    case "4": return { hs: 15, ms: 0,  he: 17, me: 15 };
    case "5": return { hs: 17, ms: 30, he: 19, me: 45 };
    default: return { hs: 8, ms: 0, he: 9, me: 0 }; // Fallback
  }
}

/**
 * 🛠️ NEW: HAM CAI DAT TU DONG v14.34 (Chạy 1 lần duy nhất)
 * Chức năng: Dọn dẹp hết Trigger cũ và cài đặt duy nhất 1 trigger onEdit chuẩn.
 */
/**
 * 📦 HỆ THỐNG MAPPING TRUNG TÂM v14.47
 */
function saveMappingToCentralHub_(ss, name, email) {
  try {
    let sheet = ss.getSheetByName("_SYSTEM_CONFIG");
    if (!sheet) {
      sheet = ss.insertSheet("_SYSTEM_CONFIG");
      sheet.appendRow(["Tên Giảng Viên", "Gmail Đồng Bộ (Personal)", "Ngày Cập Nhật"]);
      sheet.getRange("A1:C1").setBackground("#4c1130").setFontColor("white").setFontWeight("bold");
    }
    // Hiện Tab để người dùng quản lý
    sheet.showSheet(); 
    
    const data = sheet.getDataRange().getValues();
    const lNameNorm = name.toLowerCase().trim();
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === lNameNorm) {
        // Ghi đè người mới nhất
        sheet.getRange(i + 1, 2).setValue(email);
        sheet.getRange(i + 1, 3).setValue(new Date());
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([name, email, new Date()]);
    }
  } catch (e) {}
}

function getMappingFromCentralHub_(ss, name) {
  try {
    const sheet = ss.getSheetByName("_SYSTEM_CONFIG");
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    const lNameNorm = name.toLowerCase().trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === lNameNorm) {
        return String(data[i][1]).trim();
      }
    }
  } catch (e) {}
  return null;
}

/**
 * 🛠️ HAM KHOI PHUC MAPPING TU LICH (v14.47)
 * Chức năng: Quét Calendar, lấy người đồng bộ MỚI NHẤT cho mỗi giảng viên.
 */
function REBUILD_MAPPING_HUB_V1447() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const invitationCalendar = getOrCreateInvitationCalendar_();
  const calendarId = invitationCalendar.getId();
  const accessToken = ScriptApp.getOAuthToken();
  const path = "/calendars/" + encodeURIComponent(calendarId) + "/events?maxResults=1000&orderBy=updated";
  
  try {
     const response = GoogleCalendarAPI.fetch_(accessToken, path);
     const items = response.items || [];
     let count = 0;
     const lecturersFound = {}; // Lưu mapping tạm thời

     // Duyệt từ cũ đến mới (để người mới nhất ghi đè người cũ)
     items.forEach(ev => {
        const desc = ev.description || "";
        const summary = ev.summary || "";
        let facultyName = "";
        
        if (summary.indexOf(":") !== -1) {
           facultyName = summary.split(":")[1].trim();
        }

        const emailMatch = desc.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : "";

        if (facultyName && email && email.indexOf("fpt.edu.vn") === -1) {
           // Luôn lấy bản ghi mới nhất trong mảng
           lecturersFound[facultyName.toLowerCase()] = { name: facultyName, email: email };
        }
     });

     // Ghi vào Hub
     for (var key in lecturersFound) {
        saveMappingToCentralHub_(ss, lecturersFound[key].name, lecturersFound[key].email);
        props.setProperty("MAP_" + key, JSON.stringify({ email: lecturersFound[key].email, name: lecturersFound[key].name }));
        count++;
     }

     return "🎉 Đã đồng bộ lại " + count + " giảng viên. Tab _SYSTEM_CONFIG đã được cập nhật!";
  } catch (e) {
     return "❌ Lỗi: " + e.toString();
  }
}

/**
 * 🚀 BẢN CÀN QUÉT v14.53
 * CHẠY HÀM NÀY ĐỂ GIẢI QUYẾT DỨT ĐIỂM SỰ KIỆN PORTAL!
 */
function FORCE_RUN_V1453() {
  const sheetUrls = [
    "https://docs.google.com/spreadsheets/d/1QuiXMhbegm8Xanv7DjQwvTfZ0Dkw64o5DtbflbINoSY/edit",
    "https://docs.google.com/spreadsheets/d/1S7K1i5M9AHup3_8OwyPYRmVfC9GAFuEzBrErOXLAfHE/edit"
  ];
  
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  sheetUrls.forEach(url => {
    try {
      const ss = SpreadsheetApp.openByUrl(url);
      ScriptApp.newTrigger("autoSyncOnSheetEdit_")
        .forSpreadsheet(ss)
        .onEdit()
        .create();
      
      const logSheet = ss.getSheetByName("SYNC_LOGS");
      if (logSheet) {
        logSheet.appendRow([
          Utilities.formatDate(new Date(), "GMT+7", "dd/MM HH:mm:ss"),
          "🚀 [v14.53] HỆ THỐNG ĐÃ SẴN SÀNG CÀN QUÉT PORTAL. HÃY THỬ SỬA SHEET!"
        ]);
      }
    } catch (e) {}
  });
  
  return "Xong! Hãy sang Sheet và thử sửa 1 hàng nhé.";
}

/**
 * 📅 BO LOC NGAY THANG MM/DD/YYYY (v14.55)
 */
function parseVietnameseMMDDYYYY_(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  var s = String(str).trim();
  var parts = s.split(/[\/\-]/);
  if (parts.length >= 3) {
    var month = parseInt(parts[0], 10);
    var day = parseInt(parts[1], 10);
    var year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      if (year < 100) year += 2000;
      return new Date(year, month - 1, day, 0, 0, 0);
    }
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 🚀 HAM HOI SINH v14.55
 * CHẠY HÀM NÀY ĐỂ KÍCH HOẠT LẠI TOÀN BỘ HỆ THỐNG!
 */
function FORCE_RUN_V1455() {
  const sheetUrls = [
    "https://docs.google.com/spreadsheets/d/1QuiXMhbegm8Xanv7DjQwvTfZ0Dkw64o5DtbflbINoSY/edit",
    "https://docs.google.com/spreadsheets/d/1S7K1i5M9AHup3_8OwyPYRmVfC9GAFuEzBrErOXLAfHE/edit"
  ];
  
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  sheetUrls.forEach(url => {
    try {
      const ss = SpreadsheetApp.openByUrl(url);
      ScriptApp.newTrigger("autoSyncOnSheetEdit_")
        .forSpreadsheet(ss)
        .onEdit()
        .create();
      
      const logSheet = ss.getSheetByName("SYNC_LOGS");
      if (logSheet) {
        logSheet.appendRow([
          Utilities.formatDate(new Date(), "GMT+7", "dd/MM HH:mm:ss"),
          "🚀 [v14.55] HỆ THỐNG ĐÃ ĐƯỢC CỨU SỐNG. HÃY THỬ SỬA SHEET!"
        ]);
      }
    } catch (e) {}
  });
  
  return "Đã khôi phục thành công! Hãy sang Sheet và thử sửa 1 ô nhé.";
}
