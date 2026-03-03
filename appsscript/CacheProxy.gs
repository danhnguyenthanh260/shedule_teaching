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
    var oldData = cacheSheet.getDataRange().getValues();

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

        // Đảm bảo cacheSheet có đủ hàng/cột
        if (cacheSheet.getLastRow() < rowNum) {
          // Có thể là hàng mới thêm vào cuối
        }

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
