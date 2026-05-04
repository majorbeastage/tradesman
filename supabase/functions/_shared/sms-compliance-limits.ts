/** Mirror `src/lib/smsComplianceLimits.ts` / `api/_smsComplianceLimits.ts` for automated notify SMS. */

export const SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS = 280

const SMS_AUTOMATED_PREFIX = "Tradesman: "

export function clampAutomatedNotifyInnerText(raw: string): string {
  const t = typeof raw === "string" ? raw.trim() : ""
  if (t.length <= SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS) return t
  return `${t.slice(0, SMS_AUTOMATED_NOTIFY_INNER_MAX_CHARS - 1).trimEnd()}…`
}

export function buildAutomatedNotifySmsBody(inner: string): string {
  return `${SMS_AUTOMATED_PREFIX}${clampAutomatedNotifyInnerText(inner)}`
}
