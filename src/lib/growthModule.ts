/** Growth module — metadata, attribution, and score helpers (v1 framework). */

export const GROWTH_METADATA_KEY = "growth_module_v1"

export type LeadAttributionSource =
  | "google_search"
  | "google_maps"
  | "facebook"
  | "website"
  | "referral"
  | "repeat_customer"
  | "phone_call"
  | "email"
  | "direct"
  | "campaign"
  | "unknown"

export const LEAD_ATTRIBUTION_SOURCES: { id: LeadAttributionSource; label: string }[] = [
  { id: "google_search", label: "Google Search" },
  { id: "google_maps", label: "Google Maps" },
  { id: "facebook", label: "Facebook" },
  { id: "website", label: "Website" },
  { id: "referral", label: "Referral" },
  { id: "repeat_customer", label: "Repeat customer" },
  { id: "phone_call", label: "Phone call" },
  { id: "email", label: "Email" },
  { id: "direct", label: "Direct traffic" },
  { id: "campaign", label: "Campaign" },
  { id: "unknown", label: "Unknown" },
]

export type GrowthScores = {
  overall?: number
  leadHealth?: number
  gbp?: number
  website?: number
  reviews?: number
  conversionRate?: number
  marketingRoi?: number
  revenueAttributed?: number
}

export type GrowthCampaignDraft = {
  id: string
  name: string
  targetService?: string
  budget?: number
  radiusMiles?: number
  durationDays?: number
  /** Public lead capture path segment — e.g. /cta/your-slug */
  landingSlug?: string
  description?: string
  notes?: string
  requiresApprovalBeforeLive?: boolean
  submittedAt?: string
  status: "draft" | "submitted" | "active" | "paused" | "completed"
}

export type GrowthPresencePages = {
  google?: string
  facebook?: string
  instagram?: string
  tiktok?: string
  x?: string
}

export type WebsiteHealthCheckResult = {
  checkedAt: string
  url: string
  score: number
  checks: { id: string; ok: boolean; label: string; detail?: string }[]
}

export type GrowthModuleDoc = {
  v: 1
  scores?: GrowthScores
  websiteUrl?: string
  websiteAuditNotes?: string
  websiteHealthCheck?: WebsiteHealthCheckResult
  gbpConnected?: boolean
  gbpProfileUrl?: string
  gbpBusinessName?: string
  gbpLocation?: string
  presencePages?: GrowthPresencePages
  campaigns?: GrowthCampaignDraft[]
  advisorNotes?: string[]
  checklist?: Record<string, boolean>
  updatedAt?: string
}

export type GrowthRecommendation = {
  id: string
  priority: "high" | "medium" | "low"
  text: string
  actionPage?: string
}

export function labelForAttributionSource(id: LeadAttributionSource | string | undefined): string {
  return LEAD_ATTRIBUTION_SOURCES.find((s) => s.id === id)?.label ?? "Unknown"
}

export function loadGrowthModuleFromMetadata(raw: unknown): GrowthModuleDoc {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { v: 1, scores: placeholderGrowthScores(), advisorNotes: defaultAdvisorNotes() }
  }
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return { v: 1, scores: placeholderGrowthScores(), advisorNotes: defaultAdvisorNotes() }
  return {
    v: 1,
    scores: typeof o.scores === "object" && o.scores ? (o.scores as GrowthScores) : placeholderGrowthScores(),
    websiteUrl: typeof o.websiteUrl === "string" ? o.websiteUrl : undefined,
    websiteAuditNotes: typeof o.websiteAuditNotes === "string" ? o.websiteAuditNotes : undefined,
    gbpConnected: o.gbpConnected === true,
    gbpProfileUrl: typeof o.gbpProfileUrl === "string" ? o.gbpProfileUrl : undefined,
    gbpBusinessName: typeof o.gbpBusinessName === "string" ? o.gbpBusinessName : undefined,
    gbpLocation: typeof o.gbpLocation === "string" ? o.gbpLocation : undefined,
    presencePages:
      typeof o.presencePages === "object" && o.presencePages && !Array.isArray(o.presencePages)
        ? (o.presencePages as GrowthPresencePages)
        : undefined,
    websiteHealthCheck:
      typeof o.websiteHealthCheck === "object" && o.websiteHealthCheck
        ? (o.websiteHealthCheck as WebsiteHealthCheckResult)
        : undefined,
    campaigns: Array.isArray(o.campaigns) ? (o.campaigns as GrowthCampaignDraft[]) : [],
    advisorNotes: Array.isArray(o.advisorNotes)
      ? o.advisorNotes.filter((x): x is string => typeof x === "string")
      : defaultAdvisorNotes(),
    checklist: typeof o.checklist === "object" && o.checklist ? (o.checklist as Record<string, boolean>) : {},
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  }
}

export function mergeGrowthModuleMetadata(
  prevMeta: Record<string, unknown>,
  doc: GrowthModuleDoc,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [GROWTH_METADATA_KEY]: { ...doc, updatedAt: new Date().toISOString() },
  }
}

/** Placeholder until GBP/website/review APIs populate real scores. */
export function placeholderGrowthScores(): GrowthScores {
  return {
    overall: 72,
    leadHealth: 68,
    gbp: 74,
    website: 65,
    reviews: 81,
    conversionRate: 24,
    marketingRoi: 0,
    revenueAttributed: 0,
  }
}

export function defaultAdvisorNotes(): string[] {
  return [
    "Connect your Google Business Profile to unlock a live health score and weekly recommendations.",
    "Publish your lead capture link (/cta/your-slug) on your website and Google listing.",
    "Tag lead sources on new Leads so attribution reports show which channels close.",
  ]
}

export function buildGrowthRecommendations(doc: GrowthModuleDoc): GrowthRecommendation[] {
  const out: GrowthRecommendation[] = []
  if (!doc.gbpConnected) {
    out.push({
      id: "gbp-connect",
      priority: "high",
      text: "Connect Google Business Profile to monitor reviews, photos, and local ranking opportunities.",
    })
  }
  if (!doc.websiteUrl?.trim()) {
    out.push({
      id: "website-url",
      priority: "high",
      text: "Add your website URL to run a health check (SSL, mobile, speed, SEO).",
    })
  }
  const gbp = doc.scores?.gbp ?? 0
  if (gbp > 0 && gbp < 80) {
    out.push({
      id: "gbp-photos",
      priority: "medium",
      text: "Add recent project photos to Google Business — profiles with fresh photos earn more map clicks.",
    })
  }
  out.push({
    id: "cta-link",
    priority: "medium",
    text: "Share your Tradesman lead capture link on Google, Facebook, and truck wraps.",
    actionPage: "leads",
  })
  out.push({
    id: "review-campaign",
    priority: "low",
    text: "Send a review request to five recent customers from Conversations (SMS or email).",
    actionPage: "conversations",
  })
  return out
}

export function runBasicWebsiteHealthCheck(urlRaw: string): WebsiteHealthCheckResult {
  const url = urlRaw.trim()
  const checks: WebsiteHealthCheckResult["checks"] = []
  let score = 0
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
    checks.push({ id: "url", ok: true, label: "Valid URL format", detail: parsed.hostname })
    score += 25
    if (parsed.protocol === "https:") {
      checks.push({ id: "ssl", ok: true, label: "Uses HTTPS", detail: "Secure connection expected" })
      score += 25
    } else {
      checks.push({ id: "ssl", ok: false, label: "Uses HTTPS", detail: "Consider redirecting HTTP to HTTPS" })
    }
    if (!parsed.hostname.includes("localhost")) {
      checks.push({ id: "host", ok: true, label: "Public hostname", detail: parsed.hostname })
      score += 20
    }
    if (parsed.pathname === "/" || parsed.pathname.length > 1) {
      checks.push({ id: "path", ok: true, label: "Page path present", detail: parsed.pathname })
      score += 15
    }
    checks.push({
      id: "cta",
      ok: true,
      label: "Lead capture ready",
      detail: "Share your Tradesman /cta link on this site",
    })
    score += 15
  } catch {
    checks.push({ id: "url", ok: false, label: "Valid URL format", detail: "Enter a full URL like https://yourbusiness.com" })
  }
  return {
    checkedAt: new Date().toISOString(),
    url,
    score: Math.min(100, score),
    checks,
  }
}

export const GROWTH_CAMPAIGN_TEMPLATES: { id: string; name: string; targetService: string }[] = [
  { id: "spring-hvac", name: "Spring HVAC Tune-Up", targetService: "HVAC maintenance" },
  { id: "roof-inspection", name: "Free Roof Inspection", targetService: "Roofing" },
  { id: "holiday-lighting", name: "Holiday Lighting", targetService: "Seasonal lighting" },
  { id: "landscape-maint", name: "Landscape Maintenance", targetService: "Landscaping" },
]

export const GROWTH_LIFECYCLE_STEPS = [
  "Source",
  "Conversation",
  "Lead",
  "Estimate",
  "Work order",
  "Invoice",
  "Revenue",
] as const
