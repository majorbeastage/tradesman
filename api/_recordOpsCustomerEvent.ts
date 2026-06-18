/**
 * POST /api/platform-tools?__route=record-ops-customer-event
 * Internal: complete-signup, provision-demo, etc. (service secret header).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"
import { recordAdminOpsCustomerEvent, type AdminOpsCustomerEventKind } from "./_adminOpsCustomerEvent.js"

const KINDS = new Set<AdminOpsCustomerEventKind>([
  "signup_submitted",
  "signup_verified",
  "demo_request",
  "demo_provisioned",
  "support_ticket",
])

export async function handleRecordOpsCustomerEvent(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const secret = firstEnv("COMPLETE_SIGNUP_NOTIFY_SECRET", "ADMIN_SIGNUP_NOTIFY_SECRET").trim()
  const headerSecret = String(req.headers["x-tradesman-signup-notify-secret"] ?? "").trim()
  if (!secret || headerSecret !== secret) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const kind = String(body.kind ?? "").trim() as AdminOpsCustomerEventKind
  const email = String(body.email ?? "").trim()
  const externalId = String(body.externalId ?? "").trim()
  const subject = String(body.subject ?? "").trim()
  const text = String(body.body ?? body.text ?? "").trim()

  if (!KINDS.has(kind) || !email || !externalId || !subject || !text) {
    res.status(400).json({ error: "kind, email, externalId, subject, and body are required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const result = await recordAdminOpsCustomerEvent(service, {
    kind,
    externalId,
    email,
    displayName: typeof body.displayName === "string" ? body.displayName : null,
    subject,
    body: text,
    signupUserId: typeof body.signupUserId === "string" ? body.signupUserId : null,
    ticketId: typeof body.ticketId === "string" ? body.ticketId : null,
    phone: typeof body.phone === "string" ? body.phone : null,
  })

  if (!result.ok) {
    res.status(500).json({ error: result.error ?? "record failed" })
    return
  }

  res.status(200).json({ ok: true, ...result })
}
