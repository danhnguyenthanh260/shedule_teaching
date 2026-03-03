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
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

    let userEmail: string | undefined;
    if (idToken) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        userEmail = decodedToken.email;
      } catch (authErr) {
        console.warn("⚠️ Token verification failed, proceeding as guest for generic actions");
      }
    }

    // 2. Extract Request Data
    let bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { events, calendarName, action, googleAccessToken, force, conflictMode, skipCleanup, sheetType, secret } = bodyData;

    // 🎯 3. ACTION ROUTING
    // Actions that don't need Firestore logging or Events validation are forwarded DIRECTLY to GAS
    const genericActions = [
      'getTokenStatus', 
      'getLecturerTokenStatus',
      'exchangeOAuthCode', 
      'notifyLecturers', 
      'setupNotifications', 
      'disableNotifications',
      'respondToInvitations',
      'getAppEventIds'
    ];

    if (action && genericActions.includes(action)) {
      console.log(`📡 Generic Action Proxy: ${action}`);
      return forwardToGAS(res, bodyData);
    }

    // Handle CLEAR action specifically (Needs Auth + Firestore)
    if (action === 'clearCalendar') {
      if (!userEmail) return res.status(401).json({ error: "Authentication required for clearing calendar" });
      
      console.log(`🧹 Clearing Firestore slots for user: ${userEmail}`);
      const slotsToClear = await db.collection("slots")
        .where("syncedBy", "==", userEmail)
        .get();
      
      const docs = slotsToClear.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const clearBatch = db.batch();
        const chunk = docs.slice(i, i + 500);
        chunk.forEach(doc => clearBatch.delete(doc.ref));
        await clearBatch.commit();
      }
      
      return forwardToGAS(res, bodyData);
    }

    // Default: SYNC action (Requires Events)
    if (!events || !Array.isArray(events)) {
      // If there's an action but not in our lists, just try to forward it
      if (action) {
         console.log(`📡 Unknown Action Proxy: ${action}`);
         return forwardToGAS(res, bodyData);
      }
      return res.status(400).json({ error: "Events array is required for sync" });
    }

    const normalizedEvents: any[] = [];
    for (const event of events) {
      const { start, end, title } = event;
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      
      if (!start || !end || !isoRegex.test(start) || !isoRegex.test(end)) {
        console.error(`❌ Date format error for "${title}": start=${start}, end=${end}`);
        return res.status(400).json({ 
          error: `Định dạng ngày tháng không hợp lệ cho sự kiện "${title}".`,
          detail: `Giá trị nhận được: ${start || 'null'} - ${end || 'null'}.`
        });
      }
      normalizedEvents.push(event);
    }

    // 🚀 NEW: Firestore Logging for Sync
    if (userEmail) {
      try {
        const batch = db.batch();
        normalizedEvents.forEach(ev => {
          const slotRef = db.collection("slots").doc();
          const startTime = new Date(ev.start);
          const endTime = new Date(ev.end);

          batch.set(slotRef, {
            title: ev.title,
            startTime: admin.firestore.Timestamp.fromDate(isNaN(startTime.getTime()) ? new Date() : startTime),
            endTime: admin.firestore.Timestamp.fromDate(isNaN(endTime.getTime()) ? new Date() : endTime),
            resources: ev.resources || [],
            status: "pending",
            syncedBy: userEmail,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
      } catch (dbErr) {
        console.error("⚠️ Firestore log failed, but continuing sync with GAS:", dbErr);
      }
    }

    return forwardToGAS(res, {
      ...bodyData,
      events: normalizedEvents.map(ev => {
        const resList = Array.isArray(ev.resources) ? ev.resources : [];
        return {
          ...ev,
          description: (ev.description || "") + (resList.length > 0 ? "\nResources: " + resList.join(", ") : "")
        };
      })
    });

    // 5. HELPER: Forward to GAS
    async function forwardToGAS(response: VercelResponse, payload: any) {
      const GAS_URL = process.env.GAS_EXEC_URL;
      const GAS_SECRET = process.env.GAS_SECRET;
      
      if (!GAS_URL) return response.status(500).json({ error: "GAS_EXEC_URL not configured on server" });

      console.log(`🔗 Proxy forwarding to GAS (Action: ${payload.action || 'sync'})`);
      
      try {
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
            error: "Google returned non-JSON response",
            detail: responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim()
          });
        }
      } catch (fetchErr: any) {
        console.error("❌ Fetch to GAS failed:", fetchErr);
        return response.status(504).json({
          error: "Gateway Timeout: Could not reach Google Apps Script",
          message: fetchErr.message
        });
      }
    }

  } catch (err: any) {
    console.error("Proxy handler error:", err);
    return res.status(500).json({
      error: "Lỗi nội bộ hệ thống trong quá trình Proxy (500)",
      message: err.message
    });
  }
}
