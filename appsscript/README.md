# Google Apps Script - Calendar Sync API

## 📋 Mô tả
Backend Apps Script để nhận dữ liệu từ React frontend và ghi sự kiện vào Google Calendar.

## 🚀 Cài đặt & Deploy

### 1. Tạo Apps Script Project
- Truy cập [script.google.com](https://script.google.com)
- Tạo project mới
- Copy code từ `src/` vào script editor theo thứ tự:
  1. `Constants.js`
  2. `Logger.js`
  3. `CalendarService.js`
  4. `doPost.js`

### 2. Deploy as Web App
- Click **Deploy** → **New Deployment**
- **Type**: Select "Web app"
- **Execute as**: Your account
- **Who has access**: "Anyone"
- Copy **Deployment URL**

### 3. Lưu URL vào React
```env
VITE_BACKEND_URL=https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercontent
```

## 📨 API Endpoint

**POST** `{DEPLOYMENT_URL}`

### Request Body
```json
{
  "calendarName": "Schedule Teaching",
  "events": [
    {
      "title": "Họp lớp",
      "start": "2024-02-01T09:00:00",
      "end": "2024-02-01T11:00:00",
      "location": "P.401",
      "description": "Optional",
      "guests": "Optional"
    }
  ]
}
```

### Response
```json
{
  "status": "success",
  "message": "Successfully created 2 out of 2 events",
  "data": {
    "total": 2,
    "success": 2,
    "failed": 0,
    "errors": null
  },
  "timestamp": "2024-02-01T10:00:00Z",
  "executionTime": "2500ms"
}
```

## 🔍 Debugging
- Apps Script Editor → **Executions** tab để xem logs
- Mở Chrome DevTools → Console để xem errors từ Apps Script

## ⚙️ Timezone
Hiện tại set `Asia/Ho_Chi_Minh` trong `appsscript.json`

## 📝 Logging
Tất cả requests/errors được log trong Apps Script console cho debugging.

## 🧪 Testing
### cURL
```bash
curl -X POST "https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercontent" \
  -H "Content-Type: application/json" \
  -d '{
    "calendarName": "Schedule Teaching",
    "events": [{
      "title": "Test Event",
      "start": "2024-02-01T09:00:00",
      "end": "2024-02-01T10:00:00",
      "location": "Test Location"
    }]
  }'
```

### JavaScript (Fetch)
```javascript
fetch('https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercontent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    calendarName: 'Schedule Teaching',
    events: [{
      title: 'Test Event',
      start: '2024-02-01T09:00:00',
      end: '2024-02-01T10:00:00',
      location: 'Test Location'
    }]
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## 📁 File Structure
```
appsscript/
├── src/
│   ├── Constants.js        - Constants & error messages
│   ├── Logger.js           - Logging utility
│   ├── CalendarService.js  - Calendar operations
│   └── doPost.js           - POST handler
├── appsscript.json         - Manifest
└── README.md               - This file
```
