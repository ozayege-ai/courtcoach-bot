// /api/telegram.js
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

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
    const hasToken = !!TELEGRAM_BOT_TOKEN;
    console.log("Has TELEGRAM_BOT_TOKEN:", hasToken, "length:", TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.length : 0);

    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "handler alive (GET)" });
    }

    const raw = await readRawBody(req);
    console.log("POST length:", raw ? raw.length : 0);

    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch {}
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    console.log("chatId present:", !!chatId);

    if (chatId && hasToken) {
      const reply = "Token present ✅ — attempting sendMessage.";
      const r = await fetch(TG("sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply })
      });
      console.log("sendMessage status:", r.status);
      if (!r.ok) {
        const t = await r.text();
        console.error("sendMessage failed:", r.status, t);
      }
    } else if (!hasToken) {
      console.error("TELEGRAM_BOT_TOKEN is missing in runtime.");
    } else {
      console.error("No chatId found in update.");
    }

    return res.status(200).json({ ok: true, note: "handled" });
  } catch (e) {
    console.error("Handler error:", e);
    return res.status(200).json({ ok: true, note: "caught error" });
  }
}
