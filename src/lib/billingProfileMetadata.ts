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
   * Optional per-user Helcim hosted pay / portal URL override.
   * When unset, the app uses `VITE_HELCIM_PAYMENT_PORTAL_URL` from the build (one URL for the whole org).
   */
  helcim_pay_portal_url?: string
  /** Primary product line for billing (admin sheet). */
  billing_product_type?: BillingProductTypeId | string
  /** Extra product lines (same catalog as primary). */
  billing_additional_products?: string[]
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) next.billing_payment_due_date = t
    else delete next.billing_payment_due_date
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
  return next
}
