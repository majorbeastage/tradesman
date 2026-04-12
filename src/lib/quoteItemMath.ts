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

/** Row shape from Supabase quote_items (or similar). */
export type QuoteItemRowLike = {
  description?: string | null
  quantity?: unknown
  unit_price?: unknown
  metadata?: unknown
}

export function totalFromQuoteItemRows(items: QuoteItemRowLike[]): number {
  let sum = 0
  for (const item of items) {
    const qty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
    const up = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0
    const meta = parseQuoteItemMetadata(item.metadata)
    sum += computeQuoteLineTotal(qty, up, meta).total
  }
  return sum
}

/** One line per material row (description + quantity) for calendar_events.materials_list. */
export function materialDescriptionsFromQuoteItemRows(items: QuoteItemRowLike[]): string {
  const lines: string[] = []
  for (const item of items) {
    const meta = parseQuoteItemMetadata(item.metadata)
    if ((meta.line_kind ?? "").toLowerCase() !== "material") continue
    const d = String(item.description ?? "").trim()
    if (!d) continue
    const qtyRaw = item.quantity
    const qty = typeof qtyRaw === "number" ? qtyRaw : Number.parseFloat(String(qtyRaw ?? 0)) || 0
    const qtyLabel = Number.isFinite(qty) && qty !== 1 && qty !== 0 ? ` × ${qty}` : qty === 0 ? " × 0" : ""
    lines.push(`${d}${qtyLabel}`)
  }
  return lines.join("\n")
}

/** Quote material lines first, then job-type checklist (newline-separated). */
export function mergeMaterialsListsForCalendar(quoteMaterials: string | null | undefined, jobTypeMaterials: string | null | undefined): string | null {
  const q = quoteMaterials?.trim() ?? ""
  const j = jobTypeMaterials?.trim() ?? ""
  if (q && j) return `${q}\n${j}`
  if (q) return q
  if (j) return j
  return null
}

/**
 * If quote has material lines not yet reflected in the event checklist, prepend them (idempotent if first line matches).
 */
export function prependQuoteMaterialsToEventChecklist(quoteBlock: string, existingEventMaterials: string | null | undefined): string | null {
  const q = quoteBlock.trim()
  const e = (existingEventMaterials ?? "").trim()
  if (!q) return e || null
  if (!e) return q
  const firstQ = q.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? ""
  if (!firstQ) return e
  const eLines = e.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (eLines.some((line) => line === firstQ)) return e
  return `${q}\n${e}`
}
