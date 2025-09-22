// /api/telegram.js
// Minimal AI coach with retry on 429 and quick acknowledgements.

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || "gpt-4o-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "120", 10);
const TG = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

// Small sleep helper
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
  if (!r.ok) {
    const t = await r.text();
    console.error("sendMessage failed:", r.status, t);
  } else {
    console.log("sendMessage ok:", r.status);
  }
}

// OpenAI call with up to 3 retries for 429/5xx
async function callOpenAIWithRetry(messages) {
  const maxAttempts = 3;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
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
      return (data?.choices?.[0]?.message?.content || "Sorry, momentary glitch.").trim();
    }

    // Handle 429 or transient 5xx with short backoff (fits Vercel ~10s)
    if (status === 429 || (status >= 500 && status < 600)) {
      // Respect Retry-After if present (cap to 3s to avoid timeouts)
      const ra = parseInt(resp.headers.get("retry-after") || "0", 10);
      const backoff = Math.min(3000, (ra * 1000) || (600 * attempt)); // 0.6s, 1.2s, 1.8s
      await sleep(backoff);
      continue;
    }

    // Non-retryable error
    throw new Error(`OpenAI error ${status}: ${JSON.stringify(data)}`);
  }
  throw new Error("OpenAI: retries exhausted");
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
    try { update = JSON.parse(raw || "{}"); } catch {}

    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const userText = (msg?.text || "").trim();

    // Immediately acknowledge to stop Telegram retries (we’ll still send a DM)
    res.status(200).json({ ok: true, note: "ack" });

    // If we can’t reply, just stop
    if (!chatId) {
      console.log("No chatId; nothing to do.");
      return;
    }

    // If no OpenAI key, at least say hello
    if (!OPENAI_API_KEY) {
      await sendTelegram(chatId, "I’m alive, but missing OPENAI_API_KEY on the server.");
      return;
    }

    // Build messages
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText || "Say hello like a coach." }
    ];

    let reply = "";
    try {
      reply = await callOpenAIWithRetry(messages);
    } catch (e) {
      console.error("OpenAI call failed finally:", e?.message || e);
      reply = "We hit a temporary AI rate limit. Try me again in ~10–15 seconds 🙏";
    }

    await sendTelegram(chatId, reply);
  } catch (e) {
    console.error("Handler error (outer):", e);
    // no response here (we already sent 200)
  }
}
