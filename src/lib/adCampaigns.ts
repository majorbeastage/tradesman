/** Managed ad campaigns — admin ops + Payments balance helpers. */

export type AdCampaignStatus = "requested" | "approved" | "active" | "paused" | "completed" | "canceled"

export type AdCampaignRow = {
  id: string
  created_at: string
  updated_at: string
  profile_id: string
  created_by: string | null
  name: string
  status: AdCampaignStatus
  channels: string[]
  request_details: string
  requested_budget_cents: number
  spent_cents: number
  billed_cents: number
  currency: string
  growth_campaign_id: string | null
  starts_on: string | null
  ends_on: string | null
  metadata: Record<string, unknown>
}

export type AdSpendEntry = {
  id: string
  created_at: string
  campaign_id: string
  profile_id: string
  recorded_by: string | null
  spend_date: string
  amount_cents: number
  currency: string
  vendor: string | null
  kind: "media" | "management_fee" | "creative" | "other"
  notes: string | null
}

export const AD_CHANNEL_OPTIONS = [
  { id: "google", label: "Google Ads / LSA" },
  { id: "gbp", label: "Google Business Profile" },
  { id: "meta", label: "Facebook / Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "yelp", label: "Yelp" },
  { id: "angi", label: "Angi / HomeAdvisor" },
  { id: "other", label: "Other" },
] as const

export const AD_STATUS_OPTIONS: { id: AdCampaignStatus; label: string }[] = [
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
  { id: "canceled", label: "Canceled" },
]

/** Amount still owed to Tradesman for media already spent (not yet billed). */
export function adBalanceDueCents(c: Pick<AdCampaignRow, "spent_cents" | "billed_cents">): number {
  return Math.max(0, (c.spent_cents || 0) - (c.billed_cents || 0))
}

export function sumAdBalanceDueCents(rows: Pick<AdCampaignRow, "spent_cents" | "billed_cents">[]): number {
  return rows.reduce((sum, r) => sum + adBalanceDueCents(r), 0)
}

export function centsToUsd(cents: number): number {
  return Math.round(cents) / 100
}

export function usdToCents(usd: number): number {
  return Math.round(usd * 100)
}

export function formatUsdFromCents(cents: number): string {
  return `$${centsToUsd(cents).toFixed(2)}`
}

/** profiles.metadata key for Payments hub advertising summary. */
export const AD_BILLING_METADATA_KEY = "ad_campaigns_billing_v1"

export type AdBillingMetadata = {
  v: 1
  /** Open balance pushed from Admin → Ads (cents). */
  balance_due_cents: number
  updated_at: string
  campaign_ids?: string[]
  notes?: string
}

export function parseAdBillingMetadata(metadata: unknown): AdBillingMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const raw = (metadata as Record<string, unknown>)[AD_BILLING_METADATA_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const balance = typeof o.balance_due_cents === "number" ? Math.max(0, Math.round(o.balance_due_cents)) : 0
  return {
    v: 1,
    balance_due_cents: balance,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : "",
    campaign_ids: Array.isArray(o.campaign_ids) ? o.campaign_ids.map(String) : undefined,
    notes: typeof o.notes === "string" ? o.notes : undefined,
  }
}

export function mergeAdBillingIntoMetadata(
  prev: unknown,
  patch: Omit<AdBillingMetadata, "v">,
): Record<string, unknown> {
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {}
  base[AD_BILLING_METADATA_KEY] = {
    v: 1,
    balance_due_cents: Math.max(0, Math.round(patch.balance_due_cents)),
    updated_at: patch.updated_at || new Date().toISOString(),
    ...(patch.campaign_ids ? { campaign_ids: patch.campaign_ids } : {}),
    ...(patch.notes ? { notes: patch.notes } : {}),
  }
  return base
}
