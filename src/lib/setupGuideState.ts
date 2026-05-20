/** Profile metadata keys for the platform setup guide and global assistant. */

export const SETUP_GUIDE_COMPLETED_AT_KEY = "setup_guide_completed_at"
export const SETUP_GUIDE_PROGRESS_KEY = "setup_guide_progress"
export const GLOBAL_ASSISTANT_MIC_ENABLED_KEY = "global_assistant_mic_enabled"

export type SetupGuideProgress = {
  initial_started_at?: string
  steps_completed?: string[]
}

export function parseSetupGuideProgress(raw: unknown): SetupGuideProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const steps = Array.isArray(o.steps_completed)
    ? o.steps_completed.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined
  return {
    initial_started_at: typeof o.initial_started_at === "string" ? o.initial_started_at : undefined,
    steps_completed: steps,
  }
}

export function hasCompletedInitialSetup(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false
  const completed = meta[SETUP_GUIDE_COMPLETED_AT_KEY]
  return typeof completed === "string" && completed.trim().length > 0
}

export function isGlobalAssistantMicEnabled(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return true
  const v = meta[GLOBAL_ASSISTANT_MIC_ENABLED_KEY]
  if (v === false) return false
  return true
}

export function mergeSetupGuideCompleted(meta: Record<string, unknown>, atIso?: string): Record<string, unknown> {
  return { ...meta, [SETUP_GUIDE_COMPLETED_AT_KEY]: atIso ?? new Date().toISOString() }
}

export function mergeGlobalAssistantMic(meta: Record<string, unknown>, enabled: boolean): Record<string, unknown> {
  return { ...meta, [GLOBAL_ASSISTANT_MIC_ENABLED_KEY]: enabled }
}
