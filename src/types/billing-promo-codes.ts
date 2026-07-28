/** platform_settings key for signup billing promo codes. */

export const BILLING_PROMO_CODES_KEY = "tradesman_billing_promo_codes"

/** sessionStorage key when a homepage CTA pre-fills signup promo (generic). */
export const SIGNUP_PROMO_CODE_STORAGE_KEY = "tradesman_signup_promo_code"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type BillingPromoCode = {
  id: string
  /** Uppercase code entered at signup. */
  code: string
  description: string
  active: boolean
  /** 0–100 percent off while the benefit period covers signup day. */
  percent_off: number
  /** First day the discount applies (inclusive), YYYY-MM-DD. */
  benefit_start: string
  /** Last day the discount applies (inclusive), YYYY-MM-DD. */
  benefit_end: string
  /** First day normal billing resumes — stored as billing_payment_due_date on signup. */
  billing_resume_date?: string
  /** When true, only valid on new signups (default true). */
  new_signups_only?: boolean
  /** Code may be entered starting this date (inclusive). */
  redeemable_from?: string
  /** Code may be entered through this date (inclusive). */
  redeemable_until?: string
  /**
   * When set with `max_credit_usd`: plans with monthly price at or below this cap get `percent_off`;
   * plans above the cap receive a dollar credit up to `max_credit_usd`.
   */
  monthly_price_cap_usd?: number
  /** Max dollar credit for plans above `monthly_price_cap_usd`. */
  max_credit_usd?: number
  /** Show a homepage campaign badge while the offer is redeemable. */
  show_homepage_banner?: boolean
  /** Show promo code field on the public signup form (default true). */
  show_on_signup?: boolean
  created_at?: string
  updated_at?: string
}

export type BillingPromoCodesStore = {
  codes: BillingPromoCode[]
}

/** No active campaign by default (JULY250 removed). */
export const DEFAULT_BILLING_PROMO_CODES_STORE: BillingPromoCodesStore = {
  codes: [],
}

export function normalizePromoCodeInput(raw: string): string {
  return raw.trim().toUpperCase()
}

function parseDateField(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const t = raw.trim()
  return DATE_RE.test(t) ? t : ""
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

function parseOnePromo(raw: unknown): BillingPromoCode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : ""
  const code = normalizePromoCodeInput(typeof o.code === "string" ? o.code : "")
  const description = typeof o.description === "string" ? o.description.trim() : ""
  const benefit_start = parseDateField(o.benefit_start)
  const benefit_end = parseDateField(o.benefit_end)
  if (!id || !code || !benefit_start || !benefit_end) return null
  // Retired July 2026 campaign — ignore even if still present in platform_settings.
  if (code === "JULY250") return null
  const billing_resume_date = parseDateField(o.billing_resume_date)
  const redeemable_from = parseDateField(o.redeemable_from)
  const redeemable_until = parseDateField(o.redeemable_until)
  const monthly_price_cap_usd =
    typeof o.monthly_price_cap_usd === "number" && Number.isFinite(o.monthly_price_cap_usd)
      ? Math.max(0, o.monthly_price_cap_usd)
      : undefined
  const max_credit_usd =
    typeof o.max_credit_usd === "number" && Number.isFinite(o.max_credit_usd) ? Math.max(0, o.max_credit_usd) : undefined
  return {
    id,
    code,
    description,
    active: o.active !== false,
    percent_off: clampPercent(typeof o.percent_off === "number" ? o.percent_off : Number(o.percent_off)),
    benefit_start,
    benefit_end,
    billing_resume_date: billing_resume_date || undefined,
    new_signups_only: o.new_signups_only !== false,
    redeemable_from: redeemable_from || undefined,
    redeemable_until: redeemable_until || undefined,
    monthly_price_cap_usd,
    max_credit_usd,
    show_homepage_banner: o.show_homepage_banner === true,
    show_on_signup: o.show_on_signup === false ? false : true,
    created_at: typeof o.created_at === "string" ? o.created_at : undefined,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : undefined,
  }
}

export function parseBillingPromoCodesStore(raw: unknown): BillingPromoCodesStore {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { codes: [] }
  }
  const o = raw as Record<string, unknown>
  const list = o.codes
  if (!Array.isArray(list) || list.length === 0) {
    return { codes: [] }
  }
  const codes = list.map(parseOnePromo).filter(Boolean) as BillingPromoCode[]
  return { codes }
}

export function newPromoCodeDraft(): BillingPromoCode {
  const stamp = new Date().toISOString().slice(0, 10)
  return {
    id: `promo-${crypto.randomUUID().slice(0, 8)}`,
    code: "",
    description: "",
    active: true,
    percent_off: 100,
    benefit_start: stamp,
    benefit_end: stamp,
    billing_resume_date: stamp,
    new_signups_only: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    show_on_signup: true,
  }
}
