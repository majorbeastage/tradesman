/**
 * Internal hook for post-inbound email automation (OOO + conversation auto-reply).
 * Called from Vercel incoming-email and Supabase resend-inbound (via HTTP).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, pickFirstString } from "./_communications.js"
import { runInboundEmailPostInsertHooks } from "./_inboundEmailHooks.js"

function authorized(req: VercelRequest): boolean {
  const secret = firstEnv("INBOUND_EMAIL_HOOKS_SECRET", "SUPABASE_SERVICE_ROLE_KEY")
  if (!secret) return false
  const header = req.headers["x-tradesman-inbound-hooks"]
  const bearer = typeof req.headers.authorization === "string" ? req.headers.authorization.replace(/^Bearer\s+/i, "") : ""
  return header === secret || bearer === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" })
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" })

  const body = (req.body ?? {}) as Record<string, unknown>
  const userId = pickFirstString(body.userId).trim()
  const customerId = pickFirstString(body.customerId).trim()
  const customerEmail = pickFirstString(body.customerEmail).trim()
  if (!userId || !customerId || !customerEmail) {
    return res.status(400).json({ error: "userId, customerId, and customerEmail required" })
  }

  const supabase = createServiceSupabase()
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" })

  try {
    const result = await runInboundEmailPostInsertHooks(supabase, {
      userId,
      customerId,
      customerEmail,
      conversationId: pickFirstString(body.conversationId) || null,
      leadId: pickFirstString(body.leadId) || null,
      inboundBody: pickFirstString(body.inboundBody) || "",
      subject: pickFirstString(body.subject) || undefined,
    })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[inbound-email-hooks]", msg)
    return res.status(500).json({ error: msg })
  }
}
