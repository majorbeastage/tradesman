/** Workflow urgency for the Customers hub (distinct from job pipeline stage). */

import { formatDisplayText } from "./formatDisplayText"

export const COMMUNICATION_URGENCY_LEVELS = [
  "Good Standing",
  "Needs Attention",
  "Critical",
  "Suspected Spam",
  "Complete",
  "Lost",
] as const

export type CommunicationUrgency = (typeof COMMUNICATION_URGENCY_LEVELS)[number]

const RANK: Record<string, number> = {
  "Good Standing": 1,
  "Needs Attention": 2,
  Critical: 3,
  "Suspected Spam": 6,
  Complete: 4,
  Lost: 5,
}

export function normalizeCommunicationUrgency(raw: string | null | undefined): CommunicationUrgency {
  const t =
    typeof raw === "string"
      ? raw.trim()
      : raw != null && typeof raw === "object"
        ? formatDisplayText(raw, "").trim()
        : String(raw ?? "").trim()
  const legacy = t === "Priority" ? "Critical" : t === "In Process" ? "Good Standing" : t
  if ((COMMUNICATION_URGENCY_LEVELS as readonly string[]).includes(legacy)) return legacy as CommunicationUrgency
  return "Good Standing"
}

export function urgencyRank(u: CommunicationUrgency): number {
  return RANK[u] ?? RANK["Good Standing"]
}

/**
 * Bad fits (suspected spam / no real answers) map to Suspected Spam.
 * Clearing a bad fit restores Good Standing when the row was still in that category.
 * Complete and Lost are left alone.
 */
export function urgencyPatchFromFitClassification(
  classification: string,
  currentRaw: string | null | undefined,
): CommunicationUrgency | null {
  const current = normalizeCommunicationUrgency(currentRaw)
  if (classification === "bad") {
    if (current === "Complete" || current === "Lost") return null
    return "Suspected Spam"
  }
  if (current === "Suspected Spam") return "Good Standing"
  return null
}

export type CustomersUrgencyAutomationPrefs = {
  v: 1
  enabled: boolean
  unit: "hours" | "days"
  amount: number
}

export function parseCustomersUrgencyAutomation(meta: unknown): CustomersUrgencyAutomationPrefs | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const m = meta as Record<string, unknown>
  const raw = m.customers_urgency_automation
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const enabled = o.enabled === true
  const unit = o.unit === "hours" ? "hours" : "days"
  const amt = typeof o.amount === "number" && Number.isFinite(o.amount) ? o.amount : Number.parseFloat(String(o.amount ?? ""))
  const amount = Number.isFinite(amt) && amt > 0 ? amt : 0
  return { v: 1, enabled, unit, amount }
}

function thresholdMs(prefs: CustomersUrgencyAutomationPrefs): number {
  const base = prefs.unit === "hours" ? 3600000 : 86400000
  return prefs.amount * base
}

/**
 * If the customer has had no communication activity for longer than the configured threshold,
 * escalate one step: Good Standing → Needs Attention → Critical. Skips Complete, Lost, Suspected Spam, and Critical (cap).
 */
export function nextUrgencyAfterSilence(
  current: CommunicationUrgency,
  prefs: CustomersUrgencyAutomationPrefs | null,
  lastActivityMs: number,
  nowMs: number,
): CommunicationUrgency | null {
  if (!prefs?.enabled || prefs.amount <= 0) return null
  if (current === "Complete" || current === "Lost" || current === "Suspected Spam") return null
  if (current === "Critical") return null
  if (!Number.isFinite(lastActivityMs) || lastActivityMs <= 0) return null
  if (nowMs - lastActivityMs <= thresholdMs(prefs)) return null
  if (current === "Good Standing") return "Needs Attention"
  if (current === "Needs Attention") return "Critical"
  return null
}
