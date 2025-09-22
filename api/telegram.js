// /api/telegram.js

export default async function handler(req, res) {
  try {
    // Log the HTTP method so we can see POSTs arriving
    console.log("Incoming request method:", req.method);

    // Read the raw body (Telegram sends JSON via POST)
    const rawBody = await new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => { resolve(body); });
      req.on("error", (err) => { reject(err); });
    });

    console.log("Raw body length:", rawBody ? rawBody.length : 0);

    // Always return 200 OK so Telegram doesn't record a 500
    return res.status(200).json({ ok: true, note: "logger reached" });
  } catch (e) {
    console.error("Logger handler error:", e);
    // Still return 200 so Telegram doesn't retry
    return res.status(200).json({ ok: true, note: "caught error" });
  }
}
