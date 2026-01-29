
const SLOT_TIME_RANGES: Record<number, string> = {
  1: '07:00-09:15',
  2: '09:30-11:45',
  3: '12:30-14:45',
  4: '15:00-17:15',
  5: '17:30-19:45'
};

export const parseVNTime = (dateStr: string, timeRange: string) => {
  // Formats supported:
  // - "13h00-14h30" or "13h-14h"
  // - "07:30-09:30"
  // - Slot number: "1", "2", "3"
  const normalizedRange = timeRange.replace(/\u2013|\u2014/g, '-').trim();
  const slotMatch = normalizedRange.match(/^\s*(\d+)\s*$/) || normalizedRange.match(/slot\s*(\d+)/i);
  const mappedRange = slotMatch ? SLOT_TIME_RANGES[parseInt(slotMatch[1])] : undefined;
  const [startPart, endPart] = (mappedRange || normalizedRange).split('-').map(p => p.trim());
  
  const parsePart = (t: string) => {
    if (!t) return { h: 0, m: 0 };
    if (t.includes(':')) {
      const [hh, mm] = t.split(':');
      return { h: parseInt(hh), m: parseInt(mm) };
    }
    const match = t.match(/(\d{1,2})h(\d{2})?/);
    if (!match) return { h: 0, m: 0 };
    return { 
      h: parseInt(match[1]), 
      m: match[2] ? parseInt(match[2]) : 0 
    };
  };

  const startTime = parsePart(startPart);
  const endTime = parsePart(endPart);
  // Parse DD/MM/YYYY or MM/DD/YYYY (VN usually uses DD/MM/YYYY)
  const dateParts = dateStr.split('/');
  let d, m, y;
  if (dateParts[0].length === 4) { // YYYY/MM/DD
    [y, m, d] = dateParts.map(Number);
  } else if (parseInt(dateParts[0]) > 12) { // DD/MM/YYYY
    [d, m, y] = dateParts.map(Number);
  } else if (parseInt(dateParts[1]) > 12) { // MM/DD/YYYY
    [m, d, y] = dateParts.map(Number);
  } else { // Assume MM/DD/YYYY if ambiguous or standard
    [m, d, y] = dateParts.map(Number);
  }

  const startDate = new Date(y, m - 1, d, startTime.h, startTime.m);
  const endDate = new Date(y, m - 1, d, endTime.h, endTime.m);

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
