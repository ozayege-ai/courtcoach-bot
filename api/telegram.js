// /api/telegram.js
// Verbose debug: log token length, raw body, parsed keys, chatId, and sendMessage status.

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (ch) => { body += ch; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function sendTelegram(chatId, text) {
  try {
    const r = await fetch(TG("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    console.log("sendMessage status:", r.status);
    if (!r.ok) {
      const t = await r.text();
      console.error("sendMessage failed:", r.status, t);
    }
  } catch (e) {
    console.error("sendMessage threw:", e);
  }
}

export default async function handler(req, res) {
  try {
    const tokenLen = TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.length : 0;
    console.log("Handler start. Method:", req.method, "Token length:", tokenLen);

    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "GET ok" });
    }

    const raw = await readRawBody(req);
    console.log("Raw length:", raw ? raw.length : 0);

    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch (e) {
      console.error("JSON parse error:", e);
    }

    const keys = update ? Object.keys(update) : [];
    console.log("Update keys:", keys);

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = (msg?.text || "").trim();
    console.log("chatId:", chatId, "text:", text);

    // Always ACK so Telegram stops retries
    res.status(200).json({ ok: true, note: "ack" });

    if (!chatId) {
      console.error("No chatId parsed from update.");
      return;
    }
    if (!TELEGRAM_BOT_TOKEN) {
      console.error("Missing TELEGRAM_BOT_TOKEN at runtime.");
      return;
    }

    await sendTelegram(chatId, "Immediate ping ✅ (debug)");
  } catch (e) {
    console.error("Handler error:", e);
    // Do not respond again; we already sent 200 above or will below.
    try { return res.status(200).json({ ok: true }); } catch {}
  }
}
