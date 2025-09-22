// /api/telegram.js
export default async function handler(req, res) {
  try {
    // Minimal: always return 200 so Telegram stops reporting 500s
    return res.status(200).json({ ok: true, note: "minimal handler reached" });
  } catch (e) {
    console.error("Minimal handler error:", e);
    return res.status(200).json({ ok: true });
  }
}
