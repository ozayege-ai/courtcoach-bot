// /api/telegram.js
// FINAL CLEAN MINIMAL: read body -> reply -> return 200. No AI, no DB.

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
    const ok = r.ok ? "ok" : `fail ${r.status}`;
    console.log("sendMessage:", ok);
    if (!r.ok) console.error("sendMessage body:", await r.text());
  } catch (e) {
    console.error("sendMessage threw:", e);
  }
}

export default async function handler(req, res) {
  try {
    // Only handle POSTs from Telegram
    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "GET alive" });
    }

    // 1) Read & parse the Telegram update
    const raw = await readRawBody(req);
    console.log("raw length:", raw?.length || 0);

    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(200).json({ ok: true, note: "bad json" });
    }

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = (msg?.text || "").trim();

    console.log("chatId:", chatId, "text:", text);

    // 2) If we have chatId + token, reply once
    if (chatId && TELEGRAM_BOT_TOKEN) {
      const reply = (text.toLowerCase() === "echo")
        ? "Echo ✅ — minimal handler reply."
        : "I’m online ✅ — send 'echo' to confirm.";
      await sendTelegram(chatId, reply);
    } else {
      console.error("Missing chatId or TELEGRAM_BOT_TOKEN");
    }

    // 3) Always return 200 to Telegram
    return res.status(200).json({ ok: true, note: "handled" });
  } catch (e) {
    console.error("handler error:", e);
    // Still return 200 so Telegram doesn't retry
    return res.status(200).json({ ok: true, note: "caught" });
  }
}
