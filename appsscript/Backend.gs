/**
 * =====================================================
 * Schedule Teaching - ALL-IN-ONE BACKEND SCRIPT
 * Version: 14.21 - AUTH & RECALL FIX
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
  FIREBASE_WEB_API_KEY:
    PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY") ||
    "",
  FIREBASE_URL:
    "https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/",
  ADMIN_EMAILS: ["ngohoangtruongdat@gmail.com", "ngohoangtruongdat2@gmail.com"],
  APP_URL: "https://shedule-teaching.vercel.app",
  INVITATION_CALENDAR_NAME: "FPT Scheduler - Invitations",
  OAUTH: {
    CLIENT_ID:
      PropertiesService.getScriptProperties().getProperty("GOOGLE_CLIENT_ID") ||
      "",
    CLIENT_SECRET:
      PropertiesService.getScriptProperties().getProperty(
        "GOOGLE_CLIENT_SECRET",
      ) || "",
    REDIRECT_URI: "https://shedule-teaching.vercel.app/",
  },
  // 📧 CẤU HÌNH SMTP (SendGrid) - Để gửi số lượng lớn (>100 mail/ngày)
  EMAIL_API: {
    SENDGRID_API_KEY:
      PropertiesService.getScriptProperties().getProperty("SENDGRID_API_KEY") ||
      "",
    FROM_EMAIL: "ngohoangtruongdat2@gmail.com",
    FROM_NAME: "FPT Scheduler Service",
  },
};

/**
 * 📨 HỆ THỐNG GỬI MAIL TẬP TRUNG (Hybrid Email Service)
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

    // 🚀 CHIẾN LƯỢC 1: ƯU TIÊN GMAIL (Nếu còn Quota và là tài khoản Gmail)
    if (isGmailSender && quota > 0) {
      const res = this.fallbackToGmail(to, subject, bodyHtml, options);
      if (res.success) return res;
    }

    // 🚀 CHIẾN LƯỢC 2: SENDGRID (Nếu Gmail hết Quota hoặc không phải Gmail sender)
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
          // Nếu SendGrid lỗi, thử Gmail phát cuối nếu còn quota
          if (quota > 0)
            return this.fallbackToGmail(to, subject, bodyHtml, options);
        }
      } catch (e) {
        AppLogger.error("SMTP Critical Error: " + e.toString());
        if (quota > 0)
          return this.fallbackToGmail(to, subject, bodyHtml, options);
      }
    }

    // 🚀 CHIẾN LƯỢC 3: CUỐI CÙNG (Thử Gmail bất chấp nếu chưa thử ở bước 1)
    if (quota > 0) {
      return this.fallbackToGmail(to, subject, bodyHtml, options);
    }

    return {
      success: false,
      error: "Hết hạn mức Gmail (0) và SendGrid không khả dụng hoặc bị lỗi.",
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
    // 📧 Luôn thêm sendUpdates=all nếu có yêu cầu gửi mail
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
   * 🔍 Tìm ID của lịch theo tên (Dùng cho REST API). Tự động tạo nếu không thấy.
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

      // Nếu không tìm thấy và yêu cầu tự tạo (Chỉ dành cho Schedule Teaching)
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
    sheetType = (sheetType || "unknown").toLowerCase().trim(); // 🛡️ CHUẨN HÓA: Tránh lỗi Review !== review
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
          true, // ✅ Tự động tạo nếu không thấy (Tránh làm bẩn Primary của Admin)
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

          // 🔍 BƯỚC 3: XÁC ĐỊNH CHỮ KÝ (SIGNATURE)
          // 🚀 CẢI TIẾN: Không dùng chỉ số dòng (i) vì nó không bền vững khi lọc/sắp xếp
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

          // Tìm theo Signature
          var oldEvent = signatureMap[signature] || null;

          // 🧠 FALLBACK: Nếu không tìm thấy theo Signature
          // Thử tìm theo "Ngày + Tên" (BỎ QUA GIỜ) để nhận diện cập nhật Slot
          if (!oldEvent) {
            for (var sig in signatureMap) {
              var candidate = signatureMap[sig];
              var cStart = new Date(
                candidate.start.dateTime || candidate.start.date,
              );
              var nStart = new Date(nevStart);

              // Nếu cùng Ngày/Tháng/Năm & cùng Tên -> Coi là cùng 1 buổi nhưng đổi giờ
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
            // Đã có trên lịch -> Kiểm tra thay đổi nội dung (Cập nhật)
            const oStartNum = new Date(
              oldEvent.start.dateTime || oldEvent.start.date,
            ).getTime();
            const oEndNum = new Date(
              oldEvent.end.dateTime || oldEvent.end.date,
            ).getTime();

            // Lấy Slot từ mô tả hoặc title của sự kiện cũ nếu cần so sánh text slot
            // Nhưng tốt nhất là so sánh trực tiếp thời gian tuyệt đối
            const isChanged =
              norm(oldEvent.summary) !== norm(nev.title) ||
              norm(oldEvent.location) !== norm(nev.location) ||
              Math.abs(oStartNum - nevStart) > 60000; // Sai lệch trên 1 phút mới tính là đổi giờ

            if (!isChanged) {
              exactMatches[oldEvent.id] = true;
              results.skipped++;
              continue;
            } else {
              toDeleteIds.push(oldEvent.id);
              results.diffDetails.updated.push({
                date: Utilities.formatDate(
                  new Date(nevStart),
                  "GMT+7",
                  "dd/MM/yyyy",
                ),
                old: {
                  title: oldEvent.summary,
                  location: oldEvent.location,
                  start: oStartNum,
                },
                new: {
                  title: nev.title,
                  location: nev.location,
                  start: nevStart,
                  signature: nev.signature, // Thêm signature vào new event để dễ tra cứu
                },
              });
            }
          } else {
            // Brand new (no signature match)
            results.diffDetails.added.push(nev);
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
                  row_code: ev.code || "", // Lưu thêm mã code để đối soát cứng
                },
              },
            };
            // 🎨 MÀU SẮC: Đỏ cho Hội đồng, Xanh dương cho Review
            payload.colorId = ev.colorId
              ? String(ev.colorId)
              : sheetType === "review"
                ? "9"
                : "11";

            //  LỒNG DATA VÀO DESCRIPTION (Dành cho Google Calendar Invitation)
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
                  sendUpdates, // ✅ Dùng tham số truyền xuống (thay vì ép true)
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
                sendUpdates, // ✅ Dùng tham số truyền xuống (Tránh spam email cho từng buổi)
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
    eventIds,
  ) {
    googleAccessToken = googleAccessToken || null;
    sheetType = sheetType || null;
    sendUpdates = sendUpdates || false;

    let deletedCount = 0;

    // 🚀 NEW: Nếu có danh sách ID cụ thể, thực hiện xóa tuần tự để tin cậy 100%
    if (
      googleAccessToken &&
      eventIds &&
      Array.isArray(eventIds) &&
      eventIds.length > 0
    ) {
      AppLogger.info(
        "Sequential deleting " + eventIds.length + " explicit IDs...",
      );

      // Resolve calendarId một lần nếu cần
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

          var deletePath =
            "/calendars/" +
            encodeURIComponent(targetCalId) +
            "/events/" +
            encodeURIComponent(targetEventId);
          if (sendUpdates) deletePath += "?sendUpdates=all";
          GoogleCalendarAPI.fetch_(googleAccessToken, deletePath, {
            method: "delete",
          });
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

    // 🔄 Fallback: Nếu không có ID, thực hiện quét và xóa (Quét rộng 2 năm)
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
              summary.indexOf("[Lịch Chấm]") !== -1 ||
              summary.indexOf("- Slot(") !== -1 ||
              summary.toLowerCase().indexOf("slot") !== -1 ||
              summary.toLowerCase().indexOf("fpt") !== -1 ||
              summary.indexOf("Chấm bài Review") !== -1 ||
              summary.indexOf("Hội đồng bảo vệ") !== -1;

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

      // THỰC THI XÓA (Sequential)
      const allIds = Object.keys(idsToDeleteMap);
      allIds.forEach(function (id) {
        try {
          var deletePath =
            "/calendars/" +
            encodeURIComponent(calendarId) +
            "/events/" +
            encodeURIComponent(id);
          if (sendUpdates) deletePath += "?sendUpdates=all";
          GoogleCalendarAPI.fetch_(googleAccessToken, deletePath, {
            method: "delete",
          });
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
   * 🔍 NEW: Quét ID của các sự kiện do App tạo ra mà không thực hiện xóa
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
          "404: Không tìm thấy lịch: " + (calendarName || "mặc định"),
        );
      }

      const ids = [];
      const now = new Date();
      const startTimeStr = new Date(
        now.getTime() - 180 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 6 tháng trước
      const endTimeStr = new Date(
        now.getTime() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 1 năm sau

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
                summary.indexOf("[Lịch Chấm]") !== -1 ||
                summary.indexOf("- Slot(") !== -1 ||
                summary.toLowerCase().indexOf("slot") !== -1 ||
                summary.indexOf("Chấm bài Review") !== -1 ||
                summary.indexOf("Hội đồng bảo vệ") !== -1;

              let isFromApp = hasCorrectTag || hasMagicMarker;

              if (sheetType && isFromApp) {
                var eventType = privateProps["sheet_type"] || "unknown";
                if (eventType !== "unknown" && eventType !== sheetType) {
                  isFromApp = false;
                }
              }

              if (isFromApp) {
                // Trả về định dạng composite để clearEvents biết calendarId
                ids.push(calId + "|" + item.id);
              }
            });
          }
          pageToken = listResponse.nextPageToken;
        } while (pageToken);
      };

      // Chỉ quét lịch mục tiêu — không quét đa lịch để tránh lỗi quyền truy cập
      scanCalendar(calendarId);

      // Trả về ID đơn (không composite) vì clearEvents sẽ tự dùng calendarId từ calendarName
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
  DEBOUNCE_SECONDS: 30, // 🕒 Set to 30s per user request
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
    date: ["ngày bảo vệ", "ngày khóa luận", "ngày", "date", "thời gian", "thứ"],
    time: ["giờ", "thời gian", "khung giờ", "slot", "bắt đầu", "thời điểm"],
    location: [
      "phòng",
      "địa điểm",
      "location",
      "room",
      "nơi bảo vệ",
      "phòng thi",
      "link",
    ],
    person: [
      "họ và tên",
      "thành viên",
      "giảng viên",
      "người thực hiện",
      "gvhd",
      "nhiệm vụ",
      "reviewer",
      "hội đồng",
      "giám khảo",
      "lecturer",
      "name",
    ],
    email: [
      "@fpt.edu.vn",
      "@gmail.com",
      "email",
      "thư điện tử",
      "liên hệ",
      "mail",
    ],
  };

  var Mapping = {
    date: 5,
    time: 6,
    location: 7,
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
      Mapping.headerRowIndex = r;
    }
  }
  return Mapping;
}

/**
 * 🔄 Cập nhật Cache cho một Giảng viên cụ thể sau khi Admin thực hiện Đồng bộ thủ công.
 * Điều này giúp quy trình tự động (Trigger 30s) không gửi mail trùng lặp.
 */
function updateLecturerCacheFromPayload_(email, sheetUrl, tabName) {
  if (!sheetUrl || !tabName) return;

  try {
    var ss = SpreadsheetApp.openByUrl(sheetUrl);
    var sourceSheet = ss.getSheetByName(tabName);
    var cacheSheetName = NOTIF_CONSTANTS.CACHE_PREFIX + tabName;
    var cacheSheet = ss.getSheetByName(cacheSheetName);

    if (!sourceSheet || !cacheSheet) return;

    var newData = sourceSheet.getDataRange().getValues();
    var colMap = findNotifyColumns_(newData);
    var emailCols = colMap.emails; // Mảng các cột chứa email

    var changedCount = 0;

    // Duyệt qua toàn bộ hàng để tìm hàng của giảng viên này
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
        // Cập nhật hàng tương ứng trong Cache Sheet
        var rowNum = i + 1;
        var numCols = row.length;
        cacheSheet.getRange(rowNum, 1, 1, numCols).setValues([row]);
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

  // 🕒 Xử lý so sánh Date (Đặc biệt là định dạng VN DD/MM/YYYY)
  const toTime = (v) => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === "string") {
      // Thử parse DD/MM/YYYY
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
    if (Math.abs(t1 - t2) < 1000) return true; // Trong vòng 1 giây coi là bằng nhau
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

  // 🛡️ LOCKSERVICE: Ngăn chặn xung đột giữa các trigger chạy song song hoặc với Manual Sync
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // Đợi tối đa 15s nếu có luồng khác đang chạy
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

      var newData = sourceSheet.getDataRange().getValues();
      var oldData = cacheSheet.getDataRange().getValues();
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
                "- Ngày " +
                  dateVal +
                  ": Thay đổi giờ [" +
                  oldTime +
                  " -> " +
                  newTime +
                  "] (" +
                  person +
                  ")",
              );
            } else if (!isSameValue_(oldLoc, newLoc) && oldLoc && newLoc) {
              lecturersChangesMap[lecturerEmail].changes.push(
                "- Ngày " +
                  dateVal +
                  ": Thay đổi phòng [" +
                  oldLoc +
                  " -> " +
                  newLoc +
                  "] (" +
                  person +
                  ")",
              );
            } else {
              lecturersChangesMap[lecturerEmail].changes.push(
                "- Ngày " + dateVal + ": Có cập nhật dữ liệu (" + person + ")",
              );
            }
          }
        }
      }

      if (newData.length > 0) {
        // Cập nhật cache trực tiếp (không clear để tránh mất dữ liệu giữa chừng)
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
          "[FPT Scheduler] Thông báo: Có thay đổi lịch dạy mới tại Tab [" +
          tabName +
          "]";
        var bodyHtml =
          "<div style='font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;'>" +
          "<div style='background: #F27024; color: white; padding: 20px; text-align: center;'>" +
          "<h2 style='margin: 0;'>CẬP NHẬT: " +
          tabName.toUpperCase() +
          "</h2>" +
          "</div>" +
          "<div style='padding: 30px;'>" +
          "<p>Xin chào Giảng viên,</p>" +
          "<p>Lịch giảng dạy/hội đồng của bạn trên bảng tính <b>" +
          tabName +
          "</b> đã có sự thay đổi mới. Chi tiết các thay đổi được ghi nhận:</p>" +
          "<div style='background: #fff8f1; border-left: 4px solid #F27024; padding: 15px; margin: 20px 0; font-size: 14px;'>" +
          changes.join("<br/>") +
          "</div>" +
          "<p style='font-weight: bold; color: #e11d48;'>Lưu ý: Admin chưa thực hiện đồng bộ những thay đổi này lên Calendar của bạn.</p>" +
          "<div style='text-align: center; margin: 30px 0;'>" +
          "<a href='" +
          CONSTANTS.APP_URL +
          "' style='background: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;'>TRUY CẬP ĐỂ ĐỒNG BỘ THỦ CÔNG</a>" +
          "</div>" +
          "<p style='font-size: 12px; color: #666;'>Bạn có thể chủ động nhấn nút Kết nối/Đồng bộ trên trang cá nhân để cập nhật lịch mới nhất mà không cần chờ Admin.</p>" +
          "</div>" +
          "<div style='background: #f9fafb; padding: 15px; text-align: center; font-size: 11px; color: #999;'>" +
          "Hệ thống FPT Scheduler - Website: " +
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
 * 🛠️ Utility: Parse ISO date string (Priority: MM/dd/yyyy for US-style sheets)
 */
function parseDateISO_(str) {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  if (typeof str !== "string") return new Date(str);

  // 🛡️ CHIẾN LƯỢC ƯU TIÊN: THÁNG TRƯỚC NGÀY SAU (MM/dd/yyyy)
  var parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (parts) {
    var first = parseInt(parts[1], 10);
    var second = parseInt(parts[2], 10);
    var y = parseInt(parts[3], 10);

    var m, d;
    // Nếu số đầu > 12 -> Bắt buộc hiểu là VN (Ngày trước Tháng sau)
    if (first > 12) {
      d = first;
      m = second - 1;
    } else {
      // Ưu tiên cao nhất: Số đầu là THÁNG
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
      EmailService.send(
        email.trim(),
        "[FPT Scheduler] Thông báo lịch chấm mới",
        bodyHtml,
        { name: "FPT Scheduler" },
      );
    });
  } catch (e) {
    AppLogger.error("sendManualSummaryEmail error", e.toString());
  }
}

/**
 * 📧 Gửi thông báo cho giảng viên: Tự động chọn luồng tốt nhất (Hybrid Sync)
 * Luồng 1 (Ưu tiên): Đồng bộ ngầm qua OAuth Refresh Token (Silent Sync)
 * Luồng 2 (Dự phòng): Gửi lời mời Calendar (Proxy RSVP) kèm nút Kết nối vĩnh viễn
 */
function notifyLecturersHandler_(payload) {
  var lecturers = payload.lecturers || [];
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

  // 🏛️ Tìm hoặc tạo Lịch phụ (Chỉ dùng cho luồng Dự phòng)
  var invitationCalendar = getOrCreateInvitationCalendar_();

  lecturers.forEach(function (lecturer) {
    try {
      const email = lecturer.email.trim();

      const eventCount = (lecturer.events || []).length;
      addLog("Processing lecturer: " + email + " (" + eventCount + " events)");

      // 🚀 BƯỚC 1: TRUY VẾT QUYỀN TRUY CẬP (SUPER-FINDER)
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
              // ✍️ Ghi lịch trực tiếp vào Calendar của Giảng viên
              const syncDetails = CalendarService.createEvents(
                "primary",
                lecturer.events,
                true,
                refreshResult.token,
                "force_all",
                sheetType,
                false,
                false,
                false,
              );
              try {
                // 📧 Gửi mail báo THÀNH CÔNG (Màu xanh) - CHỈ GỬI NẾU CÓ THÀNH PHẦN THỂ HIỆN SỰ THAY ĐỔI
                const hasAdded = syncDetails.diffDetails.added.length > 0;
                const hasUpdated = syncDetails.diffDetails.updated.length > 0;
                const hasRemoved = syncDetails.diffDetails.removed.length > 0;
                // 📧 Luôn gửi mail nếu admin yêu cầu hoặc có thay đổi (Để Admin test được)
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
                          "⚠️ Lịch ghi OK nhưng KHÔNG GỬI ĐƯỢC MAIL (Lỗi: " +
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
                      message: "⚠️ Lỗi gửi mail: " + mailErr.toString(),
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
                // 🔄 CẬP NHẬT CACHE cho Silent Sync
                updateLecturerCacheFromPayload_(
                  email,
                  payload.sheetUrl,
                  payload.tabName,
                );
              } catch (writeErr) {
                diag =
                  "Lỗi ghi lịch: GV đã kết nối nhưng có thể chưa tích đủ quyền (Xóa/Sửa lịch).";
                AppLogger.error("Silent Sync Write Error", writeErr.toString());
              }
            } catch (err) {
              diag = "Lỗi ghi lịch hoặc đồng bộ: " + err.toString();
              AppLogger.error("Silent Sync Process Error", err.toString());
            }
          } else {
            // 🛡️ AUTH CHECK FIRST
            const quotaRemaining = Math.max(
              0,
              MailApp.getRemainingDailyQuota(),
            );
            const authErr = {
              title: "LỖI XÁC THỰC",
              message:
                "Google báo lỗi: " +
                (refreshResult.error || "Unknown Auth Error"),
            };

            // Nếu là lỗi Quota thực sự của Google thì mới hiện số quota
            if (
              refreshResult.error &&
              refreshResult.error.toLowerCase().indexOf("quota") !== -1
            ) {
              authErr.message += " (Hạn ngạch còn: " + quotaRemaining + ")";
            }

            if (refreshResult.isInvalidGrant) {
              authErr.message =
                "Giảng viên cần kết nối lại Google Calendar (Token hết hạn/Thu hồi). " +
                authErr.message;
            }
            diag =
              authErr.message +
              ". (Gợi ý: Hãy bảo GV nhấn 'KẾT NỐI' lại trên trang cá nhân vì Google đã thu hồi quyền này).";
          }
        } else {
          diag =
            "Lỗi cấu hình: Kết nối bị thiếu 'Mã làm mới' (Refresh Token). Yêu cầu GV nhấn 'KẾT NỐI' lại.";
        }
      } else {
        diag =
          "Chưa kết nối: GV này chưa từng nhấn 'Kết nối Google Calendar' trên trang cá nhân của họ.";
      }

      // 🛡️ BƯỚC 2: QUYẾT ĐỊNH LUỒNG (FALLBACK NẾU SILENT SYNC THẤT BẠI)
      if (silentSyncSuccess) return;

      const forceNotify =
        payload.forceNotify === true || payload.force === true;

      // 🔍 Kiểm tra xem lịch trình có thực sự thay đổi không trước khi gửi Thư mời (Tránh spam)
      const existingItems = getLecturerInvitations_(invitationCalendar, email);
      const isChanged = compareSchedules_(existingItems, lecturer.events);

      if (isChanged || forceNotify) {
        // Nếu giảng viên đã từng kết nối mà lỗi -> TỰ ĐỘNG CHUYỂN SANG LUỒNG THƯ MỜI DỰ PHÒNG
        if (silentSyncAttempted) {
          AppLogger.warn(
            "Silent Sync failed for " +
              email +
              ", falling back to Invitation: " +
              diag,
          );
          results.errors.push({
            title: email,
            message:
              "⚠️ Token lỗi (" + diag + "). Đã chuyển sang Thư mời dự phòng.",
          });
        }

        // 🧹 Dọn dẹp cũ và Tạo mới
        if (existingItems.length > 0) {
          clearLecturerInvitations_(invitationCalendar, email, existingItems);
        }

        createMergedCalendarInvitation_(
          invitationCalendar,
          email,
          lecturer.name,
          lecturer.events,
          sheetType,
        );
        results.success++;
        results.mailSent++;
        addLog("Invitation (Orange) sent to " + email);

        // 🔄 CẬP NHẬT CACHE cho luồng Invitation
        updateLecturerCacheFromPayload_(
          email,
          payload.sheetUrl,
          payload.tabName,
        );
      } else {
        // Không có thay đổi -> Bỏ qua
        results.success++;
        results.mailSkipped++;
        addLog(
          "Skipped invitation for " +
            email +
            " - No differences found in Proxy Calendar.",
        );

        // Vẫn cập nhật cache để đồng bộ trạng thái
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
        title: lecturer.email || "Hệ thống",
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
 * 🔍 Lấy danh sách các lời mời hiện có của 1 giảng viên trên Lịch phụ
 */
function getLecturerInvitations_(calendar, lecturerEmail) {
  const calendarId = calendar.getId();
  const accessToken = ScriptApp.getOAuthToken();
  const now = new Date();
  const timeMin = new Date(
    now.getTime() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const timeMax = new Date(
    now.getTime() + 180 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const path =
    "/calendars/" +
    encodeURIComponent(calendarId) +
    "/events?timeMin=" +
    encodeURIComponent(timeMin) +
    "&timeMax=" +
    encodeURIComponent(timeMax) +
    "&q=" +
    encodeURIComponent(lecturerEmail) +
    "&singleEvents=true&maxResults=250";

  const response = GoogleCalendarAPI.fetch_(accessToken, path);
  if (!response.items || response.items.length === 0) return [];

  return response.items.filter(function (item) {
    const p =
      (item.extendedProperties && item.extendedProperties.private) || {};
    return (
      p[CONSTANTS.SOURCE_TAG] === "fpt_scheduler" ||
      (item.description &&
        item.description.indexOf(CONSTANTS.MAGIC_STRING) !== -1)
    );
  });
}

/**
 * 🧠 So sánh lịch trình hiện tại (trên Calendar) với lịch trình mới (từ Sheet)
 */
function compareSchedules_(oldItems, newEvents) {
  if (oldItems.length !== newEvents.length) return true;

  const norm = function (s) {
    return (s || "").toLowerCase().trim();
  };

  // Sort cả 2 theo thời gian để so sánh cặp
  const oldSorted = oldItems.slice().sort(function (a, b) {
    const tA = new Date(a.start.dateTime || a.start.date).getTime();
    const tB = new Date(b.start.dateTime || b.start.date).getTime();
    return tA - tB;
  });

  const newSorted = newEvents.slice().sort(function (a, b) {
    return parseDateISO_(a.start).getTime() - parseDateISO_(b.start).getTime();
  });

  for (let i = 0; i < oldSorted.length; i++) {
    const o = oldSorted[i];
    const n = newSorted[i];

    const oStart = new Date(o.start.dateTime || o.start.date).getTime();
    const nStart = parseDateISO_(n.start).getTime();

    // Nếu lệch tiêu đề, địa điểm hoặc thời gian (> 1 phút) -> Có thay đổi
    if (
      norm(o.summary).indexOf(norm(n.title)) === -1 &&
      norm(n.title).indexOf(norm(o.summary)) === -1
    )
      return true;
    if (norm(o.location) !== norm(n.location)) return true;
    if (Math.abs(oStart - nStart) > 60000) return true;
  }

  return false;
}

/**
 * 🧹 Xóa các lời mời đã cũ để làm sạch lịch trước khi tạo mới
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
      // Fallback nếu không truyền items sẵn
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
 * 🛠️ Tìm hoặc tạo một Lịch phụ riêng để gửi lời mời
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
    summary: "Lịch chứa các lời mời gửi cho Giảng viên từ FPT Scheduler.",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  AppLogger.info("Created new calendar ID: " + newCal.getId());
  return newCal;
}

/**
 * 📅 Lồng 2 Email thành 1: Gửi 1 email HTML duy nhất chứa Bảng lịch + Nút RSVP Native
 */
function createMergedCalendarInvitation_(
  calendar,
  toEmail,
  lecturerName,
  subEvents,
  sheetType,
) {
  const email = toEmail.trim();
  const calendarId = calendar.getId();
  const accessToken = ScriptApp.getOAuthToken();

  // 📅 Sort by Date (ASC)
  subEvents.sort(function (a, b) {
    return parseDateISO_(a.start).getTime() - parseDateISO_(b.start).getTime();
  });

  var rowsHtml = "";

  // 🚀 TỐI ƯU: Sử dụng BATCH CREATE EVENTS thay vì tạo từng cái một (Cải thiện tốc độ 10x)
  const createRequests = subEvents.map(function (s) {
    const startTime = parseDateISO_(s.start);
    const endTime = parseDateISO_(s.end);
    const isCouncil = sheetType === "council";
    const defaultTitle = isCouncil ? "Hội đồng bảo vệ" : "Chấm bài Review";
    const title = "[Lịch Chấm] " + (s.title || defaultTitle);

    return {
      method: "post",
      path:
        "/calendars/" +
        encodeURIComponent(calendarId) +
        "/events?sendUpdates=none", // 🔕 FIXED: Chặn Google gửi 16 mail rác
      payload: {
        summary: title,
        description:
          CONSTANTS.MAGIC_STRING +
          "\n\n" +
          (s.description ||
            (isCouncil
              ? "Lịch tham gia Hội đồng FPT University"
              : "Lịch chấm bài Review FPT University")),
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
    GoogleCalendarAPI.fetchAll_(accessToken, createRequests);
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

  const bodyHtml =
    "<div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;'>" +
    "<div style='background: #F27024; padding: 25px; text-align: center; color: white;'><h2>Xác Nhận Lịch Chấm Mới</h2></div>" +
    "<div style='padding: 25px;'>" +
    "<p>Chào Giảng viên <b>" +
    lecturerName +
    "</b>,</p>" +
    "<p>Admin đã gửi lịch chấm mới vào Calendar của bạn. Vui lòng bấm <b>Có</b> để xác nhận tham gia.</p>" +
    "<table style='width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;'>" +
    "<thead style='background: #f8f9fa;'><tr><th>STT</th><th>Ngày</th><th>Giờ</th><th>Phòng</th></tr></thead>" +
    "<tbody>" +
    rowsHtml +
    "</tbody></table>" +
    "<div style='margin-top: 25px; text-align: center;'>" +
    "<a href='" +
    yesLink +
    "' style='background: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px; display: inline-block;'>Có (Đồng bộ ngay)</a>" +
    "<a href='" +
    noLink +
    "' style='background: white; color: #d93025; padding: 12px 30px; text-decoration: none; border-radius: 6px; border: 1px solid #eee; font-weight: bold; display: inline-block;'>Không tham gia</a>" +
    "</div></div>" +
    "<p style='padding: 0 25px 25px 25px; color: #666; font-size: 12px;'>Trân trọng,<br>Đại học FPT University</p>" +
    "</div>";

  const isCouncil = sheetType === "council";
  const subject =
    (isCouncil ? "[HỘI ĐỒNG]" : "[REVIEW]") + " Xác nhận Lịch bảo vệ mới";

  return EmailService.send(email, subject, {
    name: "FPT Scheduler Service",
  });
}

/**
 * ⚡ Action xử lý phản hồi RSVP hàng loạt từ Web App
 */
function respondToInvitationsHandler_(payload) {
  const rawEmail = (payload.email || "").trim().toLowerCase();
  const handle = rawEmail.split("@")[0]; // baoh14908
  const action = payload.actionValue || payload.action;

  const invitationCalendar = getOrCreateInvitationCalendar_();
  const calendarId = invitationCalendar.getId();
  const accessToken = ScriptApp.getOAuthToken();

  const statusToSet =
    action === "accept"
      ? CalendarApp.GuestStatus.YES
      : action === "decline"
        ? CalendarApp.GuestStatus.NO
        : CalendarApp.GuestStatus.MAYBE;
  const restStatus =
    action === "accept"
      ? "accepted"
      : action === "decline"
        ? "declined"
        : "tentative";

  const now = new Date();
  const timeMin = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  AppLogger.info(">>> RSVP v15.00 for Handle: " + handle + " via " + rawEmail);

  const events = invitationCalendar.getEvents(timeMin, timeMax);
  var updatedCount = 0;

  events.forEach(function (event) {
    if (!event) return;
    try {
      // 🔍 Tìm theo Handel thay vì Email chuẩn
      const guests = event.getGuests();
      const targetGuest = guests.find(function (g) {
        return g.getEmail().toLowerCase().split("@")[0] === handle;
      });

      if (targetGuest) {
        const eventId = event.getId().split("@")[0];
        AppLogger.info("Updating Event: " + event.getSummary());

        targetGuest.setStatus(statusToSet);

        const rawEvent = GoogleCalendarAPI.fetch_(
          accessToken,
          "/calendars/" +
            encodeURIComponent(calendarId) +
            "/events/" +
            encodeURIComponent(eventId),
        );

        if (rawEvent && rawEvent.attendees) {
          const updatedAttendees = rawEvent.attendees.map(function (a) {
            if (a.email && a.email.toLowerCase().split("@")[0] === handle) {
              a.responseStatus = restStatus;
              a.optional = false;
            }
            return a;
          });

          GoogleCalendarAPI.fetch_(
            accessToken,
            "/calendars/" +
              encodeURIComponent(calendarId) +
              "/events/" +
              encodeURIComponent(eventId) +
              "?sendUpdates=all",
            {
              method: "put",
              payload: JSON.stringify({
                summary: rawEvent.summary,
                description: rawEvent.description,
                location: rawEvent.location,
                start: rawEvent.start,
                end: rawEvent.end,
                attendees: updatedAttendees,
                extendedProperties: rawEvent.extendedProperties,
                reminders: { useDefault: true },
              }),
            },
          );
        }
        updatedCount++;
      }
    } catch (e) {
      AppLogger.error("RSVP Failure: " + handle, e.toString());
    }
  });

  return {
    status: CONSTANTS.SUCCESS,
    message:
      updatedCount > 0
        ? "Thành công! Hệ thống đã ghi nhận " +
          updatedCount +
          " buổi giảng dạy cho giảng viên: " +
          handle
        : "Không tìm thấy lời mời nào cho mã " +
          handle +
          " trong vòng 48h qua.",
    data: { updatedCount: updatedCount },
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
  console.log("Xác thực V14.20 thành công! Hệ thống Proxy RSVP đã sẵn sàng.");
}

/**
 * 🔑 OAUTH 2.0 HANDLERS (Option 2)
 */

function exchangeOAuthCodeHandler_(payload) {
  const code = payload.code;
  const email = (payload.email || "").trim().toLowerCase();
  // 🔑 Dùng redirect_uri do frontend truyền lên (có thể là localhost hoặc production)
  const redirectUri = payload.redirectUri || CONSTANTS.OAUTH.REDIRECT_URI;

  if (!code) throw new Error("Missing authorization code");
  if (!email) throw new Error("Missing email for token association");

  const tokenData = exchangeCodeForTokens_(code, redirectUri);

  // Save to Firebase
  saveLecturerToken_(email, tokenData);

  return {
    status: CONSTANTS.SUCCESS,
    message: "Kết nối Google Calendar thành công và đã lưu token vĩnh viễn.",
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
    hasRefreshToken: !!(token && token.refresh_token), // 🔍 Kiểm tra xem có chìa khóa vĩnh viễn không
    email: email,
  };
}

/**
 * 🌐 OAuth Utils
 */

function exchangeCodeForTokens_(code, redirectUri) {
  const url = "https://oauth2.googleapis.com/token";
  // 🔑 Dùng redirectUri truyền vào; nếu không có thì dùng mặc định (production)
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

  // 🛡️ KIỂM TRA CẤU HÌNH (CRITICAL CHECK)
  if (
    !CONSTANTS.OAUTH.CLIENT_ID ||
    CONSTANTS.OAUTH.CLIENT_ID.includes("YOUR_CLIENT_ID")
  ) {
    return {
      error:
        "Cấu hình thiếu: Bạn chưa nhập CLIENT_ID vào Script Properties của Apps Script.",
    };
  }
  if (
    !CONSTANTS.OAUTH.CLIENT_SECRET ||
    CONSTANTS.OAUTH.CLIENT_SECRET.includes("YOUR_CLIENT_SECRET")
  ) {
    return {
      error:
        "Cấu hình thiếu: Bạn chưa nhập CLIENT_SECRET vào Script Properties của Apps Script.",
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
      // Trả về mã lỗi kỹ thuật để Admin biết đường sửa
      return {
        error:
          "Google báo lỗi: " +
          result.error +
          (result.error_description ? " - " + result.error_description : ""),
        isInvalidGrant: result.error === "invalid_grant",
      };
    }
  } catch (e) {
    AppLogger.error("Critical error during token refresh", e.toString());
    return { error: "Lỗi kết nối máy chủ Google: " + e.toString() };
  }
  return { error: "Không nhận được phản hồi từ Google" };
}

/**
 * 🔥 Firebase Token Store Utils
 */

function saveLecturerToken_(email, tokenData) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const path =
    "lecturer_tokens/" + normalizedEmail.replace(/\./g, "_") + ".json";
  const url = CONSTANTS.FIREBASE_URL + path + "?auth=" + CONSTANTS.GAS_SECRET;

  // 🛡️ BẢO VỆ: Nếu token mới thiếu refresh_token, hãy thử lấy lại cái cũ từ Firebase để không bị mất quyền
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

  // 1. Tìm theo Email chuẩn
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

  // 2. Tra cứu Whitelist để đảm bảo không bỏ sót giảng viên dùng email phụ
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
            // Thử tìm Token bằng CODE giảng viên
            const token = findTokenByFlexibleHandle_(l.code);
            if (token) return token;
          }
        }
      }
    }
  } catch (e) {
    /* ignore */
  }

  // 3. Tìm vét cạn theo Handle prefix
  return findTokenByFlexibleHandle_(handle);
}

/**
 * 🕵️ Helper tìm Token bằng Handle linh hoạt (bất chấp domain và dấu chấm)
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
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];

  // 🏁 BƯỚC 1: XÁC ĐỊNH TRẠNG THÁI EMAIL
  var headerColor = "#F27024"; // Cam FPT (Mặc định cho Cập nhật)
  var headerText = "Cập Nhật Lịch Trình";
  var subject = isCouncil
    ? "[Tự động] Cập nhật lịch tham gia Hội đồng"
    : "[Tự động] Cập nhật lịch chấm bài Review";

  const isPureRecall = events.length === 0 && diff.removed.length > 0;
  const isPureNew =
    diff.added.length > 0 &&
    diff.updated.length === 0 &&
    diff.removed.length === 0;

  if (isPureRecall) {
    headerColor = "#e11d48"; // Đỏ Rose
    headerText = "Thu Hồi Lịch Trình";
    subject = isCouncil
      ? "[THU HỒI] Hủy lịch tham gia Hội đồng"
      : "[THU HỒI] Hủy lịch chấm Review";
  } else if (isPureNew) {
    headerColor = "#059669"; // Xanh Emerald
    headerText = "Lịch Trình Mới";
    subject = isCouncil
      ? "[MỚI] Thông báo lịch tham gia Hội đồng"
      : "[MỚI] Thông báo lịch chấm bài Review";
  }

  // 🚀 TẠO BẢN ĐỒ CẬP NHẬT/THÊM MỚI ĐỂ TÔ VÀNG (CHỈ KHI LÀ CẬP NHẬT)
  var highlightedMap = {};
  var changeNotices = [];

  if (diff && !isPureNew) {
    // Thu thập các buổi cập nhật
    diff.updated.forEach(function (u) {
      const sig = u.new.signature || u.new.title + u.new.start;
      highlightedMap[sig] = true;

      const d = new Date(u.new.start);
      const dayName = daysVN[d.getDay()];
      const dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
      const timeStr = Utilities.formatDate(d, "GMT+7", "HH:mm");
      changeNotices.push(
        "Bạn có sự thay đổi lịch mới là <b>" +
          dayName +
          ", Ngày " +
          dateStr +
          "</b>, lúc <b>" +
          timeStr +
          "</b> tại <b>" +
          (u.new.location || "N/A") +
          "</b>.",
      );
    });

    // Thu thập các buổi thêm mới trong một đợt cập nhật
    diff.added.forEach(function (a) {
      const sig = a.signature || a.title + a.start;
      highlightedMap[sig] = true;

      const d = new Date(a.start);
      const dayName = daysVN[d.getDay()];
      const dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
      const timeStr = Utilities.formatDate(d, "GMT+7", "HH:mm");
      changeNotices.push(
        "Bạn có lịch mới được thêm vào: <b>" +
          dayName +
          ", Ngày " +
          dateStr +
          "</b>, lúc <b>" +
          timeStr +
          "</b> tại <b>" +
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
    const rowBg = isHighlighted ? "background-color: #fef08a;" : ""; // Tô vàng #fef08a (Yellow 200)

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

  // 📝 BƯỚC: Xây dựng đoạn thông báo văn bản
  var noticeHtml = "";
  if (changeNotices.length > 0) {
    noticeHtml =
      "<div style='margin-bottom: 20px; padding: 15px; border-left: 4px solid #F27024; background: #fff7ed; color: #9a3412; font-size: 14px;'>";
    noticeHtml +=
      "<p style='margin: 0 0 10px 0; font-weight: bold;'>Thông báo lịch trình có sự thay đổi:</p>";
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
    "<p>Chào Giảng viên <b>" +
    name +
    "</b>,</p>" +
    (isPureRecall
      ? "<p>Thông báo: Hệ thống đã thực hiện thu hồi các lịch trình cũ của bạn trên Google Calendar.</p>"
      : isPureNew
        ? "<p>Admin đã tạo lịch trình giảng dạy mới cho bạn trên Google Calendar. Dưới đây là chi tiết toàn bộ lịch trình của bạn:</p>"
        : "<p>Có một số thay đổi trong lịch trình của bạn. Hệ thống đã tự động cập nhật vào Google Calendar cá nhân.</p>") +
    (changeNotices.length > 0
      ? "<div style='background: #fff7ed; border-left: 4px solid #f27024; padding: 15px; margin: 20px 0; border-radius: 4px;'>" +
        "<h4 style='color: #c2410c; margin-top: 0; margin-bottom: 10px; font-size: 14px;'>Thông báo lịch trình có sự thay đổi:</h4>" +
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
      ? "Chi tiết lịch trình hiện tại của bạn:"
      : "Chi tiết toàn bộ lịch trình hiện tại của bạn (các dòng <span style='background: #fef08a; padding: 2px 4px; border-radius: 3px;'>tô vàng</span> là thông tin mới cập nhật):") +
    "</p>" +
    "<table style='width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;'>" +
    "<thead style='background: #f8fafc; color: #475569;'><tr><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>STT</th><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>Ngày</th><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>Giờ</th><th style='padding: 12px 8px; border-bottom: 2px solid #e2e8f0;'>Phòng</th></tr></thead>" +
    "<tbody>" +
    rowsHtml +
    "</tbody>" +
    "</table>" +
    (isPureRecall
      ? "<p style='color: #be123c; font-weight: bold;'>Lưu ý: Bạn đã được thu hồi toàn bộ lịch trình cũ.</p>"
      : "") +
    "<hr style='border: 0; border-top: 1px solid #f1f5f9; margin: 25px 0;'>" +
    "<p style='font-size: 11px; color: #94a3b8;'>Hệ thống FPT Scheduler<br/>Đại học FPT University</p>" +
    "</div></div>";

  return EmailService.send(email, subject, bodyHtml, { name: "FPT Scheduler" });
}

/**
 * 💥 NUCLEAR SYNC: GLOBAL RECALL
 * Diệt tận gốc: Quét mảng Token trên Firebase để xóa Silent Sync + xóa Proxy Invitation
 */
function globalRecallHandler_(payload) {
  // 🚀 TỐI ƯU: Nếu payload.sheetType là 'both' hoặc 'all' hoặc trống, ta sẽ xóa cả 2
  var requestedType = payload.sheetType;
  var sheetType =
    requestedType === "both" || requestedType === "all" || !requestedType
      ? null
      : requestedType;

  // Mặc định luôn là true để xóa triệt để, báo người dùng
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
    // 1. SILENT SYNC RECALL (Dọn dẹp lịch cá nhân của từng giảng viên)
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
                "Lỗi Auth " + lecturerEmail + ": " + authErr.toString(),
              );
              continue;
            }

            if (refreshResult && refreshResult.token) {
              try {
                // Diệt triệt để trên Calendar "primary" của giảng viên bằng Token của họ
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
                    "Lỗi quét " +
                      lecturerEmail +
                      ": " +
                      (clearRes.message || "Unknown error"),
                  );
                }
              } catch (clearErr) {
                results.silentFailed++;
                results.errors.push(
                  "Lỗi xóa " + lecturerEmail + ": " + clearErr.toString(),
                );
              }
            } else {
              results.silentFailed++;
              results.errors.push(
                "Token của " + lecturerEmail + " không hợp lệ hoặc đã bị hủy.",
              );
            }
          } else {
            // results.errors.push("Giảng viên " + lecturerEmail + " chưa có Refresh Token.");
          }
        }
      }
    } else {
      results.errors.push("Không thể lấy danh sách token giảng viên từ DB.");
    }
  } catch (e) {
    results.errors.push("Lỗi vòng lặp thu hồi silent sync: " + e.toString());
  }

  // -----------------------------------------------------------------
  // 2. PROXY INVITATION RECALL (Dọn dẹp trên lịch Admin)
  // -----------------------------------------------------------------
  try {
    AppLogger.info("Global Recall: Revoking Proxy Invitations (Silent Mode)");
    var proxyRes = CalendarService.clearEvents(
      CONSTANTS.INVITATION_CALENDAR_NAME,
      ScriptApp.getOAuthToken(),
      sheetType,
      false, // 🔕 Luôn là false để tránh spam 16 mail "Sự kiện bị hủy"
    );
    results.proxyCleared += proxyRes.deletedCount || 0;
  } catch (e) {
    results.errors.push("Lỗi thu hồi proxy: " + e.toString());
  }

  // -----------------------------------------------------------------
  // 3. ADMIN FALLBACK RECALL (Dọn dẹp lịch truyền thống - Just in case)
  // -----------------------------------------------------------------
  try {
    AppLogger.info("Global Recall: Revoking Admin Default Schedule");
    var adminRes = CalendarService.clearEvents(
      CONSTANTS.DEFAULT_CALENDAR_NAME,
      ScriptApp.getOAuthToken(), // Dùng token Admin
      sheetType,
      sendUpdates,
    );
    results.proxyCleared += adminRes.deletedCount || 0;
  } catch (e) {
    results.errors.push("Lỗi thu hồi Admin: " + e.toString());
  }

  // -----------------------------------------------------------------
  // 4. PREPARE FINAL LOGS
  // -----------------------------------------------------------------
  var finalLogs = [
    "Thu hồi toàn hệ thống: Đã xử lý " +
      results.totalProcessed +
      " giảng viên.",
    "Đã xóa: " +
      results.silentCleared +
      " sự kiện cá nhân, " +
      results.proxyCleared +
      " lời mời dự phòng.",
  ];

  if (results.silentFailed > 0) {
    finalLogs.push(
      "⚠️ Thất bại: " +
        results.silentFailed +
        " giảng viên (Lỗi Token hoặc Quyền).",
    );
  }

  if (results.errors.length > 0) {
    // Chỉ lấy 5 lỗi đầu để tránh quá tải UI
    finalLogs.push("Chi tiết lỗi đợt đầu:");
    results.errors.slice(0, 5).forEach(function (err) {
      finalLogs.push("- " + err);
    });
  }

  return {
    status: CONSTANTS.SUCCESS,
    message: "Đã hoàn tất quy trình thu hồi",
    data: results,
    logs: finalLogs,
  };
}
