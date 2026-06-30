/** Shared JULY250 campaign constants — banner + signup hide after this date (inclusive last day). */
export const JULY250_PROMO_CODE = "JULY250"
export const JULY250_CAMPAIGN_LAST_DAY = "2026-07-31"
export const JULY250_BILLING_RESUME = "2026-08-01"
export const JULY250_MONTHLY_CAP_USD = 250
export const JULY250_MAX_CREDIT_USD = 250

export const SIGNUP_PROMO_CODE_STORAGE_KEY = "tradesman_signup_promo_code"

export const JULY250_PUBLIC_HEADLINE = "Happy 250th USA — July signup offer"

export const JULY250_PUBLIC_DETAILS = [
  "Use promo code JULY250 when you create your account.",
  "July 2026 only — billing resumes August 1, 2026.",
  "Plans at $250/month or less: no billing for July 2026.",
  "Plans over $250/month: up to a $250 credit in July (not to exceed your July service amount).",
  "Offer ends July 31, 2026.",
] as const

function localDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Homepage banner + signup promo field visible through end of July 2026. */
export function isJuly250CampaignVisible(today: Date = new Date()): boolean {
  return localDateYmd(today) <= JULY250_CAMPAIGN_LAST_DAY
}

export function describeJuly250ForMonthlyPrice(monthlyUsd: number): string {
  if (monthlyUsd <= JULY250_MONTHLY_CAP_USD) {
    return "With JULY250: no billing for July 2026 on your plan. Billing resumes August 1, 2026."
  }
  return `With JULY250: up to $${JULY250_MAX_CREDIT_USD} credit in July 2026 on your plan (over $${JULY250_MONTHLY_CAP_USD}/mo). Billing resumes August 1, 2026.`
}
