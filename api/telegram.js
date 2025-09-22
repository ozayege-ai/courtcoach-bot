// /api/telegram.js
// Immediate "got it" reply + OpenAI with retry + verbose logs

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || "gpt-4o-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "120", 10);
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  console.log("sendMessage status:", r.status);
  if (!r.ok) {
    const t = await r.text();
    console.error("sendMessage failed:", r.status, t);
  }
}

async function callOpenAIWithRetry(messages) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    console.log(`OpenAI attempt ${attempt} status:`, status, "usage:", data?.usage || {});

    if (resp.ok) {
      const text = (data?.choices?.[0]?.message?.content || "").trim();
      return text || "Quick check-in: how did training go today?";
    }

    if (status === 429 || (status >= 500 && status < 600)) {
      const ra = parseInt(resp.headers.get("retry-after") || "0", 10);
      const backoff = Math.min(3000, (ra * 1000) || (600 * attempt));
      console.log(`Backoff ${backoff}ms due to status ${status}`);
      await sleep(backoff);
      continue;
    }

    throw new Error(`OpenAI error ${status}: ${JSON.stringify(data)}`);
  }
  throw new Error("OpenAI: retries exhausted");
}

const SYSTEM_PROMPT = `
You are "CourtCoach" — a friendly, concise fitness coach + friend.
User: 30, 5'11", ~196→180 goal; plays basketball Tue/Thu nights; simple gym.
Reply in 2–5 sentences, practical, one action max, no guilt.
Training ~2200 kcal; recovery ~2000; ~170g protein/day.
After late games, suggest a light high-protein snack for recovery + sleep.
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "handler alive (GET)" });
    }

    const raw = await readRawBody(req);
    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch {}
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const userText = (msg?.text || "").trim();

    // Always ACK HTTP 200 immediately
    res.status(200).json({ ok: true, note: "ack" });

    if (!chatId) {
      console.log("No chatId; stopping.");
      return;
    }

    // 1) Immediate confirmation to Telegram (proves sendMessage path works)
    await sendTelegram(chatId, "Got it — give me a second to think 🤔");

    // 2) If no OpenAI key, say so and stop
    if (!OPENAI_API_KEY) {
      await sendTelegram(chatId, "I’m alive, but missing OPENAI_API_KEY on the server.");
      return;
    }

    // 3) Build messages and call OpenAI
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText || "Say hello like a coach." }
    ];

    let reply = "";
    try {
      reply = await callOpenAIWithRetry(messages);
    } catch (e) {
      console.error("OpenAI call failed finally:", e?.message || e);
      reply = "We hit a temporary AI rate limit. Try again in ~10–15 seconds 🙏";
    }

    // 4) Send the AI reply
    await sendTelegram(chatId, reply);
  } catch (e) {
    console.error("Handler error:", e);
  }
}
