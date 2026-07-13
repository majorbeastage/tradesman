import type { SupabaseClient } from "@supabase/supabase-js"
import {
  parseEstimateLinePresetsFromMetadata,
  serializePresetForProfile,
  type EstimateLinePresetRow,
} from "./estimateLinePresets"
import { parseSpokenLineItem } from "./parseSpokenLineItem"
import { saveJobTypeForUser } from "./jobTypesApi"
import {
  syncLeadFilterAcceptedJobTypesIfEmpty,
  notifyBusinessAiVocabularyChanged,
} from "./businessAiVocabulary"

export type JobSetupDraftDetail = {
  durationHours: string
  lineItemsText: string
  materialsNotes: string
}

const JOB_TYPE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#0f766e", "#F97316"]

function splitListField(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;\n]+/)) {
    const item = part.trim()
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= 24) break
  }
  return out
}

function linePhrasesFromText(raw: string): string[] {
  const out: string[] = []
  for (const line of raw.split(/\n+/)) {
    for (const part of line.split(/[,;]+/)) {
      const t = part.trim()
      if (t) out.push(t)
    }
  }
  return out.slice(0, 20)
}

export async function applyEstimatesJobSetupWizard(
  supabase: SupabaseClient,
  userId: string,
  jobNames: string[],
  detailsByName: Record<string, JobSetupDraftDetail>,
): Promise<string> {
  if (jobNames.length === 0) throw new Error("Add at least one job type.")

  const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (fetchErr) throw new Error(fetchErr.message)
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}

  let presets = parseEstimateLinePresetsFromMetadata(prevMeta)
  const createdTypes: string[] = []
  const createdLines: string[] = []

  for (let i = 0; i < jobNames.length; i++) {
    const name = jobNames[i]!.trim()
    if (!name) continue
    const detail = detailsByName[name] ?? { durationHours: "2", lineItemsText: "", materialsNotes: "" }
    const hours = Number.parseFloat(detail.durationHours) || 2
    const duration_minutes = Math.max(15, Math.round(hours * 60))
    const color_hex = JOB_TYPE_COLORS[i % JOB_TYPE_COLORS.length]!

    const { id: jobTypeId, error: jtErr } = await saveJobTypeForUser(
      supabase,
      userId,
      {
        name: name.slice(0, 120),
        description: null,
        duration_minutes,
        color_hex,
        materials_list: detail.materialsNotes.trim() || null,
        track_mileage: false,
      },
      null,
    )
    if (jtErr || !jobTypeId) throw new Error(jtErr ?? `Could not create job type “${name}”.`)

    createdTypes.push(name)
    const phraseList = linePhrasesFromText(detail.lineItemsText)

    for (const phrase of phraseList) {
      const parsed = parseSpokenLineItem(phrase)
      if (!parsed) continue
      const row: EstimateLinePresetRow = {
        id: crypto.randomUUID(),
        description: `${parsed.title}${parsed.description !== parsed.title ? ` — ${parsed.description}` : ""}`.slice(0, 500),
        quantity: parsed.quantity,
        unit_price: parsed.unit_price,
        line_kind: parsed.line_kind,
        unit_basis: parsed.unit_basis,
        linked_job_type_ids: [jobTypeId],
      }
      presets = [...presets, row]
      createdLines.push(parsed.title)
    }
  }

  prevMeta.estimate_line_presets = presets.map(serializePresetForProfile)
  const { error: upErr } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
  if (upErr) throw new Error(upErr.message)

  await syncLeadFilterAcceptedJobTypesIfEmpty(supabase, userId, createdTypes)
  notifyBusinessAiVocabularyChanged()

  const typePart = createdTypes.length === 1 ? `1 job type` : `${createdTypes.length} job types`
  const linePart = createdLines.length > 0 ? ` and ${createdLines.length} saved line item${createdLines.length === 1 ? "" : "s"}` : ""
  return `Created ${typePart}${linePart}. Review them below and adjust anytime.`
}

export { splitListField as splitJobSetupListField }
