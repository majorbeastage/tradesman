/** Stored on quote_items.metadata (jsonb). */
export type QuoteItemMetadata = {
  manpower?: number
  minimum_line_total?: number
  preset_id?: string
  job_type_id?: string | null
  line_kind?: string
}

export function parseQuoteItemMetadata(raw: unknown): QuoteItemMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const mp = typeof o.manpower === "number" ? o.manpower : Number.parseFloat(String(o.manpower ?? ""))
  const manpower = Number.isFinite(mp) && mp >= 1 ? Math.floor(mp) : 1
  const minRaw = o.minimum_line_total
  const minNum = typeof minRaw === "number" ? minRaw : Number.parseFloat(String(minRaw ?? ""))
  const minimum_line_total = Number.isFinite(minNum) && minNum >= 0 ? minNum : undefined
  const preset_id = typeof o.preset_id === "string" && o.preset_id.trim() ? o.preset_id.trim() : undefined
  const job_type_id =
    typeof o.job_type_id === "string" && o.job_type_id.trim() ? o.job_type_id.trim() : o.job_type_id === null ? null : undefined
  const line_kind = typeof o.line_kind === "string" && o.line_kind.trim() ? o.line_kind.trim() : undefined
  return { manpower, minimum_line_total, preset_id, job_type_id, line_kind }
}

export function computeQuoteLineTotal(
  quantity: number,
  unitPrice: number,
  meta: QuoteItemMetadata,
): { effectiveQuantity: number; subtotal: number; total: number } {
  const m = Math.max(1, meta.manpower ?? 1)
  const effectiveQuantity = quantity * m
  const subtotal = effectiveQuantity * unitPrice
  const min = meta.minimum_line_total
  const total = min != null && Number.isFinite(min) ? Math.max(subtotal, min) : subtotal
  return { effectiveQuantity, subtotal, total }
}
