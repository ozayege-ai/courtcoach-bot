// /api/telegram.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

export default async function handler(req, res) {
  try {
    // Log method
    console.log("Incoming request method:", req.method);

    // Read raw body (Telegram JSON)
    const rawBody = await new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => { resolve(body); });
      req.on("error", (err) => { reject(err); });
    });

    console.log("Raw body length:", rawBody ? rawBody.length : 0);

    // Parse JSON safely
    let update = {};
    try {
      update = JSON.parse(rawBody || "{}");
    } catch (e) {
      console.error("JSON parse error:", e);
      // Acknowledge to stop Telegram retries
      return res.status(200).json({ ok: true, note: "bad json, but acknowledged" });
    }

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = (msg?.text || "").trim().toLowerCase();

    // If we got a chat id, try to reply
    if (chatId && TELEGRAM_BOT_TOKEN) {
      const replyText = (text === "echo")
        ? "Echo ✅ — webhook path working end-to-end"
        : "I’m online ✅ — send 'echo' to confirm.";

      const tgRes = await fetch(TELEGRAM_API("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: replyText })
      });

      if (!tgRes.ok) {
        const errText = await tgRes.text();
