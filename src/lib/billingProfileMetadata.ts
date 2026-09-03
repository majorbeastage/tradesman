import { isBillingProductTypeId, type BillingProductTypeId } from "./billingProductTypes"

/** Billing / Helcim fields stored on `profiles.metadata` (JSON). */

export type BillingProfileMetadata = {
  /** When true, Helcim webhooks do not change `account_disabled` (manual grace or dispute). */
  billing_automation_paused?: boolean
  /** Helcim customer code — must match webhook / transaction for automations. */
  billing_helcim_customer_code?: string
  /** ISO timestamp of last successful payment applied by automation. */
  billing_last_success_at?: string
  /** Next (or current) payment due date as `YYYY-MM-DD` (local calendar); set in Admin → Billing. */
  billing_payment_due_date?: string
  /**
   * Calendar day of month to keep when a received payment advances the due date (1–31).
   * Shorter months clamp to the last day, then return to this day when the month allows it.
   */
  billing_payment_due_day?: number
  /**
   * Optional per-user Helcim hosted pay / portal URL override.
   * When unset, the app uses `VITE_HELCIM_PAYMENT_PORTAL_URL` from the build (one URL for the whole org).
   */
  helcim_pay_portal_url?: string
  /** Primary product line for billing (admin sheet). */
  billing_product_type?: BillingProductTypeId | string
  /** Extra product lines (same catalog as primary). */
  billing_additional_products?: string[]
  /** Promo code redeemed at signup (if any). */
  billing_promo_code?: string
  /** Percent off applied at signup when benefit window covered signup day. */
  billing_promo_percent_off?: number
  /** Last day of promo benefit period (YYYY-MM-DD). */
  billing_promo_benefit_end?: string
  /** ISO timestamp when promo was applied at signup. */
  billing_promo_applied_at?: string
  /** Admin-set one-time or override charge (USD) for the next payment — takes precedence over catalog sum. */
  billing_custom_charge_usd?: number
  /** Verified subscription payments recorded by Tradesman (newest first). */
  billing_payment_history_v1?: BillingPaymentHistoryEntry[]
}

export type BillingPaymentHistoryEntry = {
  at: string
  amountUsd?: number
  transactionId?: string
  orderNumber?: string
  note?: string
  /** Due date on file before this payment advanced it — used to revert without guessing month-end. */
  dueDateBefore?: string
  revertedAt?: string
  problemAt?: string
  problemNote?: string
}

/**
 * Choose which hosted pay URL to load: **build env first** (hands-off, one URL for everyone),
 * then optional per-profile override.
 */
export function resolveHelcimPayPortalBaseUrl(
  envPortalUrl: string | null | undefined,
  profilePortalUrl: string | null | undefined,
): string | null {
  const fromEnv = (envPortalUrl ?? "").trim()
  if (fromEnv) return fromEnv
  const fromProfile = (profilePortalUrl ?? "").trim()
  return fromProfile || null
}

/**
 * If Helcim’s hosted page accepts a customer in the query string, this scopes a **shared** portal URL
 * to the right payer. **Confirm the parameter name with Helcim support** (we send `customerCode` to match API/webhooks).
 */
export function appendHelcimCustomerQueryToPayPortalUrl(
  baseUrl: string,
  customerCode: string | null | undefined,
): string {
  const code = (customerCode ?? "").trim()
  if (!code) return baseUrl
  try {
    const u = new URL(baseUrl)
    if (!u.searchParams.has("customerCode")) u.searchParams.set("customerCode", code)
    return u.toString()
  } catch {
    return baseUrl
  }
}

/** Trim and add https:// when the host was pasted without a scheme. Returns null if empty or not URL-like. */
export function normalizeHelcimPayPortalUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^\/\//.test(t)) return `https:${t}`
  if (!/:\/\//.test(t) && /^[\w.-]+\.\w{2,}(\/|$)/i.test(t)) return `https://${t}`
  return null
}

export function helcimPayPortalUrlAllowsIframe(url: string): boolean {
  return /^https:\/\//i.test(url.trim())
}

export function parseBillingMetadata(metadata: unknown): BillingProfileMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const m = metadata as Record<string, unknown>
  const out: BillingProfileMetadata = {}
  if (m.billing_automation_paused === true) out.billing_automation_paused = true
  if (typeof m.billing_helcim_customer_code === "string" && m.billing_helcim_customer_code.trim()) {
    out.billing_helcim_customer_code = m.billing_helcim_customer_code.trim()
  }
  if (typeof m.billing_last_success_at === "string" && m.billing_last_success_at.trim()) {
    out.billing_last_success_at = m.billing_last_success_at.trim()
  }
  if (typeof m.billing_payment_due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.billing_payment_due_date.trim())) {
    out.billing_payment_due_date = m.billing_payment_due_date.trim()
  }
  if (typeof m.billing_payment_due_day === "number" && Number.isInteger(m.billing_payment_due_day) && m.billing_payment_due_day >= 1 && m.billing_payment_due_day <= 31) {
    out.billing_payment_due_day = m.billing_payment_due_day
  } else if (out.billing_payment_due_date) {
    out.billing_payment_due_day = Number(out.billing_payment_due_date.slice(8, 10))
  }
  if (typeof m.helcim_pay_portal_url === "string" && m.helcim_pay_portal_url.trim()) {
    out.helcim_pay_portal_url = m.helcim_pay_portal_url.trim()
  }
  if (typeof m.billing_product_type === "string" && m.billing_product_type.trim()) {
    const t = m.billing_product_type.trim()
    if (isBillingProductTypeId(t)) out.billing_product_type = t
  }
  if (Array.isArray(m.billing_additional_products)) {
    const add = m.billing_additional_products
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x): x is BillingProductTypeId => isBillingProductTypeId(x))
    if (add.length) out.billing_additional_products = add
  }
  if (typeof m.billing_promo_code === "string" && m.billing_promo_code.trim()) {
    out.billing_promo_code = m.billing_promo_code.trim().toUpperCase()
  }
  if (typeof m.billing_promo_percent_off === "number" && Number.isFinite(m.billing_promo_percent_off)) {
    out.billing_promo_percent_off = Math.min(100, Math.max(0, Math.round(m.billing_promo_percent_off)))
  }
  if (typeof m.billing_promo_benefit_end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.billing_promo_benefit_end.trim())) {
    out.billing_promo_benefit_end = m.billing_promo_benefit_end.trim()
  }
  if (typeof m.billing_promo_applied_at === "string" && m.billing_promo_applied_at.trim()) {
    out.billing_promo_applied_at = m.billing_promo_applied_at.trim()
  }
  if (typeof m.billing_custom_charge_usd === "number" && Number.isFinite(m.billing_custom_charge_usd) && m.billing_custom_charge_usd >= 0) {
    out.billing_custom_charge_usd = Math.round(m.billing_custom_charge_usd * 100) / 100
  }
  if (Array.isArray(m.billing_payment_history_v1)) {
    const hist = m.billing_payment_history_v1
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null
        const e = row as Record<string, unknown>
        const at = typeof e.at === "string" ? e.at.trim() : ""
        if (!at) return null
        const entry: BillingPaymentHistoryEntry = { at }
        if (typeof e.amountUsd === "number" && Number.isFinite(e.amountUsd)) entry.amountUsd = e.amountUsd
        if (typeof e.transactionId === "string" && e.transactionId.trim()) entry.transactionId = e.transactionId.trim()
        if (typeof e.orderNumber === "string" && e.orderNumber.trim()) entry.orderNumber = e.orderNumber.trim()
        if (typeof e.note === "string" && e.note.trim()) entry.note = e.note.trim()
        if (typeof e.dueDateBefore === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.dueDateBefore.trim())) {
          entry.dueDateBefore = e.dueDateBefore.trim()
        }
        if (typeof e.revertedAt === "string" && e.revertedAt.trim()) entry.revertedAt = e.revertedAt.trim()
        if (typeof e.problemAt === "string" && e.problemAt.trim()) entry.problemAt = e.problemAt.trim()
        if (typeof e.problemNote === "string" && e.problemNote.trim()) entry.problemNote = e.problemNote.trim()
        return entry
      })
      .filter((x): x is BillingPaymentHistoryEntry => x != null)
    if (hist.length) out.billing_payment_history_v1 = hist.slice(0, 100)
  }
  return out
}

export function mergeBillingIntoProfileMetadata(
  prev: Record<string, unknown>,
  patch: Partial<BillingProfileMetadata>,
): Record<string, unknown> {
  const next = { ...prev }
  if (patch.billing_automation_paused === true) next.billing_automation_paused = true
  else if (patch.billing_automation_paused === false) delete next.billing_automation_paused

  if (patch.billing_helcim_customer_code != null) {
    const t = patch.billing_helcim_customer_code.trim()
    if (t) next.billing_helcim_customer_code = t
    else delete next.billing_helcim_customer_code
  }
  if (patch.billing_last_success_at != null) {
    const t = patch.billing_last_success_at.trim()
    if (t) next.billing_last_success_at = t
    else delete next.billing_last_success_at
  }
  if (patch.billing_payment_due_date !== undefined) {
    const t = typeof patch.billing_payment_due_date === "string" ? patch.billing_payment_due_date.trim() : ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      next.billing_payment_due_date = t
      if (patch.billing_payment_due_day === undefined) {
        next.billing_payment_due_day = Number(t.slice(8, 10))
      }
    } else {
      delete next.billing_payment_due_date
      if (patch.billing_payment_due_day === undefined) delete next.billing_payment_due_day
    }
  }
  if (patch.billing_payment_due_day !== undefined) {
    if (
      typeof patch.billing_payment_due_day === "number" &&
      Number.isInteger(patch.billing_payment_due_day) &&
      patch.billing_payment_due_day >= 1 &&
      patch.billing_payment_due_day <= 31
    ) {
      next.billing_payment_due_day = patch.billing_payment_due_day
    } else {
      delete next.billing_payment_due_day
    }
  }
  if (patch.helcim_pay_portal_url != null) {
    const t = patch.helcim_pay_portal_url.trim()
    if (t) next.helcim_pay_portal_url = t
    else delete next.helcim_pay_portal_url
  }

  if (patch.billing_product_type !== undefined) {
    const t = typeof patch.billing_product_type === "string" ? patch.billing_product_type.trim() : ""
    if (t && isBillingProductTypeId(t)) next.billing_product_type = t
    else delete next.billing_product_type
  }
  if (patch.billing_additional_products !== undefined) {
    const arr = patch.billing_additional_products.filter((x) => typeof x === "string" && isBillingProductTypeId(x.trim()))
    if (arr.length) next.billing_additional_products = arr.map((x) => x.trim())
    else delete next.billing_additional_products
  }
  if (patch.billing_promo_code !== undefined) {
    const t = patch.billing_promo_code.trim().toUpperCase()
    if (t) next.billing_promo_code = t
    else delete next.billing_promo_code
  }
  if (patch.billing_promo_percent_off !== undefined) {
    if (typeof patch.billing_promo_percent_off === "number" && Number.isFinite(patch.billing_promo_percent_off)) {
      next.billing_promo_percent_off = Math.min(100, Math.max(0, Math.round(patch.billing_promo_percent_off)))
    } else delete next.billing_promo_percent_off
  }
  if (patch.billing_promo_benefit_end !== undefined) {
    const t = patch.billing_promo_benefit_end.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) next.billing_promo_benefit_end = t
    else delete next.billing_promo_benefit_end
  }
  if (patch.billing_promo_applied_at !== undefined) {
    const t = patch.billing_promo_applied_at.trim()
    if (t) next.billing_promo_applied_at = t
    else delete next.billing_promo_applied_at
  }
  if (patch.billing_custom_charge_usd !== undefined) {
    if (typeof patch.billing_custom_charge_usd === "number" && Number.isFinite(patch.billing_custom_charge_usd) && patch.billing_custom_charge_usd >= 0) {
      next.billing_custom_charge_usd = Math.round(patch.billing_custom_charge_usd * 100) / 100
    } else {
      delete next.billing_custom_charge_usd
    }
  }
  if (patch.billing_payment_history_v1 !== undefined) {
    if (Array.isArray(patch.billing_payment_history_v1) && patch.billing_payment_history_v1.length) {
      next.billing_payment_history_v1 = patch.billing_payment_history_v1.slice(0, 100)
    } else {
      delete next.billing_payment_history_v1
    }
  }
  return next
}

function ymdParts(dueDate: string): { y: number; m: number; d: number } | null {
  const t = dueDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)), d: Number(t.slice(8, 10)) }
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

function isoDatePrefix(iso: string | undefined): string | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((iso ?? "").trim())
  return m?.[1]
}

/**
 * Add whole calendar months, keeping `preferDay` (or the source day). If that day does not exist
 * in the target month (Jan 31 → February), use the last day of that month.
 */
export function addCalendarMonthsYmd(dueDate: string | undefined, months: number, preferDay?: number): string | undefined {
  const parts = ymdParts(dueDate ?? "")
  if (!parts) return undefined
  const day =
    typeof preferDay === "number" && Number.isInteger(preferDay) && preferDay >= 1 && preferDay <= 31
      ? preferDay
      : parts.d
  const idx = parts.y * 12 + (parts.m - 1) + months
  const y = Math.floor(idx / 12)
  const m = ((idx % 12) + 12) % 12 + 1
  const d = Math.min(day, daysInMonth(y, m))
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Advance YYYY-MM-DD due date by one calendar month when payment clears (same day next month). */
export function advanceBillingDueDate(dueDate: string | undefined, preferDay?: number): string | undefined {
  return addCalendarMonthsYmd(dueDate, 1, preferDay) ?? dueDate
}

export function rollbackBillingDueDate(dueDate: string | undefined, preferDay?: number): string | undefined {
  return addCalendarMonthsYmd(dueDate, -1, preferDay) ?? dueDate
}

function historyHasOpenTxn(hist: BillingPaymentHistoryEntry[], transactionId: string): boolean {
  const tx = transactionId.trim()
  if (!tx) return false
  return hist.some((e) => e.transactionId?.trim() === tx && !e.revertedAt)
}

function historyHasOpenOrder(hist: BillingPaymentHistoryEntry[], orderNumber: string): boolean {
  const order = orderNumber.trim()
  if (!order) return false
  return hist.some((e) => e.orderNumber?.trim() === order && !e.revertedAt)
}

function alreadyRecordedOpenPayment(hist: BillingPaymentHistoryEntry[], entry: Pick<BillingPaymentHistoryEntry, "transactionId" | "orderNumber">): boolean {
  const tx = entry.transactionId?.trim() ?? ""
  const order = entry.orderNumber?.trim() ?? ""
  return (tx !== "" && historyHasOpenTxn(hist, tx)) || (order !== "" && historyHasOpenOrder(hist, order))
}

export function appendBillingPaymentHistory(
  prev: Record<string, unknown>,
  entry: BillingPaymentHistoryEntry,
): Record<string, unknown> {
  const billing = parseBillingMetadata(prev)
  const existing = billing.billing_payment_history_v1 ?? []
  if (alreadyRecordedOpenPayment(existing, entry)) {
    return prev
  }
  const hist = [entry, ...existing].slice(0, 100)
  return mergeBillingIntoProfileMetadata(prev, { billing_payment_history_v1: hist })
}

/** Mark a Tradesman bill paid: last paid, advance due date one calendar month, append history. No-op if this Helcim txn is already on file. */
export function applyReceivedBillingPayment(
  prev: Record<string, unknown>,
  entry: Omit<BillingPaymentHistoryEntry, "dueDateBefore"> & { at: string },
): Record<string, unknown> {
  const billing = parseBillingMetadata(prev)
  if (alreadyRecordedOpenPayment(billing.billing_payment_history_v1 ?? [], entry)) {
    return prev
  }
  const dueBefore = billing.billing_payment_due_date
  const paidYmd = isoDatePrefix(entry.at)
  const preferDay =
    billing.billing_payment_due_day ??
    ymdParts(dueBefore ?? "")?.d ??
    ymdParts(paidYmd ?? "")?.d
  const base = dueBefore || paidYmd
  const nextDue = advanceBillingDueDate(base, preferDay)
  const next = mergeBillingIntoProfileMetadata(prev, {
    billing_last_success_at: entry.at,
    ...(nextDue ? { billing_payment_due_date: nextDue } : {}),
    ...(typeof preferDay === "number" ? { billing_payment_due_day: preferDay } : {}),
  })
  return appendBillingPaymentHistory(next, {
    ...entry,
    ...(dueBefore ? { dueDateBefore: dueBefore } : {}),
  })
}

export function revertReceivedBillingPayment(
  prev: Record<string, unknown>,
  opts?: { transactionId?: string; at?: string },
): { next: Record<string, unknown>; reverted: BillingPaymentHistoryEntry | null } {
  const billing = parseBillingMetadata(prev)
  const hist = [...(billing.billing_payment_history_v1 ?? [])]
  const wantTx = opts?.transactionId?.trim() ?? ""
  const wantAt = opts?.at?.trim() ?? ""
  const idx = hist.findIndex((e) => {
    if (e.revertedAt) return false
    if (wantTx) return e.transactionId?.trim() === wantTx
    if (wantAt) return e.at === wantAt
    return true
  })
  if (idx < 0) return { next: prev, reverted: null }
  const nowIso = new Date().toISOString()
  hist[idx] = { ...hist[idx]!, revertedAt: nowIso }
  const remaining = hist.filter((e) => !e.revertedAt)
  const restoredDue = hist[idx]!.dueDateBefore || rollbackBillingDueDate(billing.billing_payment_due_date)
  const next = mergeBillingIntoProfileMetadata(prev, {
    billing_payment_history_v1: hist,
    billing_last_success_at: remaining[0]?.at ?? "",
    ...(restoredDue ? { billing_payment_due_date: restoredDue } : {}),
  })
  return { next, reverted: hist[idx]! }
}

export function markBillingPaymentProblem(
  prev: Record<string, unknown>,
  opts: { transactionId?: string; originalTransactionId?: string; orderNumber?: string; note: string; at?: string },
): { next: Record<string, unknown>; matched: boolean } {
  const billing = parseBillingMetadata(prev)
  const hist = [...(billing.billing_payment_history_v1 ?? [])]
  const wantTx = opts.transactionId?.trim() ?? ""
  const wantOrig = opts.originalTransactionId?.trim() ?? ""
  const wantOrder = opts.orderNumber?.trim() ?? ""
  const idx = hist.findIndex((e) => {
    if (e.revertedAt) return false
    const rowTx = e.transactionId?.trim() ?? ""
    const rowOrder = e.orderNumber?.trim() ?? ""
    if (wantTx && rowTx === wantTx) return true
    if (wantOrig && rowTx === wantOrig) return true
    if (wantOrder && rowOrder === wantOrder) return true
    return false
  })
  if (idx < 0) return { next: prev, matched: false }
  hist[idx] = {
    ...hist[idx]!,
    problemAt: opts.at || new Date().toISOString(),
    problemNote: opts.note,
  }
  return {
    next: mergeBillingIntoProfileMetadata(prev, { billing_payment_history_v1: hist }),
    matched: true,
  }
}

export function billingClientHasOpenPaymentProblem(billing: BillingProfileMetadata): boolean {
  return (billing.billing_payment_history_v1 ?? []).some((e) => Boolean(e.problemAt) && !e.revertedAt)
}
