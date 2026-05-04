/** Mirror `src/lib/smsComplianceLimits.ts` / `api/_smsComplianceLimits.ts` for automated notify SMS. */

export const SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS = 280

export const SMS_COMPLIANCE_TAIL_DEFAULT =
  "\n\nReply STOP to opt out, HELP for help. Msg sent via Tradesman Systems."

export const SMS_COMPLIANCE_TAIL_APPOINTMENT =
  "\n\nReply STOP to opt out or HELP for assistance. Msg sent via Tradesman Systems."

export type SmsComplianceTailKind = "default" | "appointment"

export function getSmsComplianceTail(kind: SmsComplianceTailKind = "default"): string {
  return kind === "appointment" ? SMS_COMPLIANCE_TAIL_APPOINTMENT : SMS_COMPLIANCE_TAIL_DEFAULT
}

export function clampAutomatedNotifyInnerText(raw: string): string {
  const t = typeof raw === "string" ? raw.trim() : ""
  if (t.length <= SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS) return t
  return `${t.slice(0, SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS - 1).trimEnd()}…`
}

export function buildAutomatedNotifySmsBody(inner: string, tail: SmsComplianceTailKind = "default"): string {
  return `${clampAutomatedNotifyInnerText(inner)}${getSmsComplianceTail(tail)}`
}
