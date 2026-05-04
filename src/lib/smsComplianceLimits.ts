/**
 * SMS length guardrails for portal sends and automated notify SMS.
 * Keep behavior aligned with `api/_smsComplianceLimits.ts`.
 */

import type { SmsFirstComplianceVariant } from "./smsFirstOutboundCompliance"

/** Inner text of automated "Tradesman: …" quote/calendar SMS (content after the prefix). */
export const SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS = 280

/** Practical cap for a single Twilio outbound body (concatenated segments). */
export const SMS_OUTBOUND_BODY_HARD_MAX_CHARS = 1600

/** Default policies link in long first-SMS footer (public SMS consent page). */
/** Public SMS / consent page (short URL for footers; same content as /sms-consent). */
export const DEFAULT_SMS_POLICIES_URL = "https://www.tradesman-us.com/sms"

const SMS_AUTOMATED_PREFIX = "Tradesman: "

function truncateBusinessDisplayName(name: string): string {
  const t = name.trim() || "Your business"
  return t.length > 48 ? `${t.slice(0, 45)}…` : t
}

/** Long footer: manual customer entry / no prior inbound Twilio contact. */
export function buildLongManualFirstSmsFooter(businessDisplayName: string, policiesUrl?: string): string {
  const short = truncateBusinessDisplayName(businessDisplayName)
  const policies = (policiesUrl ?? DEFAULT_SMS_POLICIES_URL).trim() || DEFAULT_SMS_POLICIES_URL
  return `\n\n-- Msg from ${short} via tradesman-us.com.\nReply STOP to opt out. Msg & data rates may apply.\nPolicies: ${policies}`
}

/** Short footer: customer already contacted this business via the Twilio line (inbound sms/call/voicemail). */
export function buildShortTwilioInitiatedSmsFooter(businessDisplayName: string): string {
  const short = truncateBusinessDisplayName(businessDisplayName)
  return `\n\nReply STOP to opt out. ${short} via tradesman-us.com`
}

export function buildSmsFirstComplianceFooter(
  variant: SmsFirstComplianceVariant,
  businessDisplayName: string,
  policiesUrl?: string,
): string {
  return variant === "manual_long"
    ? buildLongManualFirstSmsFooter(businessDisplayName, policiesUrl)
    : buildShortTwilioInitiatedSmsFooter(businessDisplayName)
}

export function maxUserCharsForFirstSmsVariant(
  variant: SmsFirstComplianceVariant,
  businessDisplayName: string,
  policiesUrl?: string,
): number {
  const footer = buildSmsFirstComplianceFooter(variant, businessDisplayName, policiesUrl)
  return Math.max(60, SMS_OUTBOUND_BODY_HARD_MAX_CHARS - footer.length - 4)
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

export function clampAutomatedNotifyInnerText(raw: string): string {
  const t = typeof raw === "string" ? raw.trim() : ""
  if (t.length <= SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS) return t
  return `${t.slice(0, SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS - 1).trimEnd()}…`
}

export function buildAutomatedNotifySmsBody(inner: string): string {
  return `${SMS_AUTOMATED_PREFIX}${clampAutomatedNotifyInnerText(inner)}`
}
