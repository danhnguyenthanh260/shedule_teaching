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

  const { action, url, startRow } = req.query;
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

    if (method === "GET") {
      if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
      }
      const queryParams = new URLSearchParams();
      if (action) queryParams.append("action", action as string);
      if (url) queryParams.append("url", url as string);
      if (startRow) queryParams.append("startRow", startRow as string);
      
      targetUrl += (targetUrl.includes("?") ? "&" : "?") + queryParams.toString();
    } else {
      // For POST
      fetchOptions.body = JSON.stringify(req.body);
      fetchOptions.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("Proxy error:", err);
    return res.status(500).json({
      error: "Failed to fetch from Apps Script proxy",
      detail: err.message,
    });
  }
}
