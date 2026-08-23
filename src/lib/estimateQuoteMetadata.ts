import type { EstimateGuideFlags } from "./estimateGuidePrefs"

const GUIDE_KEYS: (keyof EstimateGuideFlags)[] = [
  "wizardOpened",
  "customerSkipped",
  "customerLinkedViaGuide",
  "templateSkipped",
  "templateAppliedViaGuide",
  "conversationNeedsInfo",
  "conversationReady",
  "conversationSkipped",
  "mediaSkipped",
  "mediaAdded",
  "jobDetailsSkipped",
  "jobDetailsProvided",
  "jobDescriptionSkipped",
  "jobDescriptionProvided",
  "quoteItemsReady",
  "quoteItemsSkipped",
  "previewReviewed",
  "conversationScopeBullets",
  "jobScopePackBullets",
]

export function quoteJobDetailsFromMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return ""
  const raw = (meta as Record<string, unknown>).job_details
  return typeof raw === "string" ? raw.trim() : ""
}

/** Customer-facing job description (shown on exported estimate when filled). */
export function quoteCustomerJobDescriptionFromMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return ""
  const raw = (meta as Record<string, unknown>).customer_job_description
  return typeof raw === "string" ? raw.trim() : ""
}

/** Staff-only notes on the quote (never on customer PDF). */
export function quoteInternalNotesFromMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return ""
  const m = meta as Record<string, unknown>
  const internal = typeof m.internal_notes === "string" ? m.internal_notes.trim() : ""
  if (internal) return internal
  // Legacy: before dual-field UI, job_details was often the only notes field.
  return typeof m.job_details === "string" ? m.job_details.trim() : ""
}

/** Combined customer + internal notes for calendar events (always both when present). */
export function buildEstimateNotesSummaryForCalendar(opts: {
  customerNotes?: string | null
  internalNotes?: string | null
}): string {
  const parts: string[] = []
  const customer = (opts.customerNotes || "").trim()
  const internal = (opts.internalNotes || "").trim()
  if (customer) parts.push(`Customer view:\n${customer}`)
  if (internal) parts.push(`Internal only:\n${internal}`)
  return parts.join("\n\n").slice(0, 4000)
}

export type JobDetailsDefaultView = "customer" | "internal"

export function parseJobDetailsDefault(meta: Record<string, unknown> | null | undefined): JobDetailsDefaultView {
  const raw = meta?.estimate_template_job_details_default
  if (raw === "customer" || raw === "internal") return raw
  // Migrate older toggles: include job description → default customer view.
  if (meta?.estimate_template_include_job_description === true) return "customer"
  return "internal"
}

export function estimateGuideFlagsFromQuoteMetadata(meta: unknown): EstimateGuideFlags {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {}
  const raw = (meta as Record<string, unknown>).estimate_guide
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: EstimateGuideFlags = {}
  for (const k of GUIDE_KEYS) {
    const v = src[k]
    if (k === "wizardOpened" || k === "customerSkipped" || k === "customerLinkedViaGuide" || k === "templateSkipped" || k === "templateAppliedViaGuide" || k === "conversationNeedsInfo" || k === "conversationReady" || k === "conversationSkipped" || k === "mediaSkipped" || k === "mediaAdded" || k === "jobDetailsSkipped" || k === "jobDetailsProvided" || k === "jobDescriptionSkipped" || k === "jobDescriptionProvided" || k === "quoteItemsReady" || k === "quoteItemsSkipped" || k === "previewReviewed") {
      if (typeof v === "boolean") out[k] = v
    } else if (typeof v === "string" && v.trim()) {
      out[k] = v.trim()
    }
  }
  return out
}

export function mergeQuoteMetadataWithEstimateGuide(
  meta: unknown,
  flags: EstimateGuideFlags,
  jobDetails?: string,
  customerJobDescription?: string,
): Record<string, unknown> {
  const prev =
    meta && typeof meta === "object" && !Array.isArray(meta) ? { ...(meta as Record<string, unknown>) } : {}
  const prevGuide =
    prev.estimate_guide && typeof prev.estimate_guide === "object" && !Array.isArray(prev.estimate_guide)
      ? { ...(prev.estimate_guide as Record<string, unknown>) }
      : {}
  const nextGuide: Record<string, unknown> = { ...prevGuide }
  for (const k of GUIDE_KEYS) {
    const v = flags[k]
    if (v === undefined) continue
    if (typeof v === "boolean") nextGuide[k] = v
    else if (typeof v === "string") nextGuide[k] = v
  }
  const next: Record<string, unknown> = { ...prev, estimate_guide: nextGuide }
  if (jobDetails !== undefined) next.job_details = jobDetails
  if (customerJobDescription !== undefined) next.customer_job_description = customerJobDescription
  return next
}
