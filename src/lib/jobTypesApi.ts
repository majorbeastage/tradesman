import type { SupabaseClient } from "@supabase/supabase-js"
import {
  parseEstimateLinePresetsFromMetadata,
  serializePresetForProfile,
  type EstimateLinePresetRow,
} from "./estimateLinePresets"

export type JobTypeRow = {
  id: string
  name: string
  description?: string | null
  duration_minutes: number
  color_hex?: string | null
  materials_list?: string | null
  track_mileage?: boolean | null
}

export function sortJobTypesByName(rows: JobTypeRow[]): JobTypeRow[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

function em(error: { message?: string } | null): string {
  return (error?.message ?? "").toLowerCase()
}

export async function loadJobTypesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: JobTypeRow[]; error: string | null }> {
  let q = await supabase
    .from("job_types")
    .select("id, name, description, duration_minutes, color_hex, materials_list, track_mileage")
    .eq("user_id", userId)
    .order("name")
  let rows = (q.data ?? []) as JobTypeRow[]
  let error = q.error
  if (error && (em(error).includes("track_mileage") || em(error).includes("materials_list"))) {
    const q2 = await supabase
      .from("job_types")
      .select("id, name, description, duration_minutes, color_hex, materials_list")
      .eq("user_id", userId)
      .order("name")
    rows = (q2.data ?? []) as JobTypeRow[]
    error = q2.error
  }
  if (error?.message?.toLowerCase().includes("materials_list")) {
    const q3 = await supabase
      .from("job_types")
      .select("id, name, description, duration_minutes, color_hex")
      .eq("user_id", userId)
      .order("name")
    rows = (q3.data ?? []) as JobTypeRow[]
    error = q3.error
  }
  if (error) return { rows: [], error: error.message }
  return { rows, error: null }
}

export type JobTypeSaveInput = {
  name: string
  description: string | null
  duration_minutes: number
  color_hex: string
  materials_list: string | null
  track_mileage: boolean
}

export async function saveJobTypeForUser(
  supabase: SupabaseClient,
  userId: string,
  input: JobTypeSaveInput,
  editingId?: string | null,
): Promise<{ id: string | null; error: string | null }> {
  let patch: Record<string, unknown> = {
    name: input.name.trim(),
    description: input.description,
    duration_minutes: input.duration_minutes,
    color_hex: input.color_hex,
    materials_list: input.materials_list,
    track_mileage: input.track_mileage,
  }

  const runUpdate = async () =>
    supabase.from("job_types").update(patch).eq("id", editingId!).eq("user_id", userId)
  const runInsert = async () =>
    supabase.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()

  if (editingId) {
    let r = await runUpdate()
    if (r.error && em(r.error).includes("track_mileage")) {
      const { track_mileage: _t, ...rest } = patch
      patch = rest
      r = await runUpdate()
    }
    if (r.error && em(r.error).includes("materials_list")) {
      const { materials_list: _m, ...rest } = patch
      patch = { ...rest }
      r = await runUpdate()
    }
    if (r.error) return { id: null, error: r.error.message }
    return { id: editingId, error: null }
  }

  let r = await runInsert()
  if (r.error && em(r.error).includes("track_mileage")) {
    const { track_mileage: _t, ...rest } = patch
    patch = rest
    r = await runInsert()
  }
  if (r.error && em(r.error).includes("materials_list")) {
    const { materials_list: _m, ...rest } = patch
    patch = { ...rest }
    r = await runInsert()
  }
  if (r.error) return { id: null, error: r.error.message }
  const id = String((r.data as { id?: string } | null)?.id ?? "").trim() || null
  return { id, error: null }
}

export async function deleteJobTypeForUser(
  supabase: SupabaseClient,
  userId: string,
  jobTypeId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("job_types").delete().eq("id", jobTypeId).eq("user_id", userId)
  return { error: error?.message ?? null }
}

export async function loadEstimateLinePresetsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<EstimateLinePresetRow[]> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parseEstimateLinePresetsFromMetadata(meta)
}

export async function persistEstimateLinePresetsForUser(
  supabase: SupabaseClient,
  userId: string,
  next: EstimateLinePresetRow[],
): Promise<{ error: string | null; rows: EstimateLinePresetRow[] }> {
  const trimmed = next.filter((p) => p.description.trim())
  const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (fetchErr) return { error: fetchErr.message, rows: trimmed }
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  prevMeta.estimate_line_presets = trimmed.map(serializePresetForProfile)
  const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
  if (error) return { error: error.message, rows: trimmed }
  return { error: null, rows: trimmed }
}

export async function mergePresetLinksForJobType(
  supabase: SupabaseClient,
  userId: string,
  presets: EstimateLinePresetRow[],
  jobTypeId: string,
  checks: Record<string, boolean>,
): Promise<{ error: string | null; rows: EstimateLinePresetRow[] }> {
  const merged = presets.map((p) => {
    const want = checks[p.id] === true
    const set = new Set(p.linked_job_type_ids ?? [])
    if (want) set.add(jobTypeId)
    else set.delete(jobTypeId)
    return { ...p, linked_job_type_ids: Array.from(set) }
  })
  return persistEstimateLinePresetsForUser(supabase, userId, merged)
}

export async function stripJobTypeFromPresets(
  supabase: SupabaseClient,
  userId: string,
  presets: EstimateLinePresetRow[],
  jobTypeId: string,
): Promise<{ error: string | null; rows: EstimateLinePresetRow[] }> {
  const stripped = presets.map((p) => ({
    ...p,
    linked_job_type_ids: (p.linked_job_type_ids ?? []).filter((id) => id !== jobTypeId),
  }))
  return persistEstimateLinePresetsForUser(supabase, userId, stripped)
}
