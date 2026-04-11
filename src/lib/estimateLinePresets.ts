/** Saved estimate presets (profile metadata.estimate_line_presets). Shared by Quotes + Calendar job-type UIs. */
export type EstimateLinePresetRow = {
  id: string
  description: string
  quantity: number
  unit_price: number
  minimum_line_total?: number
  linked_job_type_ids?: string[]
  line_kind?: string
  unit_basis?: string
}

export function eliUnitSuffix(unitBasis: string | undefined): string {
  if (unitBasis === "miles") return "mi"
  if (unitBasis === "each") return "ea"
  return "hr"
}

export function formatEstimatePresetCostSummary(p: EstimateLinePresetRow): string {
  const q = Number(p.quantity)
  const u = Number(p.unit_price)
  if (!Number.isFinite(q) || !Number.isFinite(u)) return ""
  const sub = q * u
  const su = eliUnitSuffix(p.unit_basis)
  return `$${u.toFixed(2)}/${su} × ${q} → $${sub.toFixed(2)}`
}

export function normalizePresetLinkedJobTypes(raw: Record<string, unknown>): string[] {
  const arr = raw.linked_job_type_ids
  if (Array.isArray(arr)) {
    return [...new Set(arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))]
  }
  const single = raw.job_type_id
  if (typeof single === "string" && single.trim()) return [single.trim()]
  return []
}

export function serializePresetForProfile(row: EstimateLinePresetRow): Record<string, unknown> {
  return {
    id: row.id,
    description: row.description.trim().slice(0, 500),
    quantity: row.quantity,
    unit_price: row.unit_price,
    ...(row.minimum_line_total != null && row.minimum_line_total >= 0 ? { minimum_line_total: row.minimum_line_total } : {}),
    ...(row.line_kind?.trim() ? { line_kind: row.line_kind.trim() } : {}),
    ...(row.unit_basis === "hours" || row.unit_basis === "miles" || row.unit_basis === "each" ? { unit_basis: row.unit_basis } : {}),
    ...(row.linked_job_type_ids?.length ? { linked_job_type_ids: row.linked_job_type_ids } : {}),
  }
}

export function parseEstimateLinePresetsFromMetadata(meta: Record<string, unknown>): EstimateLinePresetRow[] {
  const rawPresets = meta.estimate_line_presets
  if (!Array.isArray(rawPresets)) return []
  return rawPresets
    .map((row: unknown) => {
      const o = row as Record<string, unknown>
      const id = typeof o.id === "string" ? o.id : crypto.randomUUID()
      const description = String(o.description ?? "").slice(0, 500)
      const quantity = typeof o.quantity === "number" ? o.quantity : Number.parseFloat(String(o.quantity ?? 0)) || 0
      const unit_price = typeof o.unit_price === "number" ? o.unit_price : Number.parseFloat(String(o.unit_price ?? 0)) || 0
      const minRaw = o.minimum_line_total
      const minNum = typeof minRaw === "number" ? minRaw : Number.parseFloat(String(minRaw ?? ""))
      const minimum_line_total = Number.isFinite(minNum) && minNum >= 0 ? minNum : undefined
      const linked_job_type_ids = normalizePresetLinkedJobTypes(o)
      const line_kind = typeof o.line_kind === "string" && o.line_kind.trim() ? o.line_kind.trim() : undefined
      const ub = o.unit_basis
      const unit_basis =
        typeof ub === "string" && (ub === "hours" || ub === "miles" || ub === "each") ? ub : undefined
      return { id, description, quantity, unit_price, minimum_line_total, linked_job_type_ids, line_kind, unit_basis }
    })
    .filter((x) => x.description.trim())
}
