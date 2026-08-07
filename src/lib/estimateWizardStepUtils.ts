import type { EstimateGuideFlags } from "./estimateGuidePrefs"

export type EstimateWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type EstimateWizardPhase =
  | "customer"
  | "jobType"
  | "conversations"
  | "media"
  | "jobDetails"
  | "jobDescription"
  | "quoteItems"
  | "review"

export function estimateWizardMaxStep(includeJobDescription: boolean): 7 | 8 {
  return includeJobDescription ? 8 : 7
}

export function estimateWizardPhase(step: EstimateWizardStep, includeJobDescription: boolean): EstimateWizardPhase {
  if (step === 1) return "customer"
  if (step === 2) return "jobType"
  if (step === 3) return "conversations"
  if (step === 4) return "media"
  if (step === 5) return "jobDetails"
  if (includeJobDescription) {
    if (step === 6) return "jobDescription"
    if (step === 7) return "quoteItems"
    return "review"
  }
  if (step === 6) return "quoteItems"
  return "review"
}

export function estimateWizardPhaseTitle(phase: EstimateWizardPhase): string {
  switch (phase) {
    case "customer":
      return "Who is this estimate for?"
    case "jobType":
      return "Select a job type"
    case "conversations":
      return "Conversations"
    case "media":
      return "Upload photos or files"
    case "jobDetails":
      return "Job details"
    case "jobDescription":
      return "Job description for customer"
    case "quoteItems":
      return "Quick add quote items"
    case "review":
      return "Done — Review Estimate"
  }
}

/** First wizard step that is not yet “handled” (linked/skip, etc.) for Continue quote. */
export function getResumeEstimateWizardStep(
  f: EstimateGuideFlags,
  o: {
    customerId: string | null | undefined
    jobTypeId: string | null | undefined
    entityCount: number
    jobDetailsText: string
    customerJobDescriptionText: string
    lineItemCount: number
    includeJobDescription: boolean
  },
): EstimateWizardStep {
  if (!o.customerId && !f.customerSkipped) return 1
  const jt = o.jobTypeId && String(o.jobTypeId).trim()
  if (!f.templateAppliedViaGuide && !f.templateSkipped && !jt) return 2
  if (!f.conversationReady && !f.conversationNeedsInfo && !f.conversationSkipped) return 3
  if (!f.mediaSkipped && !f.mediaAdded && o.entityCount === 0) return 4
  if (!f.jobDetailsSkipped && !f.jobDetailsProvided && !o.jobDetailsText.trim()) return 5
  if (o.includeJobDescription) {
    if (!f.jobDescriptionSkipped && !f.jobDescriptionProvided && !o.customerJobDescriptionText.trim()) return 6
    if (!f.quoteItemsSkipped && !f.quoteItemsReady && o.lineItemCount === 0) return 7
    return 8
  }
  if (!f.quoteItemsSkipped && !f.quoteItemsReady && o.lineItemCount === 0) return 6
  return 7
}

/**
 * Steps 2–5 have each been completed or explicitly skipped (conversations may be “needs more info”).
 * Enables AI line suggestions to merge this context for scope analysis.
 */
export function estimateWizardScopeAnalysisReady(
  f: EstimateGuideFlags,
  o: {
    jobTypeId: string | null | undefined
    entityCount: number
    jobDetailsText: string
  },
): boolean {
  const jt = o.jobTypeId && String(o.jobTypeId).trim()
  const step2 = f.templateAppliedViaGuide === true || f.templateSkipped === true || Boolean(jt)
  const step3 = f.conversationReady || f.conversationNeedsInfo || f.conversationSkipped
  const step4 = f.mediaSkipped || f.mediaAdded || o.entityCount > 0
  const step5 = f.jobDetailsSkipped || f.jobDetailsProvided || Boolean(o.jobDetailsText.trim())
  return Boolean(step2 && step3 && step4 && step5)
}
