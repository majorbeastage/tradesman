import type { SupabaseClient } from "@supabase/supabase-js"
import {
  parseEstimateLinePresetsFromMetadata,
  serializePresetForProfile,
  type EstimateLinePresetRow,
} from "./estimateLinePresets"
import { saveJobTypeForUser } from "./jobTypesApi"
import {
  syncLeadFilterAcceptedJobTypesIfEmpty,
  notifyBusinessAiVocabularyChanged,
} from "./businessAiVocabulary"
import type { JobTypeIconId } from "./jobTypeIcons"

export type JobSetupLineDraft = {
  id: string
  description: string
  quantity: number
  unit_price: number
  unit_basis: "hours" | "miles" | "each"
  line_kind: string
  minimum_line_total?: number
}

export type JobSetupDraftDetail = {
  durationHours: string
  lineItemsText: string
  materialsNotes: string
  lines: JobSetupLineDraft[]
  colorHex: string
  iconId: JobTypeIconId
  assignUserId: string | null
  titleOverride?: string
}

const JOB_TYPE_UI_META_KEY = "job_type_ui_v1"

export function emptyJobSetupDetail(colorHex: string): JobSetupDraftDetail {
  return {
    durationHours: "1",
    lineItemsText: "",
    materialsNotes: "",
    lines: [],
    colorHex,
    iconId: "none",
    assignUserId: null,
  }
}

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

async function persistJobTypeUiPrefs(
  supabase: SupabaseClient,
  userId: string,
  jobTypeId: string,
  prefs: { iconId?: string; assignUserId?: string | null },
) {
  const { data, error } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) return
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const raw = prevMeta[JOB_TYPE_UI_META_KEY]
  const map =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  map[jobTypeId] = {
    iconId: prefs.iconId ?? "none",
    assignUserId: prefs.assignUserId ?? null,
  }
  prevMeta[JOB_TYPE_UI_META_KEY] = map
  await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
}

/** Save one job type + its line items immediately (wizard live save). */
export async function applySingleJobTypeSetup(
  supabase: SupabaseClient,
  userId: string,
  jobName: string,
  detail: JobSetupDraftDetail,
): Promise<{ jobTypeId: string; message: string }> {
  const name = (detail.titleOverride?.trim() || jobName).trim()
  if (!name) throw new Error("Job type name is required.")

  const hours = Number.parseFloat(detail.durationHours) || 1
  const duration_minutes = Math.max(15, Math.round(hours * 60))

  const { id: jobTypeId, error: jtErr } = await saveJobTypeForUser(
    supabase,
    userId,
    {
      name: name.slice(0, 120),
      description: detail.materialsNotes.trim() || null,
      duration_minutes,
      color_hex: detail.colorHex,
      materials_list: detail.materialsNotes.trim() || null,
      track_mileage: detail.lines.some((l) => l.line_kind === "travel" || l.unit_basis === "miles"),
    },
    null,
  )
  if (jtErr || !jobTypeId) throw new Error(jtErr ?? `Could not create job type “${name}”.`)

  await persistJobTypeUiPrefs(supabase, userId, jobTypeId, {
    iconId: detail.iconId,
    assignUserId: detail.assignUserId,
  })

  const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (fetchErr) throw new Error(fetchErr.message)
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}

  let presets = parseEstimateLinePresetsFromMetadata(prevMeta)
  const lines = detail.lines.filter((l) => l.description.trim())
  for (const line of lines) {
    const row: EstimateLinePresetRow = {
      id: line.id || crypto.randomUUID(),
      description: line.description.trim().slice(0, 500),
      quantity: line.quantity,
      unit_price: line.unit_price,
      minimum_line_total: line.minimum_line_total,
      line_kind: line.line_kind,
      unit_basis: line.unit_basis,
      linked_job_type_ids: [jobTypeId],
    }
    presets = [...presets, row]
  }

  prevMeta.estimate_line_presets = presets.map(serializePresetForProfile)
  const { error: upErr } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
  if (upErr) throw new Error(upErr.message)

  await syncLeadFilterAcceptedJobTypesIfEmpty(supabase, userId, [name])
  notifyBusinessAiVocabularyChanged()

  const linePart = lines.length ? ` with ${lines.length} line item${lines.length === 1 ? "" : "s"}` : ""
  return { jobTypeId, message: `Saved job type “${name}”${linePart}.` }
}

/** @deprecated batch apply — prefer applySingleJobTypeSetup in the interactive wizard */
export async function applyEstimatesJobSetupWizard(
  supabase: SupabaseClient,
  userId: string,
  jobNames: string[],
  detailsByName: Record<string, JobSetupDraftDetail>,
): Promise<string> {
  if (jobNames.length === 0) throw new Error("Add at least one job type.")
  const saved: string[] = []
  for (const name of jobNames) {
    const detail = detailsByName[name] ?? emptyJobSetupDetail("#0ea5e9")
    const { message } = await applySingleJobTypeSetup(supabase, userId, name, detail)
    saved.push(message)
  }
  return saved.join(" ")
}

export { splitListField as splitJobSetupListField }
