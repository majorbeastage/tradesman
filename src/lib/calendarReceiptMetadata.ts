/** Stored on calendar_events.metadata for receipt PDF customization. */

export type ReceiptQuoteOverride = {
  description?: string
  quantity?: number
  unit_price?: number
  hidden?: boolean
}

export type ReceiptAdditionalLine = {
  id: string
  description: string
  quantity: number
  unit_price: number
  line_kind?: string
}

export type ParsedCalendarReceiptMeta = {
  receipt_quote_overrides: Record<string, ReceiptQuoteOverride>
  receipt_additional_lines: ReceiptAdditionalLine[]
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x)
}

export function parseCalendarEventReceiptMeta(raw: unknown): ParsedCalendarReceiptMeta {
  if (!isRecord(raw)) return { receipt_quote_overrides: {}, receipt_additional_lines: [] }

  const overridesRaw = raw.receipt_quote_overrides
  const receipt_quote_overrides: Record<string, ReceiptQuoteOverride> = {}
  if (isRecord(overridesRaw)) {
    for (const [k, v] of Object.entries(overridesRaw)) {
      if (!isRecord(v)) continue
      const o: ReceiptQuoteOverride = {}
      if (typeof v.description === "string") o.description = v.description
      if (typeof v.quantity === "number" && Number.isFinite(v.quantity)) o.quantity = v.quantity
      if (typeof v.unit_price === "number" && Number.isFinite(v.unit_price)) o.unit_price = v.unit_price
      if (v.hidden === true) o.hidden = true
      if (Object.keys(o).length) receipt_quote_overrides[k] = o
    }
  }

  const addRaw = raw.receipt_additional_lines
  const receipt_additional_lines: ReceiptAdditionalLine[] = []
  if (Array.isArray(addRaw)) {
    for (const row of addRaw) {
      if (!isRecord(row)) continue
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : ""
      const description = typeof row.description === "string" ? row.description : ""
      const quantity = typeof row.quantity === "number" ? row.quantity : Number.parseFloat(String(row.quantity ?? 0)) || 0
      const unit_price = typeof row.unit_price === "number" ? row.unit_price : Number.parseFloat(String(row.unit_price ?? 0)) || 0
      const line_kind = typeof row.line_kind === "string" && row.line_kind.trim() ? row.line_kind.trim() : undefined
      if (!id) continue
      receipt_additional_lines.push({ id, description, quantity, unit_price, line_kind })
    }
  }

  return { receipt_quote_overrides, receipt_additional_lines }
}

export function serializeCalendarReceiptMeta(
  existingMetadata: unknown,
  patch: ParsedCalendarReceiptMeta,
): Record<string, unknown> {
  const base = isRecord(existingMetadata) ? { ...existingMetadata } : {}
  base.receipt_quote_overrides = patch.receipt_quote_overrides
  base.receipt_additional_lines = patch.receipt_additional_lines
  return base
}
