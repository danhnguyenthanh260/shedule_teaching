import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS & Anti-Cache Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const GAS_URL = process.env.GAS_EXEC_URL;
    const GAS_SECRET = process.env.GAS_SECRET;
    
    if (!GAS_URL) return res.status(500).json({ error: "GAS_EXEC_URL not configured on server" });

    let payload: any = {};
    if (req.method === "GET") {
      payload = req.query;
    } else {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    // 🎯 3. ACTION ROUTING
    const needsUrlValidation = ['readSheet', 'getTabNames', 'setupNotifications', 'disableNotifications'];
    
    if (needsUrlValidation.includes(payload.action)) {
      const idMatch = String(payload.url || "").match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!idMatch) {
        return res.status(400).json({ 
          error: "URL Google Sheet không hợp lệ", 
          detail: "Vui lòng kiểm tra lại đường dẫn Sheet (Cần có chứa /d/ID/)" 
        });
      }
    }

    // 🔒 FORCE INJECT SECRET FROM ENVIRONMENT
    const finalPayload = {
      ...payload,
      secret: GAS_SECRET || payload.secret
    };

    console.log(`🔗 Proxy calling GAS via ReadSheet: ${GAS_URL} (Action: ${payload.action || 'readSheet'})`);
    
    // 🚀 URL Cache-buster for GAS call
    const bustUrl = `${GAS_URL}${GAS_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;

    try {
      const response = await fetch(bustUrl, {
        method: "POST", // GAS handles POST better for diverse actions
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload)
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`❌ GAS Error: ${response.status} - ${responseText.substring(0, 200)}`);
        
        let cleanDetail = responseText;
        const errMatch = responseText.match(/class="errorMessage">([^<]+)</i);
        if (errMatch) {
          cleanDetail = `Google Error: ${errMatch[1]}`;
        } else {
          cleanDetail = responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim();
        }

        return res.status(response.status).json({ 
          error: "Google Apps Script error", 
          detail: cleanDetail,
          status: response.status 
        });
      }

      try {
        const data = JSON.parse(responseText);
        return res.status(200).json(data);
      } catch (parseErr) {
        return res.status(500).json({
          error: "Google returned non-JSON response (likely HTML error)",
          detail: responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim()
        });
      }
    } catch (fetchErr: any) {
      console.error("❌ Fetch to GAS failed (ReadSheet Proxy):", fetchErr);
      return res.status(504).json({
        error: "Gateway Timeout: Could not reach Google Apps Script",
        message: fetchErr.message
      });
    }
  } catch (err: any) {
    console.error("Proxy error (ReadSheet):", err);
    return res.status(500).json({
      error: "Lỗi nội bộ hệ thống trong quá trình Proxy (500)",
      message: err.message
    });
  }
}
