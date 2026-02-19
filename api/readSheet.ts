import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // ✅ Allow calls from React
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const query = req.query || {};
  const method = req.method;

  try {
    const GAS_URL = process.env.GAS_EXEC_URL;
    if (!GAS_URL) {
      return res.status(500).json({ error: "GAS_EXEC_URL not configured on server" });
    }

    let targetUrl: string = GAS_URL;
    const fetchOptions: any = {
      method: method,
      headers: {}
    };

    const GAS_SECRET = process.env.GAS_SECRET;

    if (method === "GET") {
      const { action, url, startRow } = query;
      if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
      }
      const queryParams = new URLSearchParams();
      if (action) queryParams.append("action", action as string);
      if (url) queryParams.append("url", url as string);
      if (startRow) queryParams.append("startRow", startRow as string);
      
      if (GAS_SECRET) queryParams.append("secret", GAS_SECRET);
      
      targetUrl += (targetUrl.includes("?") ? "&" : "?") + queryParams.toString();
    } else {
      // For POST, inject secret from environment
      let body: any = {};
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : { ...req.body };
      } catch (e) {
        body = { ...req.body };
      }

      // 🛡️ FORCE INJECT SECRET
      if (GAS_SECRET) {
        body.secret = GAS_SECRET;
      }
      
      fetchOptions.body = JSON.stringify(body);
      fetchOptions.headers["Content-Type"] = "application/json";
    }

    console.log(`🔗 Proxy calling GAS: ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);
    
    // Get raw text first to avoid double-consumption issues and to diagnose non-JSON
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`❌ GAS Error: ${response.status} - ${responseText.substring(0, 200)}`);
      
      // Clean up HTML error messages from Google
      let cleanDetail = responseText;
      const errMatch = responseText.match(/class="errorMessage">([^<]+)</i);
      if (errMatch) {
        cleanDetail = `Google Error: ${errMatch[1]}`;
      } else {
        // Strip tags and take first 200 chars
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
        error: "Google returned non-JSON response (likely HTML error/login page)",
        detail: cleanDetail
      });
    }
  } catch (err: any) {
    console.error("Proxy error:", err);
    return res.status(500).json({
      error: "Lỗi nội bộ hệ thống trong quá trình đọc Sheet (Proxy 500)",
      message: err.message,
      hint: err.message?.includes("credentials") ? "Thiếu FIREBASE_SERVICE_ACCOUNT trên Vercel" : "Kiểm tra Vercel Logs để biết chi tiết"
    });
  }
}
