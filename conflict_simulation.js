
const eventsInDatabase = [
  { id: 'db_1', title: 'Lớp PRJ301', start: '2026-02-10T08:00:00', end: '2026-02-10T10:00:00', resources: ['teacher:gv_dat', 'room:302'] },
  { id: 'db_2', title: 'Họp khoa', start: '2026-02-10T14:00:00', end: '2026-02-10T16:00:00', resources: ['teacher:gv_kien', 'room:401'] },
  { id: 'db_3', title: 'Trực đêm', start: '2026-02-10T22:00:00', end: '2026-02-11T06:00:00', resources: ['teacher:gv_truong'] }
];

const newEventsToSync = [
  // 1. Trùng giờ cùng GIẢNG VIÊN (gv_dat bận lúc 08:30)
  { title: 'Dạy thêm 1', start: '2026-02-10T08:30:00', end: '2026-02-10T10:30:00', resources: ['teacher:gv_dat', 'room:101'] },
  
  // 2. Trùng giờ cùng PHÒNG (phòng 302 bận lúc 09:00)
  { title: 'Lớp Java cơ bản', start: '2026-02-10T09:00:00', end: '2026-02-10T11:00:00', resources: ['teacher:gv_linh', 'room:302'] },
  
  // 3. Sát biên (EndTime == StartTime) -> KHÔNG XUNG ĐỘT theo logic (EndA > StartB)
  { title: 'Lớp buổi trưa', start: '2026-02-10T10:00:00', end: '2026-02-10T12:00:00', resources: ['teacher:gv_dat', 'room:302'] },
  
  // 4. Kéo dài qua ngày (Overnight)
  { title: 'Sự kiện xuyên đêm', start: '2026-02-10T23:00:00', end: '2026-02-11T02:00:00', resources: ['teacher:gv_truong', 'room:505'] },

  // 5. Cách xa (OK)
  { title: 'Lớp chiều', start: '2026-02-10T16:30:00', end: '2026-02-10T18:30:00', resources: ['teacher:gv_kien', 'room:401'] },
  
  // 6 -> 10: Các case OK khác
  { title: 'Lớp sáng sớm', start: '2026-02-10T06:00:00', end: '2026-02-10T07:30:00', resources: ['teacher:gv_dat', 'room:302'] },
  { title: 'Lớp tối', start: '2026-02-10T19:00:00', end: '2026-02-10T21:00:00', resources: ['teacher:gv_dat', 'room:302'] },
  { title: 'Lớp hôm sau', start: '2026-02-11T08:00:00', end: '2026-02-11T10:00:00', resources: ['teacher:gv_dat', 'room:302'] },
  { title: 'Lớp hôm sau 2', start: '2026-02-11T13:00:00', end: '2026-02-11T15:00:00', resources: ['teacher:gv_dat', 'room:101'] },
  { title: 'Lớp hôm sau 3', start: '2026-02-11T15:00:00', end: '2026-02-11T17:00:00', resources: ['teacher:gv_dat', 'room:101'] }
];

function checkConflictLogic(event, db) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  let conflictFound = null;

  db.forEach(existing => {
    const eStart = new Date(existing.start);
    const eEnd = new Date(existing.end);

    // Logic trong api/sync.ts: (StartA < EndB) AND (EndA > StartB)
    const isOverlapping = (eStart < end) && (eEnd > start);

    if (isOverlapping) {
      const common = existing.resources.filter(r => event.resources.includes(r));
      if (common.length > 0) {
        conflictFound = {
          with: existing.title,
          resources: common
        };
      }
    }
  });

  return conflictFound;
}

console.log('--- KẾT QUẢ GIẢ LẬP KIỂM TRA XUNG ĐỘT ---\n');

newEventsToSync.forEach((ev, index) => {
  const result = checkConflictLogic(ev, eventsInDatabase);
  const status = result ? '❌ BỊ CHẶN' : '✅ HỢP LỆ';
  console.log(`${index + 1}. [${ev.title}] ${ev.start} -> ${ev.end}`);
  console.log(`   Tài nguyên: ${ev.resources.join(', ')}`);
  console.log(`   Trạng thái: ${status}`);
  if (result) {
    console.log(`   Lý do: Xung đột tài nguyên [${result.resources.join(', ')}] với "${result.with}"`);
  }
  console.log('');
});
