// /api/telegram.js
import fetch from "node-fetch";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

async function sendTelegram(chatId, text) {
  await fetch(TELEGRAM_API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// Read raw request body to avoid body-parsing issues
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  // Always respond 200 fast so Telegram doesn't retry
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const raw = await readBody(req);            // <— KEY FIX
    const update = JSON.parse(raw || "{}");
    const msg = update?.message;

    // If Telegram sent a message, reply
    if (msg?.chat?.id) {
      const chatId = msg.chat.id;
      const text = msg?.text?.trim().toLowerCase() || "";

      if (text === "echo") {
        await sendTelegram(chatId, "Echo ✅ — webhook + body parsing + sendMessage all OK");
      } else {
        await sendTelegram(chatId, "I’m online ✅ — send 'echo' to confirm.");
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Handler error:", e);
    return res.status(200).json({ ok: true });
  }
}
