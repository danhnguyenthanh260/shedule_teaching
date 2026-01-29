# 🚀 Quick Start Guide - Teacher Schedule Importer Projects

## 📦 Project Structure

```
Teacher-Schedule-Importer_BE/    ← Backend API (Node.js + Express + Prisma)
Teacher-Schedule-Importer_FE/    ← Frontend (Next.js 16 + React 19)
```

---

## ⚡ Quick Start (Dev Mode)

### 1️⃣ Start Backend (Terminal 1)

```powershell
cd Teacher-Schedule-Importer_BE
npm install
npm run dev
```

**Backend sẽ chạy tại:** http://localhost:5000
**API Docs (Swagger):** http://localhost:5000/api-docs

### 2️⃣ Start Frontend (Terminal 2)

```powershell
cd Teacher-Schedule-Importer_FE
npm install
npm run dev
```

**Frontend sẽ chạy tại:** http://localhost:3000

---

## 🔧 Configuration Files

### Backend `.env`

```env
PORT=5000
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000    ← CORS origin
DATABASE_URL=postgresql://...
JWT_SECRET=dev-secret-key...
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🧪 Testing the Integration

1. **Open Frontend:** http://localhost:3000
2. **Check Backend Status:** Green dot = Online ✓
3. **Login:** Click "Đăng nhập với Google"
4. **Test Preview:** Enter Sheet URL → Load data
5. **Test Sync:** Select events → Sync to Calendar

---

## 📋 Pre-requisites Checklist

### Backend:
- [x] PostgreSQL database ready (Neon.tech)
- [x] `.env` file created with correct values
- [x] Node.js v20+ installed
- [x] Dependencies installed (`npm install`)

### Frontend:
- [x] `.env.local` file created
- [x] Node.js v20+ installed
- [x] Dependencies installed (`npm install`)

---

## 🐛 Troubleshooting

### Frontend shows "Backend Offline"

**Check:**
1. Backend running? → `cd Teacher-Schedule-Importer_BE && npm run dev`
2. Port 5000 accessible? → http://localhost:5000/api/health
3. CORS configured? → BE `.env` has `FRONTEND_URL=http://localhost:3000`

### Login không hoạt động

**Check:**
1. Database connected? → Check BE console logs
2. Google OAuth configured? → User needs to configure via API first
3. Cookies enabled? → Browser settings

### API calls fail với 401

**Check:**
1. JWT token expired? → Login lại
2. Cookies blocked? → Check browser DevTools → Application → Cookies
3. Backend auth middleware? → Check BE logs

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/auth/google/url` | Get OAuth URL |
| POST | `/api/sheets/preview` | Preview sheet data |
| POST | `/api/calendar/sync` | Sync to calendar |
| GET | `/api/calendar/events` | Get synced events |

**Full API Docs:** http://localhost:5000/api-docs

---

## 🎯 Development Workflow

### 1. Backend Development
```powershell
cd Teacher-Schedule-Importer_BE
npm run dev          # Start with nodemon (auto-reload)
npm run build        # Build TypeScript
npm run prisma:studio # Open database GUI
```

### 2. Frontend Development
```powershell
cd Teacher-Schedule-Importer_FE
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm run lint         # Check code quality
```

---

## 🔐 Security Notes

1. **JWT Secret:** Change in production (min 32 chars)
2. **Database URL:** Use secure connection (SSL required)
3. **CORS:** Restrict to specific domains in production
4. **httpOnly Cookies:** Token không expose qua JavaScript
5. **Rate Limiting:** Enabled cho auth endpoints

---

## 📝 Next Steps

1. Configure Google OAuth credentials
2. Test full login → preview → sync flow
3. Check database for synced events
4. Review API logs for errors
5. Deploy to production (Vercel/Railway/Render)

---

**Last Updated:** January 29, 2026
**Status:** ✅ Backend & Frontend 100% integrated
