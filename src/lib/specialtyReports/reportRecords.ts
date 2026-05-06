import type { SpecialtyReportTypeKey } from "./reportTypeIds"

export const SPECIALTY_REPORT_REGISTRY_KEY = "specialty_reports_registry_v1"

export type SpecialtyReportRegistryItem = {
  id: string
  report_type: SpecialtyReportTypeKey
  quote_id: string
  customer_id?: string | null
  assigned_user_id?: string | null
  title: string
  status: "draft" | "ready"
  updated_at: string
}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

export function parseSpecialtyReportRegistry(raw: unknown): SpecialtyReportRegistryItem[] {
  if (!Array.isArray(raw)) return []
  const out: SpecialtyReportRegistryItem[] = []
  for (const row of raw) {
    if (!isObject(row)) continue
    const id = typeof row.id === "string" ? row.id.trim() : ""
    const report_type = typeof row.report_type === "string" ? row.report_type.trim() : ""
    const quote_id = typeof row.quote_id === "string" ? row.quote_id.trim() : ""
    const updated_at = typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString()
    if (!id || !report_type || !quote_id) continue
    out.push({
      id,
      report_type: report_type as SpecialtyReportTypeKey,
      quote_id,
      customer_id: typeof row.customer_id === "string" ? row.customer_id : null,
      assigned_user_id: typeof row.assigned_user_id === "string" ? row.assigned_user_id : null,
      title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Report",
      status: row.status === "ready" ? "ready" : "draft",
      updated_at,
    })
  }
  return out
}

export function upsertSpecialtyReportRegistryItem(
  rows: SpecialtyReportRegistryItem[],
  next: SpecialtyReportRegistryItem,
): SpecialtyReportRegistryItem[] {
  const existing = rows.findIndex((r) => r.id === next.id)
  if (existing >= 0) {
    const copy = [...rows]
    copy[existing] = next
    return copy
  }
  return [next, ...rows]
}
