/** Billing / Helcim fields stored on `profiles.metadata` (JSON). */

export type BillingProfileMetadata = {
  /** When true, Helcim webhooks do not change `account_disabled` (manual grace or dispute). */
  billing_automation_paused?: boolean
  /** Helcim customer code — must match webhook / transaction for automations. */
  billing_helcim_customer_code?: string
  /** ISO timestamp of last successful payment applied by automation. */
  billing_last_success_at?: string
  /** HTTPS URL for Helcim hosted payment / customer portal (shown in Payments tab iframe). */
  helcim_pay_portal_url?: string
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
