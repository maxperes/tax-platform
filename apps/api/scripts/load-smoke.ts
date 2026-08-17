/**
 * Lightweight concurrency smoke for chat admission / rate limits.
 * Usage (API running locally with auth token):
 *   CHAT_TOKEN=... SESSION_ID=... pnpm --filter @tax-platform/api exec tsx scripts/load-smoke.ts
 *
 * This is not a full thousands-user load test; it verifies 429 shedding under burst.
 */
const base = process.env.API_BASE || "http://127.0.0.1:4000";
const token = process.env.CHAT_TOKEN || "";
const sessionId = process.env.SESSION_ID || "";
const concurrency = Number(process.env.CONCURRENCY || 50);

if (!token || !sessionId) {
  console.error("Set CHAT_TOKEN and SESSION_ID");
  process.exit(1);
}

async function one(i: number) {
  const res = await fetch(`${base}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content: `load-smoke ping ${i}` })
  });
  return res.status;
}

const started = Date.now();
const statuses = await Promise.all(
  Array.from({ length: concurrency }, (_, i) => one(i))
);
const counts = statuses.reduce<Record<string, number>>((acc, s) => {
  acc[String(s)] = (acc[String(s)] ?? 0) + 1;
  return acc;
}, {});
console.log(
  JSON.stringify({ ms: Date.now() - started, concurrency, counts }, null, 2)
);
