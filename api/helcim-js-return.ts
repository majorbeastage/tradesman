/**
 * POST target for Helcim.js after a transaction. The Payments page submits the form into a hidden
 * same-origin iframe so the SPA is not unloaded. This handler returns a minimal HTML document that
 * postMessages structured fields to window.parent.
 *
 * Do not treat this endpoint as authoritative for billing — Helcim webhooks + Payment API are.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"

function parseUrlEncodedBody(req: VercelRequest): Record<string, string> {
  const raw = req.body as unknown
  if (raw == null || raw === "") return {}
  if (Buffer.isBuffer(raw)) {
    return Object.fromEntries(new URLSearchParams(raw.toString("utf8")))
  }
  if (typeof raw === "string") {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v
      else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0]
    }
    return out
  }
  return {}
}

function pick(fields: Record<string, string>, key: string): string {
  const v = fields[key]
  return typeof v === "string" ? v : ""
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST, OPTIONS").json({ error: "Method not allowed" })
    return
  }

  const fields = parseUrlEncodedBody(req)
  const responseRaw = pick(fields, "response")
  const responseNum = responseRaw === "" ? null : Number(responseRaw)

  const payload = {
    source: "tradesman-helcim-js" as const,
    response: Number.isFinite(responseNum as number) ? (responseNum as number) : null,
    responseMessage: pick(fields, "responseMessage"),
    noticeMessage: pick(fields, "noticeMessage"),
    transactionId: pick(fields, "transactionId"),
    type: pick(fields, "type"),
    amount: pick(fields, "amount"),
    currency: pick(fields, "currency"),
    cardType: pick(fields, "cardType"),
    cardExpiry: pick(fields, "cardExpiry"),
    cardNumberMasked: pick(fields, "cardNumber"),
    cardToken: pick(fields, "cardToken"),
    approvalCode: pick(fields, "approvalCode"),
    orderNumber: pick(fields, "orderNumber"),
    customerCode: pick(fields, "customerCode"),
    date: pick(fields, "date"),
    time: pick(fields, "time"),
  }

  const json = JSON.stringify(payload).replace(/</g, "\\u003c")

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>Payment result</title></head>
<body><script>
(function(){
  try {
    var p = ${json};
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(p, "*");
    }
  } catch (e) {}
})();
<\/script></body></html>`

  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").setHeader("Cache-Control", "no-store").send(html)
}
