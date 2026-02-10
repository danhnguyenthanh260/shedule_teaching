
const events = [
  { 
    title: 'GV Đạt',
    start: '2026-02-10T08:00:00+07:00', // Correct ISO
    end: '2026-02-10T10:00:00+07:00',   // Correct ISO
    resources: ['teacher:gv_dat', 'room:302']
  },
  {
    title: 'GV Linh',
    start: '10/02/2026 14:00', // WRONG: User format should be blocked by backend
    end: '10/02/2026 16:00',
    resources: ['teacher:gv_linh', 'room:201']
  }
];

function validateBackend(event) {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  if (!event.start || !event.end || !isoRegex.test(event.start) || !isoRegex.test(event.end)) {
    return { valid: false, error: `Invalid date format for event "${event.title}". Backend requires strict ISO format.` };
  }
  return { valid: true };
}

console.log('--- BACKEND ISO VALIDATION TEST ---');
events.forEach(ev => {
  const result = validateBackend(ev);
  console.log(`Event: [${ev.title}] Data: [${ev.start}]`);
  console.log(`Result: ${result.valid ? '✅ PASSED' : '❌ BLOCKED - ' + result.error}`);
  console.log('---');
});
