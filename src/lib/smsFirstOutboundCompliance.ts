/**
 * Client-side mirror of first-SMS compliance rules (see api/_smsFirstComplianceResolve.ts).
 * Uses the same event shape as communication_events rows loaded in the UI.
 */

export type SmsFirstComplianceVariant = "manual_long" | "twilio_short"

export type CommEventLite = {
  event_type?: string | null
  direction?: string | null
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
