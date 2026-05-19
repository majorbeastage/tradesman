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

export function estimateGuideFlagsFromQuoteMetadata(meta: unknown): EstimateGuideFlags {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {}
  const raw = (meta as Record<string, unknown>).estimate_guide
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: EstimateGuideFlags = {}
  for (const k of GUIDE_KEYS) {
    const v = src[k]
    if (k === "wizardOpened" || k === "customerSkipped" || k === "customerLinkedViaGuide" || k === "templateSkipped" || k === "templateAppliedViaGuide" || k === "conversationNeedsInfo" || k === "conversationReady" || k === "conversationSkipped" || k === "mediaSkipped" || k === "mediaAdded" || k === "jobDetailsSkipped" || k === "jobDetailsProvided" || k === "quoteItemsReady" || k === "quoteItemsSkipped" || k === "previewReviewed") {
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
  return next
}
