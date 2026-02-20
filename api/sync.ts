import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";
import fetch from "node-fetch";

// Initialize Firebase Admin (Singleton pattern for Vercel)
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("✅ Firebase Admin initialized via Service Account");
    } else {
      // Fallback for local dev
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID // Use this even without cert if possible
      });
      console.log("⚠️ Firebase Admin initialized WITHOUT Service Account (using Project ID)");
    }
  } catch (error: any) {
    console.error("❌ Firebase admin initialization error:", error);
  }
}

const db = admin.firestore();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // 1. Authenticate with ID Token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    // 2. Authorization Check (Whitelist - can be moved to Firestore later)
    const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
    // Fallback if env not set (for safety during transition)
    if (ALLOWED_EMAILS.length === 1 && ALLOWED_EMAILS[0] === "" && !userEmail) {
       return res.status(403).json({ error: "Forbidden: No email in token" });
    }
    
    // 5. HELPER: Forward to GAS
    async function forwardToGAS(response: VercelResponse, payload: any) {
      const GAS_URL = process.env.GAS_EXEC_URL;
      if (!GAS_URL) return response.status(500).json({ error: "GAS_EXEC_URL not configured" });

      console.log(`🔗 Forwarding to GAS: ${GAS_URL}`);
      const gasResponse = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
    const { events, calendarName, action, googleAccessToken } = req.body;

    // Handle CLEAR action specifically
    if (action === 'clearCalendar') {
      return forwardToGAS(res, {
        action: 'clearCalendar',
        calendarName: calendarName || "Schedule Teaching",
        secret: process.env.GAS_SECRET,
        googleAccessToken: googleAccessToken
      });
    }

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: "Events array is required" });
    }

    const conflicts: any[] = [];
    const eventsToSync: any[] = [];

    for (const event of events) {
      const { start, end, resources, title } = event;
      
      // 🚨 ISO VALIDATION: Strict regex for yyyy-MM-ddT...
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      if (!start || !end || !isoRegex.test(start) || !isoRegex.test(end)) {
        return res.status(400).json({ 
          error: `Invalid date format for event "${title}". Backend requires strict ISO format (yyyy-MM-ddT...).` 
        });
      }

      const startTime = new Date(start);
      const endTime = new Date(end);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return res.status(400).json({ error: `Invalid date values for event "${title}".` });
      }

      // Check conflict in Firestore
      // Overlap logic: (StartA < EndB) AND (EndA > StartB)
      let overlapSnapshot;
      try {
        overlapSnapshot = await db.collection("slots")
          .where("startTime", "<", endTime)
          .where("endTime", ">", startTime)
          .get();
      } catch (dbErr: any) {
        console.error("❌ Firestore Query Error:", dbErr);
        if (dbErr.message?.includes("index")) {
          return res.status(500).json({
            error: "Thiếu Index trong Firestore",
            detail: "Bạn cần tạo Composite Index. Vui lòng xem link trong Vercel Logs.",
            link: dbErr.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0] || null
          });
        }
        throw dbErr;
      }

      let foundConflict = false;
      for (const doc of overlapSnapshot.docs) {
        const existing = doc.data();
        const commonResources = existing.resources.filter((r: string) => resources.includes(r));
        if (commonResources.length > 0) {
          conflicts.push({
            title,
            conflictWith: existing.title,
            resources: commonResources,
            message: `Xung đột tài nguyên: ${commonResources.join(", ")} với sự kiện "${existing.title}"`
          });
          foundConflict = true;
          break;
        }
      }

      if (!foundConflict) {
        eventsToSync.push(event);
      }
    }

    // 4. Return early if there are conflicts (or choose to sync only clear ones)
    if (conflicts.length > 0) {
      return res.status(409).json({
        status: "conflict",
        message: "Phát hiện xung đột lịch trình",
        conflicts
      });
    }

    // 5. Atomic Update: Create Pending Slots & Sync to GAS
    const { force } = req.body;
    const GAS_URL = process.env.GAS_EXEC_URL;
    const GAS_SECRET = process.env.GAS_SECRET;

    if (!GAS_URL) return res.status(500).json({ error: "GAS_EXEC_URL not configured" });

    // Step A: Save to Firestore (Transactional)
    const batch = db.batch();
    const slotLogRefs: any[] = [];

    eventsToSync.forEach(ev => {
      const slotRef = db.collection("slots").doc(); // Use random ID for now or a stable hash
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

    // Step B: Call Apps Script
    console.log(`🔗 Proxy calling GAS: ${GAS_URL} (Force: ${!!force})`);
    const gasResponse = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: GAS_SECRET || req.body.secret, // Prioritize env, fallback to body
        calendarName: calendarName || "Schedule Teaching",
        force: !!force,
        googleAccessToken: googleAccessToken,
        events: eventsToSync.map(ev => ({
          ...ev,
          description: (ev.description || "") + "\nResources: " + ev.resources.join(", ")
        }))
      })
    });
    
    const responseText = await gasResponse.text();
    
    if (!gasResponse.ok) {
        console.error(`❌ GAS Error: ${gasResponse.status} - ${responseText.substring(0, 200)}`);
        
        let cleanDetail = responseText;
        const errMatch = responseText.match(/class="errorMessage">([^<]+)</i);
        if (errMatch) {
          cleanDetail = `Google Error: ${errMatch[1]}`;
        } else {
          cleanDetail = responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim();
        }

        return res.status(gasResponse.status).json({ 
          error: "Google Apps Script sync error", 
          detail: cleanDetail,
          status: gasResponse.status 
        });
    }

    try {
      const gasResult: any = JSON.parse(responseText);
      console.log(`✅ GAS Response:`, gasResult);
      
      // Step C: Update Status to Confirmed
      if (gasResult.status === "success") {
         const finalBatch = db.batch();
         slotLogRefs.forEach((ref, idx) => {
           finalBatch.update(ref, { 
             status: "confirmed",
           });
         });
         await finalBatch.commit();
      }

      return res.status(200).json({
        status: "success",
        message: gasResult.message,
        data: gasResult.data,
        conflicts: []
      });
    } catch (parseErr) {
      console.error(`❌ JSON Parse Error (Sync). Body: ${responseText.substring(0, 200)}`);
      
      let cleanDetail = responseText;
      const errMatch = responseText.match(/class="errorMessage">([^<]+)</i);
      if (errMatch) {
         cleanDetail = `Google Error: ${errMatch[1]}`;
      } else {
         cleanDetail = responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim();
      }

      return res.status(500).json({
        error: "Google returned non-JSON during Sync",
        detail: cleanDetail,
      });
    }

  } catch (err: any) {
    console.error("Sync Secure Error:", err);
    return res.status(500).json({
      error: "Lỗi nội bộ hệ thống trong quá trình đồng bộ (Proxy 500)",
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      hint: !process.env.FIREBASE_SERVICE_ACCOUNT ? "Thiếu FIREBASE_SERVICE_ACCOUNT trên Vercel" : "Kiểm tra Vercel Logs để biết chi tiết"
    });
  }
}
