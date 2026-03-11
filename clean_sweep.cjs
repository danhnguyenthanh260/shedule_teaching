const fs = require('fs');
const filePath = 'd:\\Job\\shedule_teaching\\appsscript\\Backend.gs';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Truncate at line 3644 (3643 index)
const cleanLines = lines.slice(0, 3643);

const finalTail = `
/**
 * ==============================================================================
 * 🚀 UNIFIED SYNC ENGINE v3.0 (DIRECT-LINK & TIME-SAFE)
 * ==============================================================================
 */

/**
 * 🕵️ DETECTOR: Cảm biến cột (Nhận diện Gid, Ngày, Slot, Phòng)
 */
function detectColumns_(sheet, cachedData) {
  var data = cachedData || sheet.getRange(1, 1, 20, Math.min(sheet.getLastColumn(), 50)).getValues();
  var col = { date: -1, slot: -1, room: -1, gid: -1, lecturer: -1 };
  
  for (var r = 0; r < data.length; r++) {
    var hits = 0;
    var temp = { date: -1, slot: -1, room: -1, gid: -1, lecturer: -1 };
    for (var c = 0; c < data[r].length; c++) {
      var v = String(data[r][c] || "").toLowerCase().trim();
      if (!v) continue;
      
      if (temp.date === -1 && (v.indexOf("ngày") !== -1 || v === "date")) { temp.date = c; hits++; }
      if (temp.slot === -1 && (v === "ca" || v === "slot" || v === "kip" || v.indexOf("slot") !== -1)) { temp.slot = c; hits++; }
      if (temp.room === -1 && (v === "room" || v.indexOf("phòng") !== -1 || v === "phong")) { temp.room = c; hits++; }
      if (temp.gid === -1 && v === "gid") { temp.gid = c; }
      // Thêm nhận diện cột Giảng viên nếu cần
      if (temp.lecturer === -1 && (v === "giảng viên" || v === "giang vien" || v === "lecturer")) { temp.lecturer = c; }
    }
    if (hits >= 2) {
        temp.headerRowIndex = r;
        return temp;
    }
  }
  return col;
}

/**
 * 🕒 TIME-SAFE: Hệ thống giờ FPT chuẩn
 */
function calculateTimeFromSlot_(slotStr, date) {
  if (!date || !slotStr) return null;
  var s = String(slotStr).toLowerCase().trim();
  var d = new Date(date);
  
  var hS = 0, mS = 0, hE = 0, mE = 0;

  if (s.indexOf("1") !== -1) { hS = 7; mS = 0; hE = 9; mE = 15; }
  else if (s.indexOf("2") !== -1) { hS = 9; mS = 30; hE = 11; mE = 45; }
  else if (s.indexOf("3") !== -1) { hS = 12; mS = 30; hE = 14; mE = 45; }
  else if (s.indexOf("4") !== -1) { hS = 15; mS = 0; hE = 17; mE = 15; }
  else if (s.indexOf("5") !== -1) { hS = 17; mS = 30; hE = 19; mE = 45; }
  else { return null; }

  var start = new Date(new Date(d).setHours(hS, mS, 0, 0));
  var end = new Date(new Date(d).setHours(hE, mE, 0, 0));
  
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * ⚡ TRIGGER: Đồng bộ tức thì khi sửa dòng (Sửa đâu trúng đó)
 */
function autoSyncOnSheetEdit_(e) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(15000)) return;

    var range = e.range;
    var sheet = range.getSheet();
    var r = range.getRow();
    if (r <= 1) return; // Header

    var lastCol = sheet.getLastColumn();
    var rowData = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
    var colMap = detectColumns_(sheet);

    // 1. Tìm hoặc Tạo cột Gid bí mật
    var gidIdx = colMap.gid;
    if (gidIdx === -1) {
        gidIdx = lastCol;
        sheet.getRange(1, gidIdx + 1).setValue("Gid");
    }

    // 2. Nhận diện giảng viên trong hàng
    var lecturer = null;
    rowData.forEach(function(cell) {
        var info = extractLecturerInfo_(cell);
        if (info && info.handle) lecturer = info;
    });
    if (!lecturer) return;

    // 3. Tính giờ
    var times = calculateTimeFromSlot_(rowData[colMap.slot], rowData[colMap.date]);
    if (!times) return;

    // 4. Lấy Email
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty("MAP_" + lecturer.handle.toLowerCase());
    var email = saved ? JSON.parse(saved).email : lecturer.handle.toLowerCase() + "@fpt.edu.vn";

    // 5. Đồng bộ Phẫu thuật (Revoke Gid cũ -> Mời ID mới)
    var currentGid = String(rowData[gidIdx] || "").trim();
    if (currentGid) {
        try { GoogleCalendarAPI.deleteEvent(null, "primary", currentGid, true); } catch(ex){}
    }

    var newEv = createNewEvent_({
        summary: "Lịch Review: " + lecturer.name,
        location: rowData[colMap.room] || "",
        start: { dateTime: times.start, timeZone: "Asia/Ho_Chi_Minh" },
        end: { dateTime: times.end, timeZone: "Asia/Ho_Chi_Minh" },
        attendees: [{ email: email }]
    }, "primary", email, lecturer.handle, lecturer.name, "AUTO_" + Date.now());

    // 6. Lưu Gid mới
    sheet.getRange(r, gidIdx + 1).setValue(newEv.id);

  } catch (err) {
    Logger.log("❌ Sync Error Line " + r + ": " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * ⚙️ UI HANDLER: Đồng bộ hàng loạt (Batch Sync)
 */
function syncToNativeGuestHandler_(payload) {
  var lCode = (payload.lecturerCode || "").trim().toLowerCase();
  var lName = (payload.lecturerName || "Giảng viên").trim();
  var events = payload.events || [];
  var targetEmail = (payload.targetEmail || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  if (!lCode) return { status: "error", message: "Thiếu mã GV" };

  try {
    var colMap = detectColumns_(sheet);
    var gidIdx = colMap.gid;
    if (gidIdx === -1) {
        gidIdx = sheet.getLastColumn();
        sheet.getRange(1, gidIdx + 1).setValue("Gid");
    }

    // Tìm tất cả các dòng của giảng viên này trên Sheet để lấy Gid
    var data = sheet.getDataRange().getValues();
    var stats = { added: 0, updated: 0 };

    data.forEach(function(row, idx) {
        if (idx === 0) return;
        var rNum = idx + 1;
        var hasMe = row.some(function(cell) {
             var info = extractLecturerInfo_(cell);
             return info && info.handle.toLowerCase() === lCode;
        });

        if (hasMe) {
            var times = calculateTimeFromSlot_(row[colMap.slot], row[colMap.date]);
            if (!times) return;

            var oldGid = String(row[gidIdx] || "").trim();
            if (oldGid) {
                 try { GoogleCalendarAPI.deleteEvent(null, "primary", oldGid, true); } catch(e){}
            }

            var newEv = createNewEvent_({
                summary: "Lịch Review: " + lName,
                location: row[colMap.room] || "",
                start: { dateTime: times.start, timeZone: "Asia/Ho_Chi_Minh" },
                end: { dateTime: times.end, timeZone: "Asia/Ho_Chi_Minh" },
                attendees: [{ email: targetEmail }]
            }, "primary", targetEmail, lCode, lName, "BATCH_" + Date.now());

            sheet.getRange(rNum, gidIdx + 1).setValue(newEv.id);
            stats.added++;
        }
    });

    return { status: "success", message: "Đã đồng bộ xong " + stats.added + " buổi Review." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * 💎 HELPER: Tạo sự kiện chuẩn
 */
function createNewEvent_(details, calendarId, targetEmail, lCode, lName, eventId) {
  var dStr = Utilities.formatDate(new Date(details.start.dateTime), 'Asia/Ho_Chi_Minh', 'dd/MM');
  var summary = 'Lịch Review: ' + (lName || lCode) + ' (' + dStr + ')';
  
  return GoogleCalendarAPI.createEvent(null, calendarId, {
    summary: summary,
    location: details.location || '',
    description: 'FPT Scheduler Sync. TaskID: ' + eventId,
    start: details.start,
    end: details.end,
    attendees: details.attendees,
    extendedProperties: {
      private: {
        source: 'fpt_scheduler',
        lecturer_code: lCode,
        target_email: targetEmail,
        event_code: eventId
      }
    }
  }, true);
}

/**
 * 🔍 HELPER: Trích xuất thông tin giảng viên
 */
function extractLecturerInfo_(val) {
  var s = String(val || "").trim();
  if (s.length < 3) return null;
  var handle = "", name = "";
  var m = s.match(/([^(]+)\\s*\\(([^)]+)\\)/);
  if (m) { name = m[1].trim(); handle = m[2].toLowerCase().trim(); }
  else if (s.indexOf(" ") === -1) { handle = s.toLowerCase(); }
  else { name = s; }
  return handle ? { handle: handle, name: name } : null;
}

/**
 * 🔄 TRIGGER MANAGER
 */
function TAI_LAP_TRIGGER_TU_DONG() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "autoSyncOnSheetEdit_") ScriptApp.deleteTrigger(t);
  });
  
  ScriptApp.newTrigger("autoSyncOnSheetEdit_")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  
  return "Đã kích hoạt chế độ Tự động đồng bộ khi sửa Sheet!";
}
`;

fs.writeFileSync(filePath, cleanLines.join('\n') + finalTail, 'utf8');
console.log('✅ CLEAN SWEEP COMPLETED. Truncated at line 3644 and appended unified engine.');
