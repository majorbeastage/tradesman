/** Managed ad campaigns — admin ops + Payments balance helpers. */

export type AdCampaignStatus =
  | "requested"
  | "awaiting_client_approval"
  | "approved"
  | "client_rejected"
  | "active"
  | "paused"
  | "completed"
  | "canceled"

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

export type AdCampaignPaymentRow = {
  id: string
  created_at: string
  profile_id: string
  amount_cents: number
  currency: string
  provider: string
  provider_transaction_id: string
  approval_code: string | null
  campaign_ids: string[]
  status: "verified" | "refunded"
  metadata: Record<string, unknown>
}

export const AD_CHANNEL_OPTIONS = [
  { id: "google", label: "Google Ads / LSA" },
  { id: "gbp", label: "Google Business Profile" },
  { id: "meta", label: "Facebook / Instagram (Meta)" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
  { id: "yelp", label: "Yelp" },
  { id: "angi", label: "Angi / HomeAdvisor" },
  { id: "other", label: "Other" },
] as const

/** Agency publishing / ads access checklist shown in Admin Ads & campaigns. */
export const SOCIAL_PLATFORM_PROCESS = [
  {
    id: "meta",
    label: "Meta (Facebook + Instagram)",
    needs: "Tradesman Business Manager + Ads account, or Partner access to the client’s BM",
    automate: "Marketing API / Ads Insights for spend + creatives; Page posting via Graph API after Page token grant",
    steps: [
      "Create or use Tradesman’s Meta Business Manager",
      "Add client Page + Instagram as assets (or request Partner access)",
      "Create Ad Account under Tradesman BM or accept client Ad Account share",
      "Complete Business Verification + payment method",
      "Store system user token (server secret) for Ads Insights + publishing",
    ],
  },
  {
    id: "tiktok",
    label: "TikTok Ads / Organic",
    needs: "TikTok Ads Manager Business Center + Business API app",
    automate: "Ads spend + campaign status via Marketing API; organic posts need TikTok for Business posting permissions",
    steps: [
      "Open TikTok Business Center for Tradesman",
      "Invite client ad account or create agency-managed account",
      "Register Marketing API app and approve scopes",
      "Store access tokens as Vercel secrets (never in the browser)",
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn Campaign Manager",
    needs: "LinkedIn Company Page admin + Campaign Manager account",
    automate: "Campaign Management API for ads; Community Management API for organic (separate products)",
    steps: [
      "Become admin on client Company Page (or create Tradesman-managed page posts with permission)",
      "Create Campaign Manager ad account",
      "Create LinkedIn Developer app and request Advertising API access",
      "Store OAuth refresh token server-side",
    ],
  },
  {
    id: "x",
    label: "X (Twitter)",
    needs: "X Ads account + elevated API access (paid tiers for reliable automation)",
    automate: "Ads API for campaigns; posting API for organic (rate-limited; paid access recommended)",
    steps: [
      "Create X Ads account under Tradesman or agency handle",
      "Apply for Ads API / elevated access",
      "Generate app keys + OAuth 1.0a or OAuth 2 tokens",
      "Store secrets on Vercel; use Admin checklist until API is live",
    ],
  },
] as const

export const AD_STATUS_OPTIONS: { id: AdCampaignStatus; label: string }[] = [
  { id: "requested", label: "Requested" },
  { id: "awaiting_client_approval", label: "Awaiting client approval" },
  { id: "approved", label: "Approved" },
  { id: "client_rejected", label: "Client declined" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
  { id: "canceled", label: "Canceled" },
]

export const AD_CAMPAIGN_SPEND_DISCLAIMER =
  "Campaign spend does not purchase or guarantee a specific number of leads, calls, bookings, or customers. Results vary because market demand, competition, platform delivery, customer behavior, service area, and other factors are outside Tradesman Systems’ control. Campaign funds purchase supplemental advertising intended to direct prospective customers to the client’s Tradesman profile and intake channels."

export const AD_CAMPAIGN_FEE_DISCLOSURE =
  "Tradesman Systems charges a $3.95 campaign processing fee on campaign spend up to $100. For spend over $100, the fee is $3.95 plus 2% of the amount above $100."

/** $3.95 through $100, then $3.95 + 2% of the amount above $100. */
export function adCampaignProcessingFeeCents(campaignSpendCents: number): number {
  const spend = Math.max(0, Math.round(campaignSpendCents || 0))
  if (spend <= 0) return 0
  if (spend <= 10_000) return 395
  return 395 + Math.round((spend - 10_000) * 0.02)
}

export function adCampaignTotalChargeCents(campaignSpendCents: number): number {
  const spend = Math.max(0, Math.round(campaignSpendCents || 0))
  return spend + adCampaignProcessingFeeCents(spend)
}

/** Amount still owed for campaign spend plus processing fee (not yet billed). */
export function adBalanceDueCents(c: Pick<AdCampaignRow, "spent_cents" | "billed_cents">): number {
  return Math.max(0, adCampaignTotalChargeCents(c.spent_cents || 0) - (c.billed_cents || 0))
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
/** One-shot dashboard → Payments instruction to load only the advertising balance. */
export const AD_PAYMENT_LOAD_STORAGE_KEY = "tradesman_load_advertising_balance"

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
