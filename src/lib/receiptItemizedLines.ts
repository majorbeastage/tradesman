import type { SupabaseClient } from "@supabase/supabase-js"
import type { ParsedCalendarReceiptMeta } from "./calendarReceiptMetadata"
import { parseCalendarEventReceiptMeta } from "./calendarReceiptMetadata"
import { computeQuoteLineTotal, parseQuoteItemMetadata } from "./quoteItemMath"

export function materialsListToLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return []
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 80)
}

type EventLike = {
  quote_id?: string | null
  materials_list?: string | null
  job_types?: { materials_list?: string | null } | null
}

export type BuildReceiptItemizedLinesOpts = {
  /**
   * When true, skip priced quote material rows — use only event / job-type text checklist.
   * Use with full quote line itemization so materials are not duplicated on the PDF.
   */
  supplementChecklistOnly?: boolean
}

/**
 * Materials checklist lines: by default, priced quote material rows first, else event text, else job type.
 * With supplementChecklistOnly, only event / job-type text (no quote_items).
 */
export async function buildReceiptItemizedLines(
  supabase: SupabaseClient,
  ev: EventLike,
  opts?: BuildReceiptItemizedLinesOpts,
): Promise<string[]> {
  if (!opts?.supplementChecklistOnly && ev.quote_id) {
    const { data: rows } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", ev.quote_id)
      .order("created_at", { ascending: true })
    const materialLines: string[] = []
    for (const item of rows ?? []) {
      const meta = parseQuoteItemMetadata(item.metadata)
      if (meta.line_kind !== "material") continue
      const qty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
      const up = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0
      const { total } = computeQuoteLineTotal(qty, up, meta)
      const desc = String(item.description ?? "Material").trim() || "Material"
      materialLines.push(`${desc} — ${qty} × $${up.toFixed(2)} = $${total.toFixed(2)}`)
    }
    if (materialLines.length > 0) return materialLines
  }
  const fromEvent = materialsListToLines(ev.materials_list)
  if (fromEvent.length > 0) return fromEvent
  return materialsListToLines(ev.job_types?.materials_list ?? undefined)
}

export function formatCalendarScheduledLabel(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `Scheduled time: ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  const dur = r ? `${h} h ${r} min` : `${h} h`
  return `Scheduled time: ${dur}`
}

function lineKindLabel(kind: string | undefined): string {
  const k = (kind ?? "").toLowerCase()
  if (k === "labor") return "Labor"
  if (k === "material") return "Material"
  if (k === "misc") return "Misc"
  if (k === "fee") return "Fee"
  if (k === "other") return "Other"
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "Line"
}

/**
 * Receipt PDF body: all quote line kinds + optional extra lines; optional materials checklist when itemize is on.
 */
export async function buildCalendarReceiptPdfSections(
  supabase: SupabaseClient,
  params: {
    quote_id: string | null
    materials_list?: string | null
    job_types?: { materials_list?: string | null } | null
    start_at: string
    end_at: string
    receiptMeta: ParsedCalendarReceiptMeta
    itemizeMaterials: boolean
    mileageMiles?: number | null
    mileageRatePerMile?: number | null
  },
): Promise<{
  quoteLines: string[]
  materialsChecklistLines: string[]
  lineSubtotal: number | null
  scheduledDurationLabel: string
}> {
  const scheduledDurationLabel = formatCalendarScheduledLabel(params.start_at, params.end_at)
  const quoteLines: string[] = []
  let subtotal = 0

  if (params.quote_id) {
    const { data: rows } = await supabase
      .from("quote_items")
      .select("id, description, quantity, unit_price, metadata")
      .eq("quote_id", params.quote_id)
      .order("created_at", { ascending: true })
    for (const item of rows ?? []) {
      const row = item as {
        id: string
        description: string | null
        quantity: number | string | null
        unit_price: number | string | null
        metadata: unknown
      }
      const id = String(row.id)
      const ov = params.receiptMeta.receipt_quote_overrides[id] ?? {}
      if (ov.hidden === true) continue
      const baseQty =
        typeof row.quantity === "number" ? row.quantity : Number.parseFloat(String(row.quantity ?? 0)) || 0
      const baseUp =
        typeof row.unit_price === "number" ? row.unit_price : Number.parseFloat(String(row.unit_price ?? 0)) || 0
      const rawQty = ov.quantity !== undefined && Number.isFinite(ov.quantity) ? ov.quantity : baseQty
      const rawUp = ov.unit_price !== undefined && Number.isFinite(ov.unit_price) ? ov.unit_price : baseUp
      const desc = (ov.description !== undefined ? ov.description : String(row.description ?? "").trim()) || "Line item"
      const meta = parseQuoteItemMetadata(row.metadata)
      const { total } = computeQuoteLineTotal(rawQty, rawUp, meta)
      subtotal += total
      const kind = lineKindLabel(meta.line_kind)
      const mp = meta.manpower && meta.manpower > 1 ? ` (${meta.manpower} crew)` : ""
      quoteLines.push(`[${kind}] ${desc}${mp} — ${rawQty} × $${rawUp.toFixed(2)} = $${total.toFixed(2)}`)
    }
  }

  for (const add of params.receiptMeta.receipt_additional_lines) {
    const meta = parseQuoteItemMetadata({ line_kind: add.line_kind })
    const { total } = computeQuoteLineTotal(add.quantity, add.unit_price, meta)
    subtotal += total
    const kind = lineKindLabel(add.line_kind)
    quoteLines.push(
      `[${kind}] ${add.description.trim() || "Item"} — ${add.quantity} × $${add.unit_price.toFixed(2)} = $${total.toFixed(2)}`,
    )
  }

  const miles = params.mileageMiles != null && Number.isFinite(Number(params.mileageMiles)) ? Number(params.mileageMiles) : 0
  const rate =
    params.mileageRatePerMile != null && Number.isFinite(Number(params.mileageRatePerMile))
      ? Number(params.mileageRatePerMile)
      : 0
  if (miles > 0 && rate > 0) {
    const mileageCost = miles * rate
    subtotal += mileageCost
    quoteLines.push(`[Mileage] ${miles} mi × $${rate.toFixed(2)}/mi = $${mileageCost.toFixed(2)}`)
  }

  const lineSubtotal = quoteLines.length > 0 ? subtotal : null

  let materialsChecklistLines: string[] = []
  if (params.itemizeMaterials) {
    materialsChecklistLines = await buildReceiptItemizedLines(
      supabase,
      {
        quote_id: params.quote_id,
        materials_list: params.materials_list,
        job_types: params.job_types ?? null,
      },
      { supplementChecklistOnly: true },
    )
  }

  return {
    quoteLines,
    materialsChecklistLines,
    lineSubtotal,
    scheduledDurationLabel,
  }
}

type ReceiptBodyEvent = {
  title: string
  start_at: string
  end_at: string
  quote_total?: number | null
  mileage_miles?: number | null
  notes?: string | null
  quote_id?: string | null
  materials_list?: string | null
  job_types?: { materials_list?: string | null } | null
  metadata?: unknown
}

/** Plain-text receipt for completion email/SMS — includes itemized lines when configured on the event. */
export async function buildCalendarReceiptBodyText(
  supabase: SupabaseClient,
  ev: ReceiptBodyEvent,
  opts?: { itemizeMaterials?: boolean; mileageRatePerMile?: number | null },
): Promise<string> {
  const receiptMeta = parseCalendarEventReceiptMeta(ev.metadata)
  const wantsLines =
    receiptMeta.receipt_wants_line_items ||
    receiptMeta.receipt_additional_lines.length > 0 ||
    Object.keys(receiptMeta.receipt_quote_overrides).length > 0
  const miles =
    ev.mileage_miles != null && Number.isFinite(Number(ev.mileage_miles)) && Number(ev.mileage_miles) > 0
      ? Number(ev.mileage_miles)
      : 0
  const sections = await buildCalendarReceiptPdfSections(supabase, {
    quote_id: wantsLines ? ev.quote_id ?? null : null,
    materials_list: ev.materials_list,
    job_types: ev.job_types ?? null,
    start_at: ev.start_at,
    end_at: ev.end_at,
    receiptMeta,
    itemizeMaterials: opts?.itemizeMaterials === true,
    mileageMiles: miles > 0 ? miles : null,
    mileageRatePerMile:
      opts?.mileageRatePerMile != null && Number.isFinite(Number(opts.mileageRatePerMile)) && Number(opts.mileageRatePerMile) > 0
        ? Number(opts.mileageRatePerMile)
        : null,
  })
  const lines = [
    `Job: ${ev.title}`,
    `When: ${new Date(ev.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} – ${new Date(ev.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    sections.scheduledDurationLabel,
  ]
  if (sections.quoteLines.length > 0) {
    lines.push("", "Line items:")
    lines.push(...sections.quoteLines.map((l) => `  • ${l}`))
    if (sections.lineSubtotal != null) lines.push(`Subtotal: $${sections.lineSubtotal.toFixed(2)}`)
  } else if (ev.quote_total != null && ev.quote_total > 0) {
    lines.push(`Total: $${Number(ev.quote_total).toFixed(2)}`)
  }
  if (miles > 0 && !(opts?.mileageRatePerMile && Number(opts.mileageRatePerMile) > 0)) {
    lines.push(`Mileage: ${miles} mi`)
  }
  if (sections.materialsChecklistLines.length > 0) {
    lines.push("", "Materials:")
    lines.push(...sections.materialsChecklistLines.map((l) => `  • ${l}`))
  }
  if (ev.notes?.trim()) lines.push(`Notes: ${ev.notes.trim()}`)
  return lines.join("\n")
}
