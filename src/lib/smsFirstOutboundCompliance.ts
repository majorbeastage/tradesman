/**
 * Client-side mirror of first-SMS compliance rules (see api/_smsFirstComplianceResolve.ts).
 * Uses the same event shape as communication_events rows loaded in the UI.
 */

export type SmsFirstComplianceVariant = "manual_long" | "twilio_short"

export type CommEventLite = {
  event_type?: string | null
  direction?: string | null
  created_at?: string | null
}

const INBOUND_TWILIO_TYPES = new Set(["sms", "call", "voicemail"])

export function hasOutboundSmsInTimeline(events: CommEventLite[]): boolean {
  return events.some((e) => e.event_type === "sms" && e.direction === "outbound")
}

export function hasInboundTwilioContactInTimeline(events: CommEventLite[]): boolean {
  return events.some((e) => {
    const t = (e.event_type ?? "").trim()
    const d = (e.direction ?? "").trim()
    return INBOUND_TWILIO_TYPES.has(t) && d === "inbound"
  })
}

const TRACKED_FIRST_CONTACT_TYPES = new Set(["sms", "call", "voicemail", "email"])

function isTrackedCommEvent(e: CommEventLite): boolean {
  const t = (e.event_type ?? "").trim()
  const d = (e.direction ?? "").trim()
  return TRACKED_FIRST_CONTACT_TYPES.has(t) && (d === "inbound" || d === "outbound")
}

function sortCommEventsChronologically(events: CommEventLite[]): CommEventLite[] {
  return [...events].sort((a, b) => {
    const ta = Date.parse(String(a.created_at ?? "")) || 0
    const tb = Date.parse(String(b.created_at ?? "")) || 0
    return ta - tb
  })
}

/**
 * Manual SMS opt-in capture (checkbox + consent source) applies only to manually entered contacts.
 * When the customer's first tracked communication is an inbound call or voicemail on your line, skip it.
 */
export function requiresManualSmsOptInRecord(events: CommEventLite[]): boolean {
  const tracked = sortCommEventsChronologically(events.filter(isTrackedCommEvent))
  if (tracked.length === 0) return true
  const first = tracked[0]
  const t = (first.event_type ?? "").trim()
  const d = (first.direction ?? "").trim()
  if (d === "inbound" && (t === "call" || t === "voicemail")) return false
  return true
}

/** First portal-originated SMS to this customer still needs a compliance footer. */
export function needsFirstOutboundSmsCompliance(events: CommEventLite[]): boolean {
  return !hasOutboundSmsInTimeline(events)
}

/**
 * When `needsFirstOutboundSmsCompliance` is true: long footer if no inbound Twilio traffic yet;
 * short footer if they already texted/called your line.
 */
export function resolveSmsFirstComplianceVariant(events: CommEventLite[]): SmsFirstComplianceVariant | null {
  if (!needsFirstOutboundSmsCompliance(events)) return null
  return hasInboundTwilioContactInTimeline(events) ? "twilio_short" : "manual_long"
}
