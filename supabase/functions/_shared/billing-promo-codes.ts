/** Edge-safe promo code helpers (keep in sync with src/lib/billingPromoCodes.ts). */

export type BillingPromoCode = {
  id: string
  code: string
  description: string
  active: boolean
  percent_off: number
  benefit_start: string
  benefit_end: string
  billing_resume_date?: string
  new_signups_only?: boolean
  redeemable_from?: string
  redeemable_until?: string
  monthly_price_cap_usd?: number
  max_credit_usd?: number
  show_homepage_banner?: boolean
}

export const BILLING_PROMO_CODES_KEY = "tradesman_billing_promo_codes"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizePromoCodeInput(raw: string): string {
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
  }
}

export function parseBillingPromoCodesStore(raw: unknown): BillingPromoCode[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.codes)) return []
  return o.codes.map(parseOnePromo).filter(Boolean) as BillingPromoCode[]
}

function localDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isYmdInRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end
}

export function findPromoByCode(codes: BillingPromoCode[], rawCode: string): BillingPromoCode | null {
  const code = normalizePromoCodeInput(rawCode)
  if (!code) return null
  return codes.find((p) => p.active && normalizePromoCodeInput(p.code) === code) ?? null
}

export function validatePromoForSignup(
  promo: BillingPromoCode,
  today: Date = new Date(),
): { ok: true } | { ok: false; message: string } {
  if (!promo.active) return { ok: false, message: "This promo code is no longer active." }
  const todayYmd = localDateYmd(today)
  if (promo.redeemable_from && todayYmd < promo.redeemable_from) {
    return { ok: false, message: "This promo code is not valid yet." }
  }
  if (promo.redeemable_until && todayYmd > promo.redeemable_until) {
    return { ok: false, message: "This promo code has expired." }
  }
  if (promo.new_signups_only === false) {
    return { ok: false, message: "This promo code is not available for new signups." }
  }
  return { ok: true }
}

const PACKAGE_MONTHLY_USD: Record<string, number> = {
  estimate_tools_only: 49.99,
  base: 89.99,
  office_manager_entry: 149.99,
  office_manager_pro: 199.99,
  office_manager_elite: 369.99,
  corporate: 599.99,
}

const PRORATION_CYCLE_DAYS = 30

export function computeSignupProrationUsdEdge(params: {
  packageId: string
  today?: Date
  billDayOfMonth: number
}): { monthlyUsd: number; dueTodayUsd: number } {
  const monthlyUsd = PACKAGE_MONTHLY_USD[params.packageId] ?? 0
  const today = params.today ?? new Date()
  const day = Math.min(28, Math.max(1, Math.floor(params.billDayOfMonth)))
  const billDate = new Date(today.getFullYear(), today.getMonth(), day, 12, 0, 0, 0)
  if (billDate.getTime() <= today.getTime()) billDate.setMonth(billDate.getMonth() + 1)
  const msPerDay = 86400000
  const daysUntilBillDate = Math.max(1, Math.ceil((billDate.getTime() - today.getTime()) / msPerDay))
  const dueTodayUsd = Math.round(((monthlyUsd * daysUntilBillDate) / PRORATION_CYCLE_DAYS) * 100) / 100
  return { monthlyUsd, dueTodayUsd }
}

export function applyPromoToProrationUsd(
  dueTodayUsd: number,
  monthlyUsd: number,
  promo: BillingPromoCode,
  today: Date = new Date(),
): {
  dueTodayUsd: number
  billingResumeDate: string | null
  promoDiscountUsd: number
  promoTier: "full_waiver" | "capped_credit" | "none"
} {
  const todayYmd = localDateYmd(today)
  const inBenefit = isYmdInRange(todayYmd, promo.benefit_start, promo.benefit_end)
  const billingResumeDate = promo.billing_resume_date?.trim() || null
  const baseDue = Math.max(0, dueTodayUsd)

  if (!inBenefit) {
    return { dueTodayUsd: baseDue, billingResumeDate, promoDiscountUsd: 0, promoTier: "none" }
  }

  const cap = promo.monthly_price_cap_usd
  const maxCredit = promo.max_credit_usd
  if (cap != null && maxCredit != null && monthlyUsd > cap) {
    const promoDiscountUsd = Math.min(maxCredit, baseDue)
    return {
      dueTodayUsd: Math.round((baseDue - promoDiscountUsd) * 100) / 100,
      billingResumeDate,
      promoDiscountUsd,
      promoTier: "capped_credit",
    }
  }

  const factor = 1 - promo.percent_off / 100
  const adjusted = Math.round(baseDue * factor * 100) / 100
  return {
    dueTodayUsd: adjusted,
    billingResumeDate,
    promoDiscountUsd: Math.round((baseDue - adjusted) * 100) / 100,
    promoTier: promo.percent_off >= 100 ? "full_waiver" : "none",
  }
}
