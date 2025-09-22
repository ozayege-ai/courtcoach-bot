// /api/telegram.js
export default async function handler(req, res) {
  try {
    return res.status(200).json({ ok: true, note: "minimal handler reached" });
  } catch (e) {
    return res.status(200).json({ ok: true });
  }
}
