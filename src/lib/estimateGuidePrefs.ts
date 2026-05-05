/** Persisted per-quote “Start quote” guide flags (sessionStorage). */

export type EstimateGuideFlags = {
  /** User chose Skip on customer step */
  customerSkipped?: boolean
  /** User linked a customer during the guide */
  customerLinkedViaGuide?: boolean
  /** User chose Skip on template step */
  templateSkipped?: boolean
  /** User applied a quick-access template during the guide */
  templateAppliedViaGuide?: boolean
  /** Conversations reviewed: request more customer info before sending estimate. */
  conversationNeedsInfo?: boolean
  /** Conversations reviewed: enough customer info to proceed. */
  conversationReady?: boolean
  /** User skipped the conversations step (optional). */
  conversationSkipped?: boolean
  /** Upload/photos step skipped for now. */
  mediaSkipped?: boolean
  /** At least one upload exists for this estimate. */
  mediaAdded?: boolean
  /** Job details step skipped for now. */
  jobDetailsSkipped?: boolean
  /** Job details text was entered. */
  jobDetailsProvided?: boolean
  /** Quote items step reviewed or filled. */
  quoteItemsReady?: boolean
  /** Quote items step skipped for now. */
  quoteItemsSkipped?: boolean
  /** Preview/review step completed. */
  previewReviewed?: boolean
}

function key(quoteId: string): string {
  return `tradesman_estimate_guide_${quoteId}`
}

export function loadEstimateGuideFlags(quoteId: string | null | undefined): EstimateGuideFlags {
  if (!quoteId) return {}
  try {
    const raw = sessionStorage.getItem(key(quoteId))
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== "object" || Array.isArray(j)) return {}
    return j as EstimateGuideFlags
  } catch {
    return {}
  }
}

export function saveEstimateGuideFlags(quoteId: string, patch: Partial<EstimateGuideFlags>): void {
  if (!quoteId) return
  try {
    const prev = loadEstimateGuideFlags(quoteId)
    const next = { ...prev, ...patch }
    sessionStorage.setItem(key(quoteId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function clearEstimateGuideFlags(quoteId: string): void {
  try {
    sessionStorage.removeItem(key(quoteId))
  } catch {
    /* ignore */
  }
}
