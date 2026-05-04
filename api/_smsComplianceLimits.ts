/**
 * SMS outbound limits for /api/outbound-messages (SMS).
 * Mirror footer math in `src/lib/smsComplianceLimits.ts`.
 */

export const SMS_OUTBOUND_BODY_HARD_MAX_CHARS = 1600

/** @deprecated Long footer no longer embeds a separate policies URL; kept for imports that still pass it. */
export const DEFAULT_SMS_POLICIES_URL = "https://www.tradesman-us.com/sms"

export type SmsOutboundComplianceVariant = "none" | "manual_long" | "twilio_short"

/** First SMS + portal outbound: same tail for “manual” vs prior Twilio contact (A2P examples). */
export const SMS_COMPLIANCE_TAIL_DEFAULT =
  "\n\nReply STOP to opt out, HELP for help. Msg sent via Tradesman Systems."

/** Optional variant for appointment-style confirmations (campaign samples). */
export const SMS_COMPLIANCE_TAIL_APPOINTMENT =
  "\n\nReply STOP to opt out or HELP for assistance. Msg sent via Tradesman Systems."

export type SmsComplianceTailKind = "default" | "appointment"

export function getSmsComplianceTail(kind: SmsComplianceTailKind = "default"): string {
  return kind === "appointment" ? SMS_COMPLIANCE_TAIL_APPOINTMENT : SMS_COMPLIANCE_TAIL_DEFAULT
}

/** @deprecated Use getSmsComplianceTail — long/short footers are unified. */
export function buildLongManualFirstSmsFooter(_businessDisplayName: string, _policiesUrl?: string): string {
  return SMS_COMPLIANCE_TAIL_DEFAULT
}

/** @deprecated Use getSmsComplianceTail — long/short footers are unified. */
export function buildShortTwilioInitiatedSmsFooter(_businessDisplayName: string): string {
  return SMS_COMPLIANCE_TAIL_DEFAULT
}

export function clampSmsUserPortion(raw: string, maxLen: number): string {
  const t = typeof raw === "string" ? raw.trim() : ""
  if (maxLen < 1) return ""
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1).trimEnd()}…`
}

export function truncateOutboundSmsHard(raw: string): string {
  return clampSmsUserPortion(raw, SMS_OUTBOUND_BODY_HARD_MAX_CHARS)
}

export function finalizeOutboundSmsBody(params: {
  rawBody: string
  variant: SmsOutboundComplianceVariant
  businessDisplayName: string
  smsPolicyUrl?: string
}): string {
  if (params.variant === "none") {
    return truncateOutboundSmsHard(clampSmsUserPortion(params.rawBody, SMS_OUTBOUND_BODY_HARD_MAX_CHARS))
  }
  const footer = SMS_COMPLIANCE_TAIL_DEFAULT
  const maxUser = Math.max(60, SMS_OUTBOUND_BODY_HARD_MAX_CHARS - footer.length - 4)
  const user = clampSmsUserPortion(params.rawBody, maxUser)
  return truncateOutboundSmsHard(`${user}${footer}`)
}
