
export const parseVNTime = (dateStr: string, timeRange: string) => {
  // Format: "13h00-14h30" hoặc "13h-14h"
  const [startPart, endPart] = timeRange.split('-').map(p => p.trim());
  
  const parsePart = (t: string) => {
    const match = t.match(/(\d{1,2})h(\d{2})?/);
    if (!match) return { h: 0, m: 0 };
    return { 
      h: parseInt(match[1]), 
      m: match[2] ? parseInt(match[2]) : 0 
    };
  };

  const start = parsePart(startPart);
  const end = parsePart(endPart);

  // Parse DD/MM/YYYY hoặc MM/DD/YYYY
  // Ở VN thường là DD/MM/YYYY. Ta cần chuẩn hóa.
  const dateParts = dateStr.split('/');
  let d, m, y;
  if (dateParts[0].length === 4) { // YYYY/MM/DD
    [y, m, d] = dateParts.map(Number);
  } else if (parseInt(dateParts[1]) > 12) { // DD/MM/YYYY
    [d, m, y] = dateParts.map(Number);
  } else { // Assume MM/DD/YYYY if ambiguous or standard
    [m, d, y] = dateParts.map(Number);
  }

  const startDate = new Date(y, m - 1, d, start.h, start.m);
  const endDate = new Date(y, m - 1, d, end.h, end.m);

  const toISO = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00+07:00`;
  };

  return {
    start: toISO(startDate),
    end: toISO(endDate)
  };
};

export const generateRowId = (sheetId: string, tab: string, rowIdx: number, person: string): string => {
  return btoa(`${sheetId}-${tab}-${rowIdx}-${person.toLowerCase().trim()}`);
};
