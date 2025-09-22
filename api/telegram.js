// /api/telegram.js
export default async function handler(req, res) {
  try {
    console.log("Minimal handler alive. Method:", req.method);
    return res.status(200).json({ ok: true, note: "minimal handler reached" });
  } catch (e) {
    console.error("Minimal handler error:", e);
    return res.status(200).json({ ok: true });
  }
}
