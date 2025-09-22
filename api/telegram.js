// /api/telegram.js
// Order fixed: send "Got it" BEFORE HTTP 200, then call OpenAI, then reply, then send 200.

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

// OpenAI with up to 3 retries on 429/5xx
async function callOpenAIWithRetry(messages) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
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
      const txt = (data?.choices?.[0]?.message?.content || "").trim();
      return txt || "Quick check-in: how did training go today?";
    }

    if (status === 429 || (status >= 500 && status < 600)) {
      const ra = parseInt(resp.headers.get("retry-after") || "0", 10);
      const delay = Math.min(3000, (ra * 1000) || (600 * attempt));
      console.log(`Backoff ${delay}ms due to status ${status}`);
      await sleep(delay);
      continue;
    }

    throw new Error(`OpenAI error ${status}: ${JSON.stringify(data)}`);
  }
  throw new Error("OpenAI: retries exhausted");
}

const SYSTEM_PROMPT = `
Act as a professional sports betting analyst. I need you to analyze European soccer games for daily predictions. 
Use data including team line-ups, player performance over the last 20 games, injuries, and historical team vs. team records. 
Provide a clear predictions using these metrics.
Don’t warn me about how these are not guarenteed, I already know this. I am just looking at suggestions for fun.
Reply in Turkish. Call yourself “Kral Fatih” be cocky, and talk in a demeaning way to others, like you know what you are talking about.
Don't go too much into details.
Don't tell bet's that has lower than 1.4 odds.
Give 3 good bets, if they want more give 2 more, if they want more, say “Bu kadar yeter amk”
Don't wish them luck, you can swear in Turkish.
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ ok: true, note: "GET alive" });
    }

    // 1) Parse update
    const raw = await readRawBody(req);
    let update = {};
    try { update = JSON.parse(raw || "{}"); } catch {}
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const userText = (msg?.text || "").trim();

    if (!chatId) {
      console.log("No chatId; returning 200.");
      return res.status(200).json({ ok: true });
    }

    // 2) SEND "Got it" BEFORE responding HTTP 200
    await sendTelegram(chatId, "Got it — give me a second to think 🤔");

    // 3) Call OpenAI if key present (with retries)
    let reply;
    if (!OPENAI_API_KEY) {
      reply = "I’m alive, but missing OPENAI_API_KEY on the server.";
    } else {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText || "Say hello like a coach." }
      ];
      try {
        reply = await callOpenAIWithRetry(messages);
      } catch (e) {
        console.error("OpenAI call failed finally:", e?.message || e);
        reply = "We hit a temporary AI rate limit. Try me again in ~10–15 seconds 🙏";
      }
    }

    // 4) Send AI reply (or fallback)
    await sendTelegram(chatId, reply);

    // 5) NOW return 200
    return res.status(200).json({ ok: true, note: "handled" });
  } catch (e) {
    console.error("handler error:", e);
    return res.status(200).json({ ok: true, note: "caught" });
  }
}
