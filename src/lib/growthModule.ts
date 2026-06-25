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
  /** Data the marketing firm should collect for this campaign */
  dataCollectionBrief?: string
  requiresApprovalBeforeLive?: boolean
  submittedAt?: string
  activatedAt?: string
  completedAt?: string
  status: "draft" | "submitted" | "active" | "paused" | "completed"
  snapshots?: GrowthCampaignSnapshot[]
}

export type GrowthPresencePages = {
  google?: string
  facebook?: string
  instagram?: string
  tiktok?: string
  x?: string
  linkedin?: string
  yelp?: string
}

export type GrowthProfilePlatformId = keyof GrowthPresencePages | "website"

export type GrowthProfileGrade = {
  score: number
  gradedAt: string
  status: "missing" | "needs_work" | "fair" | "strong"
  whatAiCanSee: string[]
  gaps: string[]
}

export type GrowthProfileChangeEntry = {
  id: string
  at: string
  field: string
  label: string
  oldValue?: string
  newValue?: string
  source: "manual" | "partner" | "crawl"
}

export type GrowthMarketingBudget = {
  monthlyCap?: number
  currency?: string
  notes?: string
  /** Reserved for Helcim / payment-requests integration */
  paymentWiringStatus?: "not_connected" | "pending" | "connected"
}

export type GrowthCampaignMetrics = {
  websiteVisits?: number
  leadSubmissions?: number
  socialEngagement?: number
  reviewCount?: number
  notes?: string
}

export type GrowthCampaignSnapshot = {
  id: string
  phase: "before" | "after"
  capturedAt: string
  metrics: GrowthCampaignMetrics
  source: "manual" | "auto"
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
  profileGrades?: Partial<Record<GrowthProfilePlatformId, GrowthProfileGrade>>
  lastGradedAt?: string
  marketingBudget?: GrowthMarketingBudget
  changeLog?: GrowthProfileChangeEntry[]
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
    return defaultGrowthModuleDoc()
  }
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return defaultGrowthModuleDoc()
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
    profileGrades:
      typeof o.profileGrades === "object" && o.profileGrades && !Array.isArray(o.profileGrades)
        ? (o.profileGrades as Partial<Record<GrowthProfilePlatformId, GrowthProfileGrade>>)
        : undefined,
    lastGradedAt: typeof o.lastGradedAt === "string" ? o.lastGradedAt : undefined,
    marketingBudget:
      typeof o.marketingBudget === "object" && o.marketingBudget && !Array.isArray(o.marketingBudget)
        ? (o.marketingBudget as GrowthMarketingBudget)
        : undefined,
    changeLog: Array.isArray(o.changeLog) ? (o.changeLog as GrowthProfileChangeEntry[]) : [],
    campaigns: Array.isArray(o.campaigns) ? (o.campaigns as GrowthCampaignDraft[]) : [],
    advisorNotes: Array.isArray(o.advisorNotes)
      ? o.advisorNotes.filter((x): x is string => typeof x === "string")
      : defaultAdvisorNotes(),
    checklist: typeof o.checklist === "object" && o.checklist ? (o.checklist as Record<string, boolean>) : {},
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  }
}

/** Read growth doc from profiles.metadata (nested key + legacy root). */
export function loadGrowthDocFromProfileMetadata(metadata: unknown): GrowthModuleDoc {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return defaultGrowthModuleDoc()
  }
  const meta = metadata as Record<string, unknown>
  const nested = meta[GROWTH_METADATA_KEY]
  if (nested && typeof nested === "object") return loadGrowthModuleFromMetadata(nested)
  if (meta.v === 1 && (meta.presencePages || meta.campaigns || meta.profileGrades)) {
    return loadGrowthModuleFromMetadata(meta)
  }
  return defaultGrowthModuleDoc()
}

function defaultGrowthModuleDoc(): GrowthModuleDoc {
  return {
    v: 1,
    scores: placeholderGrowthScores(),
    advisorNotes: defaultAdvisorNotes(),
    changeLog: [],
    marketingBudget: { currency: "USD", paymentWiringStatus: "not_connected" },
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
    "Save your website and social profile URLs, then run Grade profiles to see what AI can infer today.",
    "Set a monthly marketing budget — payment collection will connect to Tradesman Payments later.",
    "When a campaign goes live, record a before snapshot; after the push, record an after snapshot to compare traffic.",
  ]
}

export function buildGrowthRecommendations(doc: GrowthModuleDoc): GrowthRecommendation[] {
  const out: GrowthRecommendation[] = []
  if (!doc.websiteUrl?.trim()) {
    out.push({
      id: "website-url",
      priority: "high",
      text: "Add your website URL — it anchors campaign landing pages and traffic tracking.",
    })
  }
  const socialCount = countSavedProfiles(doc)
  if (socialCount < 2) {
    out.push({
      id: "social-profiles",
      priority: "high",
      text: "Add at least Google Business plus one social profile so your marketing partner has sources to monitor.",
    })
  }
  if (!doc.lastGradedAt) {
    out.push({
      id: "grade-profiles",
      priority: "medium",
      text: "Run Grade profiles to see what AI can read from your saved links and what is missing.",
    })
  }
  if (!doc.marketingBudget?.monthlyCap) {
    out.push({
      id: "set-budget",
      priority: "medium",
      text: "Set a monthly marketing budget so campaign requests include spend limits.",
    })
  }
  const activeWithoutBefore = (doc.campaigns ?? []).some(
    (c) => (c.status === "active" || c.status === "completed") && !c.snapshots?.some((s) => s.phase === "before"),
  )
  if (activeWithoutBefore) {
    out.push({
      id: "campaign-before",
      priority: "high",
      text: "Capture a before snapshot on live campaigns so you can compare traffic after the push.",
    })
  }
  return out
}

function countSavedProfiles(doc: GrowthModuleDoc): number {
  let n = doc.websiteUrl?.trim() ? 1 : 0
  const pages = doc.presencePages ?? {}
  for (const v of Object.values(pages)) if (typeof v === "string" && v.trim()) n++
  if (doc.gbpProfileUrl?.trim() && !pages.google?.trim()) n++
  return n
}

export function detectProfileChanges(prev: GrowthModuleDoc, next: GrowthModuleDoc): GrowthProfileChangeEntry[] {
  const entries: GrowthProfileChangeEntry[] = []
  const now = new Date().toISOString()
  const track = (field: string, label: string, oldVal?: string, newVal?: string) => {
    const o = (oldVal ?? "").trim()
    const n = (newVal ?? "").trim()
    if (o === n) return
    entries.push({
      id: `${field}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: now,
      field,
      label,
      oldValue: o || undefined,
      newValue: n || undefined,
      source: "manual",
    })
  }
  track("websiteUrl", "Website", prev.websiteUrl, next.websiteUrl)
  track("gbpBusinessName", "Business name", prev.gbpBusinessName, next.gbpBusinessName)
  track("gbpLocation", "Service area", prev.gbpLocation, next.gbpLocation)
  const prevPages = prev.presencePages ?? {}
  const nextPages = next.presencePages ?? {}
  const keys = new Set([...Object.keys(prevPages), ...Object.keys(nextPages)] as (keyof GrowthPresencePages)[])
  for (const key of keys) {
    track(`presencePages.${key}`, String(key), prevPages[key], nextPages[key])
  }
  track("gbpProfileUrl", "Google Business Profile", prev.gbpProfileUrl, next.gbpProfileUrl)
  if (prev.marketingBudget?.monthlyCap !== next.marketingBudget?.monthlyCap) {
    track(
      "marketingBudget.monthlyCap",
      "Monthly marketing budget",
      prev.marketingBudget?.monthlyCap != null ? String(prev.marketingBudget.monthlyCap) : undefined,
      next.marketingBudget?.monthlyCap != null ? String(next.marketingBudget.monthlyCap) : undefined,
    )
  }
  return entries
}

export function mergeProfileChanges(
  prevLog: GrowthProfileChangeEntry[] | undefined,
  newEntries: GrowthProfileChangeEntry[],
  max = 80,
): GrowthProfileChangeEntry[] {
  return [...newEntries, ...(prevLog ?? [])].slice(0, max)
}

export function createCampaignSnapshot(phase: "before" | "after", metrics?: GrowthCampaignMetrics): GrowthCampaignSnapshot {
  return {
    id: `snap-${phase}-${Date.now()}`,
    phase,
    capturedAt: new Date().toISOString(),
    metrics: metrics ?? {},
    source: metrics ? "manual" : "auto",
  }
}

export function applyCampaignStatusTransition(
  campaign: GrowthCampaignDraft,
  nextStatus: GrowthCampaignDraft["status"],
): GrowthCampaignDraft {
  const snapshots = [...(campaign.snapshots ?? [])]
  const hasBefore = snapshots.some((s) => s.phase === "before")
  const hasAfter = snapshots.some((s) => s.phase === "after")
  let updated = { ...campaign, status: nextStatus }

  if (nextStatus === "active" && !hasBefore) {
    snapshots.push(createCampaignSnapshot("before"))
    updated = { ...updated, activatedAt: new Date().toISOString(), snapshots }
  }
  if (nextStatus === "completed" && !hasAfter) {
    snapshots.push(createCampaignSnapshot("after"))
    updated = { ...updated, completedAt: new Date().toISOString(), snapshots }
  }
  if (nextStatus === "submitted" && !updated.submittedAt) {
    updated = { ...updated, submittedAt: new Date().toISOString() }
  }
  return updated
}

export function computeScoresFromGrades(doc: GrowthModuleDoc): GrowthScores {
  const grades = doc.profileGrades ?? {}
  const values = Object.values(grades).filter(Boolean) as GrowthProfileGrade[]
  const avg = values.length ? Math.round(values.reduce((s, g) => s + g.score, 0) / values.length) : 0
  const website = grades.website?.score ?? doc.websiteHealthCheck?.score ?? doc.scores?.website
  const gbp = grades.google?.score ?? doc.scores?.gbp
  return {
    overall: avg || doc.scores?.overall,
    leadHealth: doc.scores?.leadHealth,
    gbp,
    website,
    reviews: doc.scores?.reviews,
    conversionRate: doc.scores?.conversionRate,
    marketingRoi: doc.scores?.marketingRoi,
    revenueAttributed: doc.scores?.revenueAttributed,
  }
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
