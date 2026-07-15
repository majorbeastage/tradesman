import type { SupabaseClient } from "@supabase/supabase-js"

export type LibraryCategory = {
  id: string
  title: string
  color: string
  icon_id: string
  built_in?: boolean
}

export type LibraryCategorySettings = {
  categories: LibraryCategory[]
  assignments: Record<string, string>
}

export const SAVED_LINE_DEFAULT_CATEGORIES: LibraryCategory[] = [
  { id: "line-labor", title: "Labor", color: "#0ea5e9", icon_id: "people", built_in: true },
  { id: "line-material", title: "Materials", color: "#f59e0b", icon_id: "toolbox", built_in: true },
  { id: "line-travel", title: "Travel expenses", color: "#8b5cf6", icon_id: "truck", built_in: true },
  { id: "line-misc", title: "Miscellaneous", color: "#64748b", icon_id: "none", built_in: true },
]

export const JOB_TYPE_DEFAULT_CATEGORIES: LibraryCategory[] = [
  { id: "job-general", title: "General", color: "#64748b", icon_id: "toolbox", built_in: true },
]

function cleanCategory(raw: unknown): LibraryCategory | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const id = typeof value.id === "string" ? value.id.trim().slice(0, 80) : ""
  const title = typeof value.title === "string" ? value.title.trim().slice(0, 80) : ""
  if (!id || !title) return null
  const color =
    typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : "#64748b"
  const icon_id = typeof value.icon_id === "string" ? value.icon_id.trim().slice(0, 40) : "none"
  return { id, title, color, icon_id }
}

function parseAssignments(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (const [itemId, categoryId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof categoryId === "string" && categoryId.trim()) result[itemId] = categoryId.trim().slice(0, 80)
  }
  return result
}

function mergeDefaults(defaults: LibraryCategory[], custom: LibraryCategory[]): LibraryCategory[] {
  const customById = new Map(custom.map((category) => [category.id, category]))
  return [
    ...defaults.map((category) => ({ ...category, ...(customById.get(category.id) ?? {}), built_in: true })),
    ...custom.filter((category) => !defaults.some((fallback) => fallback.id === category.id)),
  ]
}

export function savedLineCategoryIdFromKind(kind: string | undefined): string {
  if (kind === "material" || kind === "materials") return "line-material"
  if (kind === "travel") return "line-travel"
  if (kind === "misc") return "line-misc"
  return "line-labor"
}

/** Map built-in category ids to line_kind; custom categories default to labor. */
export function lineKindFromCategoryId(categoryId: string): string {
  if (categoryId === "line-material") return "material"
  if (categoryId === "line-travel") return "travel"
  if (categoryId === "line-misc") return "misc"
  return "labor"
}

export async function loadLibraryCategorySettings(
  supabase: SupabaseClient,
  userId: string,
  scope: "saved_lines" | "job_types",
): Promise<LibraryCategorySettings> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const key = scope === "saved_lines" ? "estimate_line_categories" : "job_type_categories"
  const assignmentKey = scope === "saved_lines" ? "estimate_line_category_assignments" : "job_type_category_assignments"
  const custom = Array.isArray(metadata[key])
    ? (metadata[key] as unknown[]).map(cleanCategory).filter((item): item is LibraryCategory => item != null)
    : []
  return {
    categories: mergeDefaults(
      scope === "saved_lines" ? SAVED_LINE_DEFAULT_CATEGORIES : JOB_TYPE_DEFAULT_CATEGORIES,
      custom,
    ),
    assignments: parseAssignments(metadata[assignmentKey]),
  }
}

export async function persistLibraryCategorySettings(
  supabase: SupabaseClient,
  userId: string,
  scope: "saved_lines" | "job_types",
  settings: LibraryCategorySettings,
): Promise<string | null> {
  const { data, error: fetchError } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (fetchError) return fetchError.message
  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const categoryKey = scope === "saved_lines" ? "estimate_line_categories" : "job_type_categories"
  const assignmentKey = scope === "saved_lines" ? "estimate_line_category_assignments" : "job_type_category_assignments"
  metadata[categoryKey] = settings.categories.map(({ id, title, color, icon_id }) => ({
    id,
    title: title.trim().slice(0, 80),
    color,
    icon_id,
  }))
  metadata[assignmentKey] = settings.assignments
  const { error } = await supabase.from("profiles").update({ metadata }).eq("id", userId)
  return error?.message ?? null
}
