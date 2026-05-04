/**
 * SMS length guardrails for portal sends and automated notify SMS.
 * Keep behavior aligned with `api/_smsComplianceLimits.ts`.
 */

import type { SmsFirstComplianceVariant } from "./smsFirstOutboundCompliance"

/** Inner text cap for automated notify SMS (before compliance tail). */
export const SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS = 280

/** Practical cap for a single Twilio outbound body (concatenated segments). */
export const SMS_OUTBOUND_BODY_HARD_MAX_CHARS = 1600

/** Public SMS / consent page (short URL for footers; same content as /sms-consent). */
export const DEFAULT_SMS_POLICIES_URL = "https://www.tradesman-us.com/sms"

/** Unified tail for first outbound SMS (manual vs Twilio-contact variants use the same footer now). */
export const SMS_COMPLIANCE_TAIL_DEFAULT =
  "\n\nReply STOP to opt out, HELP for help. Msg sent via Tradesman Systems."

export const SMS_COMPLIANCE_TAIL_APPOINTMENT =
  "\n\nReply STOP to opt out or HELP for assistance. Msg sent via Tradesman Systems."

export type SmsComplianceTailKind = "default" | "appointment"

export function getSmsComplianceTail(kind: SmsComplianceTailKind = "default"): string {
  return kind === "appointment" ? SMS_COMPLIANCE_TAIL_APPOINTMENT : SMS_COMPLIANCE_TAIL_DEFAULT
}

/** @deprecated Unified footer — kept for call-site compatibility. */
export function buildLongManualFirstSmsFooter(_businessDisplayName: string, _policiesUrl?: string): string {
  return SMS_COMPLIANCE_TAIL_DEFAULT
}

/** @deprecated Unified footer — kept for call-site compatibility. */
export function buildShortTwilioInitiatedSmsFooter(_businessDisplayName: string): string {
  return SMS_COMPLIANCE_TAIL_DEFAULT
}

export function buildSmsFirstComplianceFooter(
  variant: SmsFirstComplianceVariant,
  businessDisplayName: string,
  policiesUrl?: string,
): string {
  void variant
  void businessDisplayName
  void policiesUrl
  return SMS_COMPLIANCE_TAIL_DEFAULT
}

export function maxUserCharsForFirstSmsVariant(
  variant: SmsFirstComplianceVariant,
  businessDisplayName: string,
  policiesUrl?: string,
): number {
  void variant
  void businessDisplayName
  void policiesUrl
  const footer = SMS_COMPLIANCE_TAIL_DEFAULT
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

/** Automated SMS (calendar/quote/tools): inner operational text + compliance tail (no “Tradesman:” prefix). */
export function buildAutomatedNotifySmsBody(inner: string, tail: SmsComplianceTailKind = "default"): string {
  const tailStr = getSmsComplianceTail(tail)
  return `${clampAutomatedNotifyInnerText(inner)}${tailStr}`
}
