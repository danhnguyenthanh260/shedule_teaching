import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

    // 🔒 FORCE INJECT SECRET FROM ENVIRONMENT
    const finalPayload = {
      ...payload,
      secret: GAS_SECRET || payload.secret
    };

    console.log(`🔗 Proxy calling GAS: ${GAS_URL} (Action: ${payload.action || 'readSheet'})`);
    
    const response = await fetch(GAS_URL, {
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
      console.error(`❌ JSON Parse Error. Body starts with: ${responseText.substring(0, 200)}`);
      
      let cleanDetail = responseText;
      const errMatch = responseText.match(/class="errorMessage">([^<]+)</i);
      if (errMatch) {
         cleanDetail = `Google Error: ${errMatch[1]}`;
      } else {
         cleanDetail = responseText.replace(/<[^>]+>/g, ' ').substring(0, 250).trim();
      }

      return res.status(500).json({
        error: "Google returned non-JSON response (likely HTML error)",
        detail: cleanDetail
      });
    }
  } catch (err: any) {
    console.error("Proxy error:", err);
    return res.status(500).json({
      error: "Lỗi nội bộ hệ thống trong quá trình đọc Sheet (Proxy 500)",
      message: err.message
    });
  }
}
