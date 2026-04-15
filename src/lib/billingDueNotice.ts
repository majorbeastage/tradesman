import type { BillingProfileMetadata } from "./billingProfileMetadata"

export type BillingDueDashboardNotice =
  | { kind: "due_today"; dueIso: string }
  | { kind: "past_due"; dueIso: string; daysPast: number }

function localTodayYyyyMmDd(): string {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, "0")
  const d = String(n.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** First YYYY-MM-DD from an ISO timestamp, or null. */
function isoDatePrefixFromTimestamp(iso: string | undefined): string | null {
  const t = (iso ?? "").trim()
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t)
  return m ? m[1]! : null
}

/**
 * In-app dashboard alert: payment **due today** or **past due** (not future “due in N days”).
 * Uses `billing_payment_due_date` (YYYY-MM-DD) vs local calendar day and `billing_last_success_at` date
 * ≥ due date to mean “paid for this due” (admin should advance due after each cycle).
 */
export function computeBillingDueDashboardNotice(b: BillingProfileMetadata): BillingDueDashboardNotice | null {
  if (b.billing_automation_paused === true) return null
  const due = (b.billing_payment_due_date ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null

  const today = localTodayYyyyMmDd()
  const last = isoDatePrefixFromTimestamp(b.billing_last_success_at)
  const paidForDue = Boolean(last && last >= due)

  if (paidForDue) return null
  if (today < due) return null

  if (today === due) return { kind: "due_today", dueIso: due }

  const [y0, m0, d0] = due.split("-").map(Number)
  const dueStart = new Date(y0, m0 - 1, d0)
  const [y1, m1, d1] = today.split("-").map(Number)
  const todayStart = new Date(y1, m1 - 1, d1)
  const daysPast = Math.max(1, Math.round((todayStart.getTime() - dueStart.getTime()) / 86_400_000))
  return { kind: "past_due", dueIso: due, daysPast }
}
