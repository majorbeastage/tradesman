import { loadBusinessWorkflowFromMetadata, sortedWorkflowNodes } from "./businessWorkflow"
import type { TabNotificationPrefs } from "../types/notificationPreferences"

/** Workflow step labels used for Customers tab alert checkboxes (matches job_pipeline_status labels). */
export function workflowStepLabelsForAlerts(metadata: unknown): string[] {
  const workflow = loadBusinessWorkflowFromMetadata(metadata)
  return sortedWorkflowNodes(workflow)
    .map((n) => n.label.trim())
    .filter(Boolean)
}

export function sanitizeAlertStatusList(saved: string[], valid: readonly string[]): string[] {
  const validSet = new Set(valid)
  return saved.filter((s) => validSet.has(s))
}

export function sanitizeTabNotificationPrefsForStatuses(
  prefs: TabNotificationPrefs,
  valid: readonly string[],
): TabNotificationPrefs {
  return {
    ...prefs,
    push: { ...prefs.push, statuses: sanitizeAlertStatusList(prefs.push.statuses, valid) },
    email: { ...prefs.email, statuses: sanitizeAlertStatusList(prefs.email.statuses, valid) },
    sms: { ...prefs.sms, statuses: sanitizeAlertStatusList(prefs.sms.statuses, valid) },
  }
}
