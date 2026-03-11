function testSync8421() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Tên_Sheet_Của_Bạn"); // Thay bằng tên sheet thực tế
  if (!sheet) {
    Logger.log("Không tìm thấy sheet");
    return;
  }
  var data = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i].indexOf(8421) !== -1 || data[i].indexOf("8421") !== -1) {
      rowIdx = i;
      break;
    }
  }
  
  if (rowIdx === -1) {
    Logger.log("Không tìm thấy hàng có code 8421");
    return;
  }
  
  Logger.log("Tìm thấy hàng " + (rowIdx + 1));
  var colMap = detectColumns_(sheet, data);
  // Simulating an edit
  syncSpecificRow_(ss.getId(), sheet, rowIdx + 1, data[rowIdx], data[rowIdx], colMap);
}
