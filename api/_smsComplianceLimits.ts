/**
 * SMS outbound limits for /api/outbound-messages (SMS).
 * Mirror footer math in `src/lib/smsComplianceLimits.ts`.
 */

export const SMS_OUTBOUND_BODY_HARD_MAX_CHARS = 1600

export const DEFAULT_SMS_POLICIES_URL = "https://www.tradesman-us.com/sms"

export type SmsOutboundComplianceVariant = "none" | "manual_long" | "twilio_short"

function truncateBusinessDisplayName(name: string): string {
  const t = name.trim() || "Your business"
  return t.length > 48 ? `${t.slice(0, 45)}…` : t
}

export function buildLongManualFirstSmsFooter(businessDisplayName: string, policiesUrl?: string): string {
  const short = truncateBusinessDisplayName(businessDisplayName)
  const policies = (policiesUrl ?? DEFAULT_SMS_POLICIES_URL).trim() || DEFAULT_SMS_POLICIES_URL
  return `\n\n-- Msg from ${short} via tradesman-us.com.\nReply STOP to opt out. Msg & data rates may apply.\nPolicies: ${policies}`
}

export function buildShortTwilioInitiatedSmsFooter(businessDisplayName: string): string {
  const short = truncateBusinessDisplayName(businessDisplayName)
  return `\n\nReply STOP to opt out. ${short} via tradesman-us.com`
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
  const biz = params.businessDisplayName.trim() || "Your business"
  if (params.variant === "none") {
    return truncateOutboundSmsHard(clampSmsUserPortion(params.rawBody, SMS_OUTBOUND_BODY_HARD_MAX_CHARS))
  }
  const footer =
    params.variant === "manual_long"
      ? buildLongManualFirstSmsFooter(biz, params.smsPolicyUrl)
      : buildShortTwilioInitiatedSmsFooter(biz)
  const maxUser = Math.max(60, SMS_OUTBOUND_BODY_HARD_MAX_CHARS - footer.length - 4)
  const user = clampSmsUserPortion(params.rawBody, maxUser)
  return truncateOutboundSmsHard(`${user}${footer}`)
}
