import type { ReceiptAdditionalLine, ReceiptQuoteOverride } from "./calendarReceiptMetadata"
import { materialsListToLines } from "./receiptItemizedLines"
import { computeQuoteLineTotal, parseQuoteItemMetadata, type QuoteItemRowLike } from "./quoteItemMath"

export type CalendarEventLineItemSource = "job_type" | "quote" | "event_checklist" | "event_receipt"

export type CalendarEventLineItemRow = {
  key: string
  source: CalendarEventLineItemSource
  sourceLabel: string
  description: string
  detail?: string
}

type QuoteItemWithId = QuoteItemRowLike & { id?: string }

function lineKindLabel(kind: string | undefined): string {
  const k = (kind ?? "").toLowerCase()
  if (k === "labor") return "Labor"
  if (k === "material") return "Material"
  if (k === "misc") return "Misc"
  if (k === "fee") return "Fee"
  if (k === "other") return "Other"
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "Line"
}

/** Merged preview rows from job type checklist, quote lines, event checklist, and event-only receipt lines. */
export function buildCalendarEventLineItemRows(params: {
  jobTypeMaterials?: string | null
  eventMaterials?: string | null
  quoteItems: QuoteItemWithId[]
  receiptOverrides?: Record<string, ReceiptQuoteOverride>
  receiptAdditional?: ReceiptAdditionalLine[]
}): CalendarEventLineItemRow[] {
  const rows: CalendarEventLineItemRow[] = []
  const overrides = params.receiptOverrides ?? {}
  const additional = params.receiptAdditional ?? []

  for (const item of params.quoteItems) {
    const id = item.id
    const ov = id ? overrides[id] : undefined
    if (ov?.hidden === true) continue
    const baseQty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
    const baseUp = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0
    const rawQty = ov?.quantity !== undefined && Number.isFinite(ov.quantity) ? ov.quantity : baseQty
    const rawUp = ov?.unit_price !== undefined && Number.isFinite(ov.unit_price) ? ov.unit_price : baseUp
    const desc = (ov?.description !== undefined ? ov.description : String(item.description ?? "").trim()) || "Line item"
    const meta = parseQuoteItemMetadata(item.metadata)
    const { total } = computeQuoteLineTotal(rawQty, rawUp, meta)
    const kind = lineKindLabel(meta.line_kind)
    rows.push({
      key: `quote-${id ?? rows.length}`,
      source: "quote",
      sourceLabel: "Estimate",
      description: desc,
      detail: `${kind} · ${rawQty} x $${rawUp.toFixed(2)} = $${total.toFixed(2)}`,
    })
  }

  for (const add of additional) {
    const meta = parseQuoteItemMetadata({ line_kind: add.line_kind })
    const { total } = computeQuoteLineTotal(add.quantity, add.unit_price, meta)
    const kind = lineKindLabel(add.line_kind)
    rows.push({
      key: `add-${add.id}`,
      source: "event_receipt",
      sourceLabel: "This event",
      description: add.description.trim() || "Item",
      detail: `${kind} · ${add.quantity} x $${add.unit_price.toFixed(2)} = $${total.toFixed(2)}`,
    })
  }

  const eventLines = materialsListToLines(params.eventMaterials)
  const jobTypeLines = materialsListToLines(params.jobTypeMaterials)
  const checklistLines = eventLines.length > 0 ? eventLines : jobTypeLines
  const checklistSource: CalendarEventLineItemSource = eventLines.length > 0 ? "event_checklist" : "job_type"
  const checklistLabel = eventLines.length > 0 ? "On event" : "Job type"

  for (let i = 0; i < checklistLines.length; i++) {
    rows.push({
      key: `chk-${checklistSource}-${i}`,
      source: checklistSource,
      sourceLabel: checklistLabel,
      description: checklistLines[i],
    })
  }

  return rows
}

export function calendarEventLineItemSummary(rows: CalendarEventLineItemRow[]): string {
  if (rows.length === 0) return ""
  const labels = Array.from(new Set(rows.map((r) => r.sourceLabel)))
  if (labels.length === 1) return labels[0]
  return labels.join(", ")
}