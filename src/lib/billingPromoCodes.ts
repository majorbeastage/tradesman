import type { ProductPackageId } from "./productPackages"
import { computeSignupProrationUsd } from "./subscriptionEntitlements"
import { describeJuly250ForMonthlyPrice, isJuly250CampaignVisible, JULY250_PROMO_CODE } from "./july250Promo"
import {
  normalizePromoCodeInput,
  parseBillingPromoCodesStore,
  type BillingPromoCode,
  type BillingPromoCodesStore,
} from "../types/billing-promo-codes"

export { normalizePromoCodeInput, parseBillingPromoCodesStore, isJuly250CampaignVisible, JULY250_PROMO_CODE }
export type { BillingPromoCode, BillingPromoCodesStore }

function localDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function isYmdInRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end
}

export function findPromoByCode(store: BillingPromoCodesStore, rawCode: string): BillingPromoCode | null {
  const code = normalizePromoCodeInput(rawCode)
  if (!code) return null
  return store.codes.find((p) => p.active && normalizePromoCodeInput(p.code) === code) ?? null
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

export function shouldShowHomepagePromoBanner(store: BillingPromoCodesStore, today: Date = new Date()): BillingPromoCode | null {
  if (!isJuly250CampaignVisible(today)) return null
  const july = store.codes.find(
    (p) => p.active && p.show_homepage_banner && normalizePromoCodeInput(p.code) === JULY250_PROMO_CODE,
  )
  if (!july) return null
  const check = validatePromoForSignup(july, today)
  return check.ok ? july : null
}

export type PromoDiscountResult = {
  dueTodayUsd: number
  discountUsd: number
  tier: "full_waiver" | "capped_credit" | "none"
  detailMessage: string | null
}

/** Compute signup-day discount when signup day is inside the promo benefit window. */
export function computePromoSignupDiscount(params: {
  dueTodayUsd: number
  monthlyUsd: number
  promo: BillingPromoCode
  inBenefit: boolean
}): PromoDiscountResult {
  const baseDue = Math.max(0, params.dueTodayUsd)
  if (!params.inBenefit) {
    return { dueTodayUsd: baseDue, discountUsd: 0, tier: "none", detailMessage: null }
  }

  const cap = params.promo.monthly_price_cap_usd
  const maxCredit = params.promo.max_credit_usd

  if (cap != null && maxCredit != null && params.monthlyUsd > cap) {
    const discountUsd = Math.min(maxCredit, baseDue)
    const dueTodayUsd = Math.round((baseDue - discountUsd) * 100) / 100
    return {
      dueTodayUsd,
      discountUsd,
      tier: "capped_credit",
      detailMessage: `Up to $${maxCredit.toFixed(0)} July credit on plans over $${cap.toFixed(0)}/mo. Billing resumes ${params.promo.billing_resume_date ?? "after July"}.`,
    }
  }

  const factor = 1 - params.promo.percent_off / 100
  const dueTodayUsd = Math.round(baseDue * factor * 100) / 100
  const discountUsd = Math.round((baseDue - dueTodayUsd) * 100) / 100
  return {
    dueTodayUsd,
    discountUsd,
    tier: params.promo.percent_off >= 100 ? "full_waiver" : "full_waiver",
    detailMessage:
      params.promo.percent_off >= 100
        ? `No billing for the July benefit period on eligible plans. Billing resumes ${params.promo.billing_resume_date ?? "after July"}.`
        : params.promo.description || null,
  }
}

export function describePromoForPackage(promo: BillingPromoCode, monthlyUsd: number): string {
  if (normalizePromoCodeInput(promo.code) === JULY250_PROMO_CODE) {
    return describeJuly250ForMonthlyPrice(monthlyUsd)
  }
  const cap = promo.monthly_price_cap_usd
  const maxCredit = promo.max_credit_usd
  if (cap != null && maxCredit != null && monthlyUsd > cap) {
    return `Up to $${maxCredit.toFixed(0)} credit in the benefit period (plan over $${cap.toFixed(0)}/mo).`
  }
  if (promo.percent_off >= 100) return promo.description
  return `${promo.percent_off}% off while the benefit period covers your signup day.`
}

export type PromoAdjustedSignupPricing = {
  monthlyUsd: number
  dueTodayUsd: number
  daysUntilBillDate: number
  billDateLabel: string
  promoApplied: boolean
  promoCode: string | null
  promoDescription: string | null
  promoDetailMessage: string | null
  promoDiscountUsd: number
  promoTier: PromoDiscountResult["tier"]
  billingResumeDate: string | null
  skipPayment: boolean
}

export function applyPromoToSignupProration(params: {
  packageId: ProductPackageId
  billDayOfMonth: number
  promo: BillingPromoCode | null
  today?: Date
}): PromoAdjustedSignupPricing {
  const today = params.today ?? new Date()
  const base = computeSignupProrationUsd({
    packageId: params.packageId,
    billDayOfMonth: params.billDayOfMonth,
    today,
  })

  const emptyPromoFields = {
    promoApplied: false,
    promoCode: null,
    promoDescription: null,
    promoDetailMessage: null,
    promoDiscountUsd: 0,
    promoTier: "none" as const,
    billingResumeDate: null,
    skipPayment: false,
  }

  if (!params.promo) {
    return { ...base, ...emptyPromoFields }
  }

  const validation = validatePromoForSignup(params.promo, today)
  if (!validation.ok) {
    return { ...base, ...emptyPromoFields }
  }

  const todayYmd = localDateYmd(today)
  const inBenefit = isYmdInRange(todayYmd, params.promo.benefit_start, params.promo.benefit_end)
  const discount = computePromoSignupDiscount({
    dueTodayUsd: base.dueTodayUsd,
    monthlyUsd: base.monthlyUsd,
    promo: params.promo,
    inBenefit,
  })
  const billingResumeDate = params.promo.billing_resume_date?.trim() || null
  const packageLine = describePromoForPackage(params.promo, base.monthlyUsd)

  return {
    monthlyUsd: base.monthlyUsd,
    dueTodayUsd: discount.dueTodayUsd,
    daysUntilBillDate: base.daysUntilBillDate,
    billDateLabel: base.billDateLabel,
    promoApplied: true,
    promoCode: normalizePromoCodeInput(params.promo.code),
    promoDescription: params.promo.description || null,
    promoDetailMessage: inBenefit ? discount.detailMessage ?? packageLine : packageLine,
    promoDiscountUsd: discount.discountUsd,
    promoTier: inBenefit ? discount.tier : "none",
    billingResumeDate,
    skipPayment: discount.dueTodayUsd <= 0,
  }
}
