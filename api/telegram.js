// /api/telegram.js
export default async function handler(req, res) {
  try {
    // Log method so we can see POSTs in Vercel logs
    console.log("Incoming request method:", req.method);

    // Read raw body to avoid parsing issues
    const rawBody = await new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => resolve(body));
      req.o
