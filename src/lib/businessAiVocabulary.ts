/**
 * Per-tenant job type + saved line item vocabulary for AI, speech hints, parsing, and lead fit.
 * Reload on save via notifyBusinessAiVocabularyChanged().
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { parseEstimateLinePresetsFromMetadata, type EstimateLinePresetRow } from "./estimateLinePresets"
import { loadJobTypesForUser } from "./jobTypesApi"

export const BUSINESS_AI_VOCABULARY_CHANGED_EVENT = "tradesman-business-vocabulary-changed"

export type BusinessAiLineTemplate = {
  description: string
  quantity: number
  unit_price: number
  line_kind?: string
  linked_job_type_names: string[]
}

export type BusinessAiVocabulary = {
  jobTypeNames: string[]
  jobTypeMaterials: string[]
  lineItemDescriptions: string[]
  lineItemKeywords: string[]
  savedLineTemplates: BusinessAiLineTemplate[]
  acceptedJobTypesText: string
  speechHints: string[]
}

export function notifyBusinessAiVocabularyChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(BUSINESS_AI_VOCABULARY_CHANGED_EVENT))
}

function tokenizeKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;/\-–—]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 48)
}

function splitMaterialsList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 24)
}

function readAcceptedJobTypesFromMetadata(meta: Record<string, unknown>): string {
  const prefs = meta.lead_filter_preferences
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return ""
  const raw = (prefs as { accepted_job_types?: unknown }).accepted_job_types
  return typeof raw === "string" ? raw.trim() : ""
}

export function buildBusinessAiVocabulary(params: {
  jobTypes: Array<{ id: string; name: string; materials_list?: string | null }>
  presets: EstimateLinePresetRow[]
  acceptedJobTypesText?: string
}): BusinessAiVocabulary {
  const jobTypeById = new Map(params.jobTypes.map((j) => [j.id, j.name.trim()]))
  const jobTypeNames = [...new Set(params.jobTypes.map((j) => j.name.trim()).filter(Boolean))]
  const jobTypeMaterials = [...new Set(params.jobTypes.flatMap((j) => splitMaterialsList(j.materials_list)))]

  const lineItemDescriptions = [...new Set(params.presets.map((p) => p.description.trim()).filter(Boolean))]
  const keywordSet = new Set<string>()
  for (const name of jobTypeNames) for (const t of tokenizeKeywords(name)) keywordSet.add(t)
  for (const desc of lineItemDescriptions) for (const t of tokenizeKeywords(desc)) keywordSet.add(t)
  for (const m of jobTypeMaterials) for (const t of tokenizeKeywords(m)) keywordSet.add(t)

  const savedLineTemplates = params.presets.slice(0, 48).map((p) => ({
    description: p.description.trim(),
    quantity: p.quantity,
    unit_price: p.unit_price,
    line_kind: p.line_kind,
    linked_job_type_names: (p.linked_job_type_ids ?? []).map((id) => jobTypeById.get(id) ?? "").filter(Boolean),
  }))

  const speechHints = [...jobTypeNames, ...lineItemDescriptions.map((d) => d.slice(0, 72)), ...jobTypeMaterials].slice(0, 48)

  return {
    jobTypeNames,
    jobTypeMaterials,
    lineItemDescriptions,
    lineItemKeywords: [...keywordSet].slice(0, 160),
    savedLineTemplates,
    acceptedJobTypesText: params.acceptedJobTypesText?.trim() ?? "",
    speechHints,
  }
}

export async function loadBusinessAiVocabulary(supabase: SupabaseClient, userId: string): Promise<BusinessAiVocabulary> {
  const [{ rows: jobTypes }, { data: profile }] = await Promise.all([
    loadJobTypesForUser(supabase, userId),
    supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle(),
  ])
  const meta =
    profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? (profile.metadata as Record<string, unknown>)
      : {}
  return buildBusinessAiVocabulary({
    jobTypes: jobTypes.map((j) => ({ id: j.id, name: j.name, materials_list: j.materials_list })),
    presets: parseEstimateLinePresetsFromMetadata(meta),
    acceptedJobTypesText: readAcceptedJobTypesFromMetadata(meta),
  })
}

/** LLM / classifier context block — inject after job types & line items are saved. */
export function formatBusinessAiVocabularyForLlm(vocab: BusinessAiVocabulary): string {
  if (vocab.jobTypeNames.length === 0 && vocab.lineItemDescriptions.length === 0) return ""

  const lines: string[] = []
  lines.push("### This account's job types & saved line items (use as primary vocabulary)")
  lines.push(
    "When parsing scope, screening calls, suggesting estimate lines, or matching inbound leads, **prefer these exact names and descriptions** over generic trade guesses.",
  )
  lines.push("")

  if (vocab.jobTypeNames.length) {
    lines.push(`**Job types:** ${vocab.jobTypeNames.join("; ").slice(0, 900)}`)
  }
  if (vocab.jobTypeMaterials.length) {
    lines.push(`**Typical materials / parts:** ${vocab.jobTypeMaterials.join("; ").slice(0, 700)}`)
  }
  if (vocab.savedLineTemplates.length) {
    lines.push("**Saved line templates (reuse when scope matches):**")
    for (const t of vocab.savedLineTemplates.slice(0, 24)) {
      const link =
        t.linked_job_type_names.length > 0 ? ` [${t.linked_job_type_names.join(", ")}]` : ""
      const price =
        t.unit_price > 0 ? ` — qty ${t.quantity} @ $${t.unit_price.toFixed(2)}` : ` — qty ${t.quantity}`
      lines.push(`- ${t.description}${price}${link}`)
    }
  }
  if (vocab.lineItemKeywords.length) {
    lines.push(`**Keywords to listen for:** ${vocab.lineItemKeywords.slice(0, 48).join(", ").slice(0, 600)}`)
  }
  return lines.join("\n")
}

/** Twilio Gather hints attribute value (comma-separated, length-capped). */
export function twilioSpeechHintsCsv(vocab: BusinessAiVocabulary, maxLen = 480): string {
  const parts: string[] = []
  let len = 0
  for (const hint of vocab.speechHints) {
    const piece = hint.replace(/,/g, " ").trim()
    if (!piece) continue
    const add = (parts.length ? ", " : "") + piece
    if (len + add.length > maxLen) break
    parts.push(piece)
    len += add.length
  }
  return parts.join(", ")
}

/** Match longest saved job type name mentioned in free text. */
export function matchJobTypeNameInText(text: string, jobTypeNames: string[]): string | undefined {
  const lower = text.toLowerCase()
  let best: { name: string; len: number } | undefined
  for (const name of jobTypeNames) {
    const n = name.trim()
    if (n.length < 2) continue
    if (lower.includes(n.toLowerCase()) && (!best || n.length > best.len)) {
      best = { name: n, len: n.length }
    }
  }
  return best?.name
}

/** Lead-fit + screening token list: lead filter string + job types + line descriptions. */
export function mergedAcceptedJobTypeTokenList(vocab: BusinessAiVocabulary): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (s: string) => {
    const k = s.trim().toLowerCase()
    if (k.length >= 2 && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  for (const part of vocab.acceptedJobTypesText.split(/[\n,;]+/)) add(part)
  for (const name of vocab.jobTypeNames) add(name)
  for (const desc of vocab.lineItemDescriptions) add(desc)
  return out
}

/** After setup wizard — seed lead filter accepted types when the client has not configured them. */
export async function syncLeadFilterAcceptedJobTypesIfEmpty(
  supabase: SupabaseClient,
  userId: string,
  jobTypeNames: string[],
): Promise<void> {
  const names = [...new Set(jobTypeNames.map((n) => n.trim()).filter(Boolean))]
  if (names.length === 0) return

  const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (fetchErr || !data) return

  const prevMeta =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}

  const prefsRaw = prevMeta.lead_filter_preferences
  const prefs: Record<string, unknown> =
    prefsRaw && typeof prefsRaw === "object" && !Array.isArray(prefsRaw)
      ? { ...(prefsRaw as Record<string, unknown>) }
      : { v: 1 }

  const current = typeof prefs.accepted_job_types === "string" ? prefs.accepted_job_types.trim() : ""
  if (current) return

  prefs.accepted_job_types = names.join(", ")
  prevMeta.lead_filter_preferences = prefs
  await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
}
