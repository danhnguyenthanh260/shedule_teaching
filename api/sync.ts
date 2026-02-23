import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";
import fetch from "node-fetch";

/**
 * Robust Firebase Admin Initialization
 */
function initializeFirebase() {
  if (!admin.apps.length) {
    try {
      const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!saRaw) {
        // Fallback for local dev
        admin.initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID });
        console.log("⚠️ Firebase Admin initialized WITHOUT Service Account");
        return admin.firestore();
      }

      let serviceAccount: any;
      
      if (typeof saRaw === 'object') {
        serviceAccount = saRaw;
      } else {
        const cleanedSa = saRaw.trim();
        // If it looks like [object Object], the user likely misconfigured the Vercel variable
        if (cleanedSa.startsWith('[object')) {
           throw new Error("Biến FIREBASE_SERVICE_ACCOUNT bị gán giá trị '[object Object]'. Hãy kiểm tra lại cách bạn dán (paste) JSON vào Vercel.");
        }
        
        try {
          serviceAccount = JSON.parse(cleanedSa);
        } catch (parseErr: any) {
          console.error("DEBUG: FIREBASE_SERVICE_ACCOUNT starts with:", cleanedSa.substring(0, 30));
          throw new Error(`JSON Parse Error: ${parseErr.message}. Hãy đảm bảo bạn dán ĐÚNG và ĐỦ nội dung file JSON vào Vercel.`);
        }
      }
        
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("✅ Firebase Admin initialized successfully");
    } catch (error: any) {
      console.error("❌ Firebase admin initialization error:", error);
      throw new Error("Lỗi khởi tạo Firebase: " + error.message);
    }
  }
  return admin.firestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let db;
  try {
    db = initializeFirebase();
  } catch (initErr: any) {
    return res.status(500).json({ 
      error: "Lỗi cấu hình hệ thống (Firebase)", 
      message: initErr.message,
      hint: "Hãy đảm bảo biến môi trường FIREBASE_SERVICE_ACCOUNT đã được thiết lập đúng trên Vercel."
    });
  }

  try {
    // 1. Authenticate with ID Token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    // 2. Authorization Check (Whitelist)
    const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
    if (ALLOWED_EMAILS.length === 1 && ALLOWED_EMAILS[0] === "" && !userEmail) {
       return res.status(403).json({ error: "Forbidden: No email in token" });
    }
    
    // 5. HELPER: Forward to GAS
    async function forwardToGAS(response: VercelResponse, payload: any) {
      const GAS_URL = process.env.GAS_EXEC_URL;
      const GAS_SECRET = process.env.GAS_SECRET;
      
      if (!GAS_URL) return response.status(500).json({ error: "GAS_EXEC_URL not configured" });

      console.log(`🔗 Forwarding to GAS: ${GAS_URL}`);
      const gasResponse = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          secret: GAS_SECRET || payload.secret
        })
      });
      
      const responseText = await gasResponse.text();
      
      if (!gasResponse.ok) {
          console.error(`❌ GAS Error: ${gasResponse.status} - ${responseText.substring(0, 200)}`);
          return response.status(gasResponse.status).json({ 
            error: "Google Apps Script error", 
            detail: responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim()
          });
      }

      try {
        const gasResult: any = JSON.parse(responseText);
        return response.status(200).json(gasResult);
      } catch (parseErr) {
        return response.status(500).json({
          error: "Google returned non-JSON",
          detail: responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim()
        });
      }
    }

    // 3. Process Events or Clear Action
    const { events, calendarName, action, googleAccessToken, force, conflictMode } = req.body;

    // Handle CLEAR action specifically
    if (action === 'clearCalendar') {
      console.log(`🧹 Clearing Firestore slots for user: ${userEmail}`);
      const slotsToClear = await db.collection("slots")
        .where("syncedBy", "==", userEmail)
        .get();
      
      const clearBatch = db.batch();
      slotsToClear.docs.forEach(doc => clearBatch.delete(doc.ref));
      await clearBatch.commit();
      console.log(`✅ Cleared ${slotsToClear.size} slots from Firestore`);

      return forwardToGAS(res, {
        action: 'clearCalendar',
        calendarName: calendarName || "Schedule Teaching",
        googleAccessToken: googleAccessToken
      });
    }

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: "Events array is required" });
    }

    const normalizedEvents: any[] = [];
    for (const event of events) {
      const { start, end, title } = event;
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      
      if (!start || !end || !isoRegex.test(start) || !isoRegex.test(end)) {
        console.error(`❌ Date format error for "${title}": start=${start}, end=${end}`);
        return res.status(400).json({ 
          error: `Định dạng ngày tháng không hợp lệ cho sự kiện "${title}".`,
          detail: `Giá trị nhận được: ${start || 'null'} - ${end || 'null'}. Hệ thống yêu cầu chuẩn ISO (YYYY-MM-DD...). Hãy tải lại trang và thử lại.`
        });
      }
      normalizedEvents.push(event);
    }

    // 🚀 NEW: We REMOVED the internal Firestore conflict check.
    // Why? Because Firestore can be "stale" (e.g., if you delete on Calendar manually).
    // We let Google Apps Script (the source of truth) handle actual conflict detection.
    const eventsToSync = normalizedEvents;


    const batch = db.batch();
    const slotLogRefs: any[] = [];

    eventsToSync.forEach(ev => {
      const slotRef = db.collection("slots").doc();
      batch.set(slotRef, {
        title: ev.title,
        startTime: admin.firestore.Timestamp.fromDate(new Date(ev.start)),
        endTime: admin.firestore.Timestamp.fromDate(new Date(ev.end)),
        resources: ev.resources,
        status: "pending",
        syncedBy: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      slotLogRefs.push(slotRef);
    });

    await batch.commit();

    return forwardToGAS(res, {
      calendarName: calendarName || "Schedule Teaching",
      force: !!force,
      conflictMode: conflictMode || null,
      googleAccessToken: googleAccessToken,
      events: eventsToSync.map(ev => ({
        ...ev,
        description: (ev.description || "") + "\nResources: " + ev.resources.join(", ")
      }))
    });

  } catch (err: any) {
    console.error("Sync Secure Error:", err);
    return res.status(500).json({
      error: "Lỗi nội bộ hệ thống trong quá trình đồng bộ (Proxy 500)",
      message: err.message,
      hint: !process.env.FIREBASE_SERVICE_ACCOUNT ? "Thiếu FIREBASE_SERVICE_ACCOUNT trên Vercel" : "Kiểm tra Vercel Logs để biết chi tiết"
    });
  }
}
