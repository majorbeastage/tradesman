import type { VercelRequest, VercelResponse } from "@vercel/node"
import { applyStripeCheckoutSession, stripeSecretKey, verifyStripeWebhook } from "./_stripeBilling.js"
import { firstEnv } from "./_communications.js"

export const config = { api: { bodyParser: false } }

async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === "string") return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8")
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  const secret = firstEnv("STRIPE_WEBHOOK_SECRET", "STRIPE_BILLING_WEBHOOK_SECRET")
  if (!secret || !stripeSecretKey()) {
    return res.status(503).json({ error: "Stripe webhook is not configured." })
  }
  try {
    const raw = await readRawBody(req)
    const signature = String(req.headers["stripe-signature"] ?? "")
    if (!verifyStripeWebhook(raw, signature, secret)) {
      return res.status(401).json({ error: "Invalid Stripe signature." })
    }
    const event = JSON.parse(raw) as { type?: string; data?: { object?: Record<string, unknown> } }
    if (event.type === "checkout.session.completed" && event.data?.object) {
      await applyStripeCheckoutSession(event.data.object)
    }
    return res.status(200).json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook failed."
    console.error("[stripe-billing-webhook]", message)
    return res.status(500).json({ error: message })
  }
}
