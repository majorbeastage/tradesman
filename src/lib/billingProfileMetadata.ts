/** Billing / Helcim fields stored on `profiles.metadata` (JSON). */

export type BillingProfileMetadata = {
  /** When true, Helcim webhooks do not change `account_disabled` (manual grace or dispute). */
  billing_automation_paused?: boolean
  /** Helcim customer code — must match webhook / transaction for automations. */
  billing_helcim_customer_code?: string
  /** ISO timestamp of last successful payment applied by automation. */
  billing_last_success_at?: string
  /**
   * Optional per-user Helcim hosted pay / portal URL override.
   * When unset, the app uses `VITE_HELCIM_PAYMENT_PORTAL_URL` from the build (one URL for the whole org).
   */
  helcim_pay_portal_url?: string
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
  if (typeof m.helcim_pay_portal_url === "string" && m.helcim_pay_portal_url.trim()) {
    out.helcim_pay_portal_url = m.helcim_pay_portal_url.trim()
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
  if (patch.helcim_pay_portal_url != null) {
    const t = patch.helcim_pay_portal_url.trim()
    if (t) next.helcim_pay_portal_url = t
    else delete next.helcim_pay_portal_url
  }
  return next
}
