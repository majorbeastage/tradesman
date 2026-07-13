/**
 * Server-safe AI vocabulary helpers for Vercel (no ../src imports).
 * Keep in sync conceptually with src/lib/businessAiVocabulary.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type BusinessAiVocabulary = {
  jobTypeNames: string[]
  jobTypeMaterials: string[]
  lineItemDescriptions: string[]
  lineItemKeywords: string[]
  savedLineTemplates: Array<{
    description: string
    quantity: number
    unit_price: number
    line_kind?: string
    linked_job_type_names: string[]
  }>
  acceptedJobTypesText: string
  speechHints: string[]
}

type JobTypeRow = { id: string; name: string; materials_list?: string | null }
type PresetRow = {
  id: string
  description: string
  quantity: number
  unit_price: number
  linked_job_type_ids?: string[]
  line_kind?: string
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

function parsePresetsFromMetadata(meta: Record<string, unknown>): PresetRow[] {
  const rawPresets = meta.estimate_line_presets
  if (!Array.isArray(rawPresets)) return []
  return rawPresets
    .map((row: unknown) => {
      const o = row as Record<string, unknown>
      const id = typeof o.id === "string" ? o.id : `preset-${Math.random().toString(36).slice(2, 10)}`
      const description = String(o.description ?? "").slice(0, 500)
      const quantity = typeof o.quantity === "number" ? o.quantity : Number.parseFloat(String(o.quantity ?? 0)) || 0
      const unit_price =
        typeof o.unit_price === "number" ? o.unit_price : Number.parseFloat(String(o.unit_price ?? 0)) || 0
      const linkedRaw = o.linked_job_type_ids
      const linked_job_type_ids = Array.isArray(linkedRaw)
        ? linkedRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
        : typeof o.job_type_id === "string" && o.job_type_id.trim()
          ? [o.job_type_id.trim()]
          : undefined
      const line_kind = typeof o.line_kind === "string" && o.line_kind.trim() ? o.line_kind.trim() : undefined
      return { id, description, quantity, unit_price, linked_job_type_ids, line_kind }
    })
    .filter((x) => x.description.trim())
}

async function loadJobTypes(supabase: SupabaseClient, userId: string): Promise<JobTypeRow[]> {
  const q = await supabase
    .from("job_types")
    .select("id, name, materials_list")
    .eq("user_id", userId)
    .order("name")
  if (!q.error) return (q.data ?? []) as JobTypeRow[]
  const q2 = await supabase.from("job_types").select("id, name").eq("user_id", userId).order("name")
  return ((q2.data ?? []) as Array<{ id: string; name: string }>).map((r) => ({
    id: r.id,
    name: r.name,
    materials_list: null,
  }))
}

export function buildBusinessAiVocabulary(params: {
  jobTypes: JobTypeRow[]
  presets: PresetRow[]
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
  const [jobTypes, { data: profile }] = await Promise.all([
    loadJobTypes(supabase, userId),
    supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle(),
  ])
  const meta =
    profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? (profile.metadata as Record<string, unknown>)
      : {}
  return buildBusinessAiVocabulary({
    jobTypes,
    presets: parsePresetsFromMetadata(meta),
    acceptedJobTypesText: readAcceptedJobTypesFromMetadata(meta),
  })
}

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
      const link = t.linked_job_type_names.length > 0 ? ` [${t.linked_job_type_names.join(", ")}]` : ""
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
