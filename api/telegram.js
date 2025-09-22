// /api/telegram.js
// Uses Node 18's built-in fetch. No imports needed.

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

// read raw POST body safely
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    // Always respond to GETs so you can check the endpoint
    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "handler alive (GET)" });
    }

    // 1) Read raw Telegram JSON
    const raw = await readRawBody(req);
    // Log a tiny bit so we can see it in Vercel
    console.log("POST length:", raw ? raw.length : 0);

    // 2) Parse JSON
    let update = {};
    try {
      update = JSON.parse(raw || "{}");
    } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(200).json({ ok: true, note: "bad json" });
    }

    // 3) Extract chat + text
    const msg = update && update.message;
    const chatId = msg && msg.chat && msg.chat.id;
    const text = (msg && msg.text ? msg.text : "").trim().toLowerCase();

    if (chatId && TELEGRAM_BOT_TOKEN) {
      const reply = (text === "echo")
        ? "Echo ✅ — end-to-end path confirmed."
        : "I’m online ✅ — send 'echo' to confirm.";

      // 4) Send a reply back to Telegram
      const r = await fetch(TG("sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply })
      });

      if (!r.ok) {
        const t = await r.text();
        console.error("sendMessage failed:", r.status, t);
      } else {
        console.log("sendMessage ok:", r.status);
      }
    } else {
      console.log("No chatId or missing TELEGRAM_BOT_TOKEN.");
    }

    // 5) Acknowledge to stop Telegram retries
    return res.status(200).json({ ok: true, note: "handled" });
  } catch (e) {
    console.error("Handler error:", e);
    // Still return 200 so Telegram doesn't retry
    return res.status(200).json({ ok: true, note: "caught error" });
  }
}
