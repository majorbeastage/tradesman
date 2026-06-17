/**
 * POST /api/platform-tools?__route=send-onboarding-welcome
 * Called from complete-signup after paid signup (service secret).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"
import { sendOnboardingWelcomeEmail } from "./_sendOnboardingWelcomeEmail.js"

type Body = {
  user_id?: string
  email?: string
  display_name?: string
}

export async function handleSendOnboardingWelcome(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const body = (req.body ?? {}) as Body
  const emailStr = String(body.email ?? "").trim()
  const displayStr = String(body.display_name ?? "").trim() || emailStr
  if (!emailStr) {
    res.status(400).json({ error: "email required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const result = await sendOnboardingWelcomeEmail({ service, toEmail: emailStr, displayName: displayStr })
  if (!result.ok && !result.skipped) {
    res.status(502).json({ error: result.error ?? "Send failed" })
    return
  }
  res.status(200).json({ ok: true, skipped: result.skipped === true })
}
