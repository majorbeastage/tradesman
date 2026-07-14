/** Saved estimate presets (profile metadata.estimate_line_presets). Shared by Quotes + Calendar job-type UIs. */

export type EstimateLinePresetRow = {
  id: string
  description: string
  quantity: number
  unit_price: number
  /** Optional user-defined library category. Built-in line kinds remain the fallback. */
  category_id?: string
  /** Dollar minimum for the line total (optional). */
  minimum_line_total?: number
  /** Minimum quantity before the line applies (optional). */
  minimum_quantity?: number
  /** Whether minimum applies to cost or quantity. */
  minimum_basis?: "cost" | "quantity" | "hours"
  linked_job_type_ids?: string[]
  line_kind?: string
  /** Unit label: hours, miles, each, acres, sqft, custom strings, etc. */
  unit_basis?: string
}

export function eliUnitSuffix(unitBasis: string | undefined): string {
  const u = (unitBasis ?? "hours").toLowerCase()
  if (u === "miles" || u === "mi") return "mi"
  if (u === "each" || u === "ea") return "ea"
  if (u === "acres" || u === "acre" || u === "ac") return "ac"
  if (u === "sqft" || u === "sq ft") return "sqft"
  if (u === "sqyd") return "sqyd"
  if (u === "yards" || u === "yard") return "yd"
  if (u === "gallons" || u === "gallon" || u === "gal") return "gal"
  if (u === "loads" || u === "load") return "load"
  if (u === "tons" || u === "ton") return "ton"
  if (u === "bags" || u === "bag") return "bag"
  if (u === "hours" || u === "hour" || u === "hr") return "hr"
  return u.slice(0, 8) || "hr"
}

export function formatEstimatePresetCostSummary(p: EstimateLinePresetRow): string {
  const q = Number(p.quantity)
  const u = Number(p.unit_price)
  if (!Number.isFinite(q) || !Number.isFinite(u)) return ""
  const sub = q * u
  const su = eliUnitSuffix(p.unit_basis)
  let extra = ""
  if (p.minimum_basis === "hours" && p.minimum_quantity != null && p.minimum_quantity > 0) {
    extra = ` · min ${p.minimum_quantity} hr`
  } else if (p.minimum_basis === "quantity" && p.minimum_quantity != null && p.minimum_quantity > 0) {
    extra = ` · min qty ${p.minimum_quantity}`
  } else if (p.minimum_line_total != null && p.minimum_line_total > 0) {
    extra = ` · min $${p.minimum_line_total.toFixed(2)}`
  }
  return `$${u.toFixed(2)}/${su} × ${q} → $${sub.toFixed(2)}${extra}`
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
  const unit = (row.unit_basis ?? "").trim().slice(0, 32)
  return {
    id: row.id,
    description: row.description.trim().slice(0, 500),
    quantity: row.quantity,
    unit_price: row.unit_price,
    ...(row.minimum_line_total != null && row.minimum_line_total >= 0 ? { minimum_line_total: row.minimum_line_total } : {}),
    ...(row.minimum_quantity != null && row.minimum_quantity > 0 ? { minimum_quantity: row.minimum_quantity } : {}),
    ...(row.minimum_basis === "cost" || row.minimum_basis === "quantity" || row.minimum_basis === "hours"
      ? { minimum_basis: row.minimum_basis }
      : {}),
    ...(row.line_kind?.trim() ? { line_kind: row.line_kind.trim() } : {}),
    ...(row.category_id?.trim() ? { category_id: row.category_id.trim() } : {}),
    ...(unit ? { unit_basis: unit } : {}),
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
      const minQtyRaw = o.minimum_quantity
      const minQtyNum = typeof minQtyRaw === "number" ? minQtyRaw : Number.parseFloat(String(minQtyRaw ?? ""))
      const minimum_quantity = Number.isFinite(minQtyNum) && minQtyNum > 0 ? minQtyNum : undefined
      const minimum_basis: "cost" | "quantity" | "hours" | undefined =
        o.minimum_basis === "hours"
          ? "hours"
          : o.minimum_basis === "quantity"
            ? "quantity"
            : o.minimum_basis === "cost" || minimum_line_total != null
              ? "cost"
              : undefined
      const linked_job_type_ids = normalizePresetLinkedJobTypes(o)
      const line_kind = typeof o.line_kind === "string" && o.line_kind.trim() ? o.line_kind.trim() : undefined
      const category_id =
        typeof o.category_id === "string" && o.category_id.trim() ? o.category_id.trim().slice(0, 80) : undefined
      const ub = o.unit_basis
      const unit_basis = typeof ub === "string" && ub.trim() ? ub.trim().slice(0, 32) : undefined
      return {
        id,
        description,
        quantity,
        unit_price,
        minimum_line_total,
        minimum_quantity,
        minimum_basis,
        linked_job_type_ids,
        line_kind,
        category_id,
        unit_basis,
      }
    })
    .filter((x) => x.description.trim())
}
