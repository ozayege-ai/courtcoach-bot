import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MODEL_NAME = process.env.MODEL_NAME || "gpt-4o-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "180", 10);
const DAILY_TOKEN_CAP = parseInt(process.env.DAILY_TOKEN_CAP || "120000", 10);
const MONTHLY_TOKEN_CAP = parseInt(process.env.MONTHLY_TOKEN_CAP || "3000000", 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = (m) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${m}`;

const SYSTEM_PROMPT = `
You are "CourtCoach" — a supportive, concise fitness coach + friend.
User: 30, 5'11, ~196→180 goal, basketball Tue/Thu nights, simple gym access.
Keep replies 2–5 sentences, practical, 1 action item max, no guilt.
Training cals ~2200 (gym/hoops), recovery ~2000; ~170g protein/day.
Late games: suggest light protein snack for recovery + sleep.
Ask 1 simple follow-up only if needed for clarity.
`;

const estimateTokens = (s="") => Math.ceil(s.length / 4);

async function sendTelegram(chatId, text) {
  await fetch(TELEGRAM_API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function getUser(chatId) {
  const user_id = String(chatId);
  const { data } = await supabase.from("users").select("*").eq("user_id", user_id).single();
  return data;
}

async function upsertUser(user_id, patch) {
  const { data: existing } = await supabase.from("users").select("*").eq("user_id", user_id).single();
  if (!existing) {
    const { data } = await supabase.from("users").insert({ user_id, ...patch }).select("*").single();
    return data;
  }
  const { data } = await supabase.from("users").update(patch).eq("user_id", user_id).select("*").single();
  return data;
}

async function addMessage(user_id, role, content) {
  await supabase.from("messages").insert({ user_id, role, content });
}

async function recentMessages(user_id, limit=12) {
  const { data } = await supabase
    .from("messages").select("role,content,created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

function newDay(dateA, dateBIso) {
  if (!dateBIso) return true;
  const a = dateA.toISOString().slice(0,10);
  const b = dateBIso.slice(0,10);
  return a !== b;
}
function newMonth(dateA, dateBIso) {
  if (!dateBIso) return true;
  const a = dateA.toISOString().slice(0,7);
  const b = dateBIso.slice(0,7);
  return a !== b;
}

async function resetBudgetsIfNeeded(user_id) {
  const now = new Date();
  let u = await getUser(user_id);
  if (!u) {
    u = await upsertUser(user_id, {
      daily_tokens_used: 0, monthly_tokens_used: 0,
      daily_reset_at: now.toISOString(), monthly_reset_at: now.toISOString(),
      memory: ""
    });
    return u;
  }
  const patch = {};
  if (newDay(now, u.daily_reset_at)) { patch.daily_tokens_used = 0; patch.daily_reset_at = now.toISOString(); }
  if (newMonth(now, u.monthly_reset_at)) { patch.monthly_tokens_used = 0; patch.monthly_reset_at = now.toISOString(); }
  return Object.keys(patch).length ? await upsertUser(user_id, patch) : u;
}

async function maybeSummarize(user_id) {
  // Cheap memory compression: summarize every ~8th message
  const { data } = await supabase
    .from("messages").select("role,content").eq("user_id", user_id)
    .order("created_at", { ascending: true }).limit(100);
  if (!data || data.length < 30) return;

  const long = data.map(m => `${m.role}: ${m.content}`).join("\n").slice(-6000);
  if (long.length < 2500) return;

  const summary = await callChat([
    { role: "system", content: "Summarize user goals, schedule, preferences, constraints, and recurring tips in 5 bullets, ≤120 tokens." },
    { role: "user", content: long }
  ], 140);
  await upsertUser(user_id, { memory: summary.content });
}

async function callChat(messages, maxTokens=MAX_TOKENS) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_NAME, messages, max_tokens: maxTokens, temperature: 0.7 })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn’t generate a response.";
  const tokens = json.usage?.total_tokens || estimateTokens(JSON.stringify(messages) + content);
  return { content, tokens };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const update = req.body;
    const msg = update?.message;
    if (!msg?.text) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;
    const user_id = String(chatId);
    const text = msg.text.trim();

    // Reset budgets if day/month changed
    let u = await resetBudgetsIfNeeded(user_id);

    // Hard caps
    if (u.monthly_tokens_used >= MONTHLY_TOKEN_CAP) {
      await sendTelegram(chatId, "Hey! Tiny pause so we stay under budget this month. We’ll pick up again soon 🙏");
      return res.status(200).json({ ok: true });
    }
    if (u.daily_tokens_used >= DAILY_TOKEN_CAP) {
      await sendTelegram(chatId, "Quick pause to stay on budget today. Back at it tomorrow 💪");
      return res.status(200).json({ ok: true });
    }

    await addMessage(user_id, "user", text);

    // Occasionally compress memory (cheap)
    if (Math.random() < 0.125) await maybeSummarize(user_id);

    const memoryBlock = u.memory ? [{ role: "system", content: `Memory: ${u.memory}` }] : [];
    const history = await recentMessages(user_id, 10);
    const convo = [{ role: "system", content: SYSTEM_PROMPT }, ...memoryBlock, ...history];

    let reply = "Hmm, I hit a snag—try again?";
    try {
      const { content, tokens } = await callChat(convo);
      reply = content;

      // Update budgets
      await upsertUser(user_id, {
        daily_tokens_used: (u.daily_tokens_used || 0) + tokens,
        monthly_tokens_used: (u.monthly_tokens_used || 0) + tokens
      });
    } catch (e) {
      reply = "I had trouble calling the model just now—mind sending that again?";
    }

    await addMessage(user_id, "assistant", reply);
    await sendTelegram(chatId, reply);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: true });
  }
}
