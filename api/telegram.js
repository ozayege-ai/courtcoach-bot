// /api/telegram.js
// Minimal AI coach reply using OpenAI (no DB yet)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || "gpt-4o-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "180", 10);
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
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
  } else {
    console.log("sendMessage ok:", r.status);
  }
}

async function callOpenAI(messages) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      temperature: 0.7,
      max_tokens: MAX_TOKENS
    })
  });
  const status = resp.status;
  let data = null;
  try { data = await resp.json(); } catch {}
  console.log("OpenAI status:", status, "usage:", data?.usage || {});
  if (!resp.ok) throw new Error(`OpenAI error ${status}: ${JSON.stringify(data)}`);
  return (data?.choices?.[0]?.message?.content || "Sorry, I couldn’t think of a reply just now.").trim();
}

const SYSTEM_PROMPT = `
You are "CourtCoach" — a friendly, concise fitness coach + friend. Use Turkish Slang too.
User: 30, 5'11", ~196 lb aiming 180, basketball Tue/Thu nights, simple gym.
Give 2–5 sentences, practical, 1 action max, you can swear for fun. Make it engaging
Training calories ~2200; recovery ~2000; protein ~170g/day.
After late games, suggest a light high-protein snack. Use a warm tone. Use Turkish Slang too.
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "handler alive (GET)" });
    }

    const raw = await readRawBody(req);
    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch (e) {}

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const userText = (msg?.text || "").trim();

    if (!chatId) {
      console.log("No chatId; ack only.");
      return res.status(200).json({ ok: true });
    }

    // If OpenAI key missing, at least respond
    if (!OPENAI_API_KEY) {
      await sendTelegram(chatId, "I’m alive, but missing OPENAI_API_KEY on the server.");
      return res.status(200).json({ ok: true });
    }

    // Compose messages for OpenAI
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText || "Say hello like a coach." }
    ];

    let reply = "Hmm, hit a snag.";
    try {
      reply = await callOpenAI(messages);
    } catch (e) {
      console.error("OpenAI call failed:", e?.message || e);
      reply = "I hit a snag calling the AI — try again in a moment?";
    }

    await sendTelegram(chatId, reply);
    return res.status(200).json({ ok: true, note: "handled" });
  } catch (e) {
    console.error("Handler error:", e);
    return res.status(200).json({ ok: true, note: "caught error" });
  }
}
