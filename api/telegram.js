// /api/telegram.js
// Parse Telegram update safely; reply to the sending chatId.

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
  const r = await fetch(TG("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("sendMessage failed:", r.status, t);
  }
}

export default async function handler(req, res) {
  try {
    // Always ack immediately so Telegram doesn’t retry
    res.status(200).json({ ok: true });

    if (req.method !== "POST") return;

    // Read & parse
    const raw = await readRawBody(req);
    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch {}

    const chatId = update?.message?.chat?.id;
    const text = (update?.message?.text || "").trim().toLowerCase();

    if (!TELEGRAM_BOT_TOKEN || !chatId) return;

    const reply = text === "echo"
      ? "Echo ✅ — body parsed and replied."
      : "I’m online ✅ — send 'echo' to confirm.";

    await sendTelegram(chatId, reply);
  } catch (e) {
    console.error("Handler error:", e);
  }
}
