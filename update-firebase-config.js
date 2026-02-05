// Quick script to update Firebase config via REST API
// Run this in browser console on any page

const updateConfig = async () => {
  const config = {
    columns: "Mã đề tài, Tên đề tài Tiếng Việt, GVHD, Ngày bảo vệ khóa luận, Giờ, Địa điểm",
    semester: "Fall 2026",
    sheetUrl: "https://docs.google.com/spreadsheets/d/19FGMuZ4GQXN1d4cpB1TPxWJ1iThFL9W9-8NwUnOb1Us/edit#gid=0",
    startRow: "1"
  };

  const response = await fetch(
    'https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/configs/Fall_2026.json',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }
  );

  const result = await response.json();
  console.log('✅ Config updated:', result);
  return result;
};

updateConfig();
