/**
 * Admin-managed live vocabulary for the platform assistant (stored in platform_settings).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeAssistantPhrase } from "./platformAssistantVocabulary"
import type { AdminPanelId } from "./platformAssistantRegistry"
import type { AssistantHandoffMode, SpecialistAssistantId } from "./assistantHandoff"
import type { SetupMiniWizardId } from "./setupGuideWizards"

export const PLATFORM_ASSISTANT_VOCABULARY_KEY = "platform_assistant_vocabulary"

export type AssistantVocabularyMatchMode = "contains" | "exact" | "starts_with"

/** Serializable action admins can assign to a phrase (no clarify / open_customer). */
export type AssistantCustomActionPayload =
  | { type: "navigate"; page: string; message?: string }
  | { type: "open_setup_guide"; message?: string }
  | { type: "open_mini_wizard"; wizardId: SetupMiniWizardId; message?: string }
  | { type: "open_admin"; panel: AdminPanelId; message?: string }
  | { type: "find_customer"; query: string; message?: string }
  | { type: "open_last_missed_call"; message?: string }
  | { type: "open_current_customer"; message?: string }
  | { type: "create_estimate"; customerQuery?: string; useSelectedCustomer?: boolean; message?: string }
  | { type: "focus_customer_sms"; customerQuery?: string; useSelectedCustomer?: boolean; message?: string }
  | { type: "explain"; message?: string }
  | {
      type: "handoff_specialist_assistant"
      specialist: SpecialistAssistantId
      scopeText: string
      jobTypeName?: string
      mode: AssistantHandoffMode
      message?: string
    }

export type AssistantCustomVocabularyEntry = {
  id: string
  phrase: string
  match: AssistantVocabularyMatchMode
  action: AssistantCustomActionPayload
  enabled: boolean
  note?: string
  createdAt: string
  createdBy?: string
}

export type PlatformAssistantVocabularyStore = {
  entries: AssistantCustomVocabularyEntry[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

export function parsePlatformAssistantVocabularyStore(raw: unknown): PlatformAssistantVocabularyStore {
  if (!isRecord(raw)) return { entries: [] }
  const list = raw.entries
  if (!Array.isArray(list)) return { entries: [] }
  const entries: AssistantCustomVocabularyEntry[] = []
  for (const row of list) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.phrase !== "string") continue
    const action = row.action
    if (!isRecord(action) || typeof action.type !== "string") continue
    const match =
      row.match === "exact" || row.match === "starts_with" || row.match === "contains" ? row.match : "contains"
    entries.push({
      id: row.id.slice(0, 64),
      phrase: row.phrase.trim().slice(0, 240),
      match,
      action: action as AssistantCustomActionPayload,
      enabled: row.enabled !== false,
      note: typeof row.note === "string" ? row.note.slice(0, 400) : undefined,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
      createdBy: typeof row.createdBy === "string" ? row.createdBy.slice(0, 64) : undefined,
    })
  }
  return { entries: entries.filter((e) => e.phrase.length > 0) }
}

function phraseMatches(text: string, entry: AssistantCustomVocabularyEntry): boolean {
  const norm = normalizeAssistantPhrase(text).toLowerCase()
  const p = normalizeAssistantPhrase(entry.phrase).toLowerCase()
  if (!norm || !p) return false
  if (entry.match === "exact") return norm === p
  if (entry.match === "starts_with") return norm.startsWith(p)
  return norm.includes(p)
}

function defaultMessage(action: AssistantCustomActionPayload): string {
  switch (action.type) {
    case "navigate":
      return `Opening ${action.page}.`
    case "open_setup_guide":
      return "Opening the Setup Guide."
    case "open_mini_wizard":
      return "Opening setup wizard."
    case "open_admin":
      return "Opening admin."
    case "find_customer":
      return `Looking up ${action.query}…`
    case "open_last_missed_call":
      return "Opening last missed call…"
    case "open_current_customer":
      return "Opening this customer."
    case "create_estimate":
      return "Starting estimate."
    case "focus_customer_sms":
      return "Opening SMS compose."
    case "explain":
      return "Here is what you can do on this screen."
    case "handoff_specialist_assistant":
      return "Opening estimate specialist…"
    default:
      return "OK."
  }
}

export function resolveCustomVocabularyAction(
  payload: AssistantCustomActionPayload,
  ctx: { selectedCustomerId?: string | null; selectedCustomerName?: string | null },
): AssistantCustomActionPayload | null {
  const msg = payload.message?.trim() || defaultMessage(payload)
  switch (payload.type) {
    case "navigate":
      if (!payload.page?.trim()) return null
      return { type: "navigate", page: payload.page.trim(), message: msg }
    case "open_setup_guide":
      return { type: "open_setup_guide", message: msg }
    case "open_mini_wizard":
      if (!payload.wizardId) return null
      return { type: "open_mini_wizard", wizardId: payload.wizardId, message: msg }
    case "open_admin":
      if (!payload.panel) return null
      return { type: "open_admin", panel: payload.panel, message: msg }
    case "find_customer": {
      const q = payload.query?.trim()
      if (!q) return null
      return { type: "find_customer", query: q, message: msg }
    }
    case "open_last_missed_call":
      return { type: "open_last_missed_call", message: msg }
    case "open_current_customer":
      return { type: "open_current_customer", message: msg }
    case "create_estimate": {
      if (payload.useSelectedCustomer && ctx.selectedCustomerId) {
        return { type: "create_estimate", useSelectedCustomer: true, message: msg }
      }
      const q = payload.customerQuery?.trim()
      if (q) return { type: "create_estimate", customerQuery: q, message: msg }
      if (ctx.selectedCustomerId) {
        return { type: "create_estimate", useSelectedCustomer: true, message: msg }
      }
      return { type: "create_estimate", message: msg }
    }
    case "focus_customer_sms": {
      if (payload.useSelectedCustomer && ctx.selectedCustomerId) {
        return { type: "focus_customer_sms", useSelectedCustomer: true, message: msg }
      }
      const q = payload.customerQuery?.trim()
      if (q) return { type: "focus_customer_sms", customerQuery: q, message: msg }
      if (ctx.selectedCustomerId) {
        return { type: "focus_customer_sms", useSelectedCustomer: true, message: msg }
      }
      return { type: "focus_customer_sms", message: msg }
    }
    case "explain":
      return { type: "explain", message: msg }
    case "handoff_specialist_assistant": {
      const scope = payload.scopeText?.trim()
      if (!scope || scope.length < 4 || !payload.specialist) return null
      return {
        type: "handoff_specialist_assistant",
        specialist: payload.specialist,
        scopeText: scope.slice(0, 2000),
        jobTypeName: payload.jobTypeName?.trim() || undefined,
        mode: payload.mode === "job_type_with_lines" ? "job_type_with_lines" : "line_items_only",
        message: msg,
      }
    }
    default:
      return null
  }
}

export function matchCustomVocabularyEntry(
  text: string,
  entries: AssistantCustomVocabularyEntry[],
  ctx: { selectedCustomerId?: string | null; selectedCustomerName?: string | null },
): AssistantCustomActionPayload | null {
  const enabled = entries.filter((e) => e.enabled)
  const sorted = [...enabled].sort((a, b) => b.phrase.length - a.phrase.length)
  for (const entry of sorted) {
    if (!phraseMatches(text, entry)) continue
    const action = resolveCustomVocabularyAction(entry.action, ctx)
    if (action) return action
  }
  return null
}

export function buildCustomVocabularyCatalogSection(entries: AssistantCustomVocabularyEntry[]): string {
  const enabled = entries.filter((e) => e.enabled)
  if (!enabled.length) return ""
  const lines: string[] = []
  lines.push("## Admin-trained phrases (live — highest priority)")
  for (const e of enabled.slice(0, 80)) {
    const a = e.action
    let desc: string = a.type
    if (a.type === "navigate") desc = `navigate → ${a.page}`
    else if (a.type === "find_customer") desc = `find_customer → ${a.query}`
    else if (a.type === "create_estimate") {
      desc = a.useSelectedCustomer
        ? "create_estimate (use customer open on screen)"
        : a.customerQuery
          ? `create_estimate → ${a.customerQuery}`
          : "create_estimate"
    } else if (a.type === "focus_customer_sms") {
      desc = a.useSelectedCustomer ? "focus_customer_sms (open customer on screen)" : "focus_customer_sms"
    } else if (a.type === "open_mini_wizard") desc = `open_mini_wizard → ${a.wizardId}`
    else if (a.type === "handoff_specialist_assistant") {
      desc = `handoff → ${a.specialist} (${a.mode})`
    }
    lines.push(`- When user says “${e.phrase}” (${e.match}) → **${desc}**`)
  }
  lines.push("")
  return lines.join("\n")
}

export async function loadPlatformAssistantVocabulary(
  supabase: SupabaseClient,
): Promise<AssistantCustomVocabularyEntry[]> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_ASSISTANT_VOCABULARY_KEY)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return parsePlatformAssistantVocabularyStore(data?.value).entries
}

export async function savePlatformAssistantVocabulary(
  supabase: SupabaseClient,
  entries: AssistantCustomVocabularyEntry[],
): Promise<void> {
  const { error } = await supabase.from("platform_settings").upsert(
    {
      key: PLATFORM_ASSISTANT_VOCABULARY_KEY,
      value: { entries: entries.slice(0, 200) },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  )
  if (error) throw new Error(error.message)
}

export const ASSISTANT_VOCABULARY_ACTION_OPTIONS: Array<{
  value: AssistantCustomActionPayload["type"]
  label: string
}> = [
  { value: "handoff_specialist_assistant", label: "Hand off to estimate specialist (AI lines)" },
  { value: "create_estimate", label: "Start / open estimate (quote)" },
  { value: "focus_customer_sms", label: "Open SMS compose for customer" },
  { value: "find_customer", label: "Find customer by name" },
  { value: "open_current_customer", label: "Open customer on screen" },
  { value: "open_last_missed_call", label: "Last missed call" },
  { value: "navigate", label: "Go to app tab" },
  { value: "open_setup_guide", label: "Setup guide" },
  { value: "open_mini_wizard", label: "Setup mini-wizard" },
  { value: "explain", label: "Explain this screen" },
  { value: "open_admin", label: "Admin portal panel" },
]
