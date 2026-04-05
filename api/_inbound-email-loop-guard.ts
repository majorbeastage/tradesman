/**
 * Prevents Resend ↔ Tradesman forward loops. Mirror: supabase/functions/_shared/inbound-email-loop-guard.ts
 *
 * File name is prefixed with _ so Vercel does not count this as a separate Serverless Function (Hobby limit: 12).
 */

export const TRADESMAN_INBOUND_FORWARD_HEADER = "X-Tradesman-Inbound-Forward"

export function normalizeResendHeaderMap(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    const key = k.toLowerCase()
    if (typeof v === "string" && v.trim()) {
      out[key] = v.trim()
    } else if (Array.isArray(v)) {
      const parts = v.filter((x): x is string => typeof x === "string" && x.trim())
      if (parts.length) out[key] = parts.join(", ")
    }
  }
  return out
}

export type InboundSuppressResult =
  | { suppressed: false }
  | { suppressed: true; reason: string }

export function shouldSuppressInboundEmail(params: {
  subject: string
  headers: Record<string, string>
  fromEmail: string
  forwardToEmail: string | null | undefined
}): InboundSuppressResult {
  const subj = params.subject.trim()
  if (/^\[Tradesman\]\s*Fwd:/i.test(subj)) {
    return { suppressed: true, reason: "tradesman_forward_subject_echo" }
  }

  const h = params.headers
  const loopHdr = h["x-tradesman-inbound-forward"] || h["x-tradesman-loop-guard"]
  if (loopHdr && String(loopHdr).trim()) {
    return { suppressed: true, reason: "tradesman_loop_header" }
  }

  const forwardTo = (params.forwardToEmail || "").trim().toLowerCase()
  if (forwardTo && forwardTo === params.fromEmail) {
    return { suppressed: true, reason: "sender_is_forward_mailbox" }
  }

  return { suppressed: false }
}

export function shouldSkipForwardCopy(params: {
  forwardTo: string
  matchedTo: string
  fromEmail: string
}): InboundSuppressResult {
  const to = params.forwardTo.trim().toLowerCase()
  if (!to) return { suppressed: false }
  if (to === params.matchedTo.trim().toLowerCase()) {
    return { suppressed: true, reason: "forward_target_is_business_inbox" }
  }
  if (to === params.fromEmail) {
    return { suppressed: true, reason: "forward_target_is_sender" }
  }
  return { suppressed: false }
}

export function forwardHeadersForTradesmanCopy(): Record<string, string> {
  return { [TRADESMAN_INBOUND_FORWARD_HEADER]: "1" }
}
