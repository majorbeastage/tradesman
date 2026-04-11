import type { SupabaseClient } from "@supabase/supabase-js"
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

/**
 * Lines for an itemized receipt: quote material line items first, else event materials checklist,
 * else job type default materials.
 */
export async function buildReceiptItemizedLines(supabase: SupabaseClient, ev: EventLike): Promise<string[]> {
  if (ev.quote_id) {
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
