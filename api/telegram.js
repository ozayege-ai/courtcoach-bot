// /api/telegram.js
// Acknowledge 200 immediately, then send a hardcoded DM to verify webhook → sendMessage path.

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

// Your chat id from earlier logs:
const TEST_CHAT_ID = 6563253501;

async function sendTelegram(chatId, text) {
  try {
    const r = await fetch(TG("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
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
    // Always 200 so Telegram stops reporting 500s
    res.status(200).json({ ok: true, note: "ack" });

    // Immediately DM you regardless of body content
    if (TELEGRAM_BOT_TOKEN) {
      await sendTelegram(TEST_CHAT_ID, "Diagnostic ping ✅ (webhook OK)");
    }
  } catch (e) {
    console.error("Handler error:", e);
  }
}
