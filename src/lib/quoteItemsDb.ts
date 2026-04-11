import type { SupabaseClient } from "@supabase/supabase-js"

export type QuoteItemInsertPayload = {
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  metadata?: Record<string, unknown>
}

export function normalizeQuoteItemNumbers(quantity: number, unitPrice: number): { quantity: number; unit_price: number } {
  const q = typeof quantity === "number" && Number.isFinite(quantity) ? quantity : Number.parseFloat(String(quantity)) || 0
  const p = typeof unitPrice === "number" && Number.isFinite(unitPrice) ? unitPrice : Number.parseFloat(String(unitPrice)) || 0
  return { quantity: q, unit_price: p }
}

/** PostgREST / Postgres errors when `metadata` column is missing or schema cache is stale. */
export function isQuoteItemsMetadataSchemaError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false
  const m = `${err.message || ""} ${err.details || ""} ${err.hint || ""}`.toLowerCase()
  if (m.includes("metadata") && (m.includes("column") || m.includes("does not exist") || m.includes("schema cache"))) return true
  if (m.includes("could not find") && m.includes("metadata")) return true
  return false
}

/**
 * Inserts a quote_items row. Retries without `metadata` if the column is missing so the line still saves.
 */
export async function insertQuoteItemRowSafe(
  supabase: SupabaseClient,
  payload: QuoteItemInsertPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { quantity, unit_price } = normalizeQuoteItemNumbers(payload.quantity, payload.unit_price)
  const base = {
    quote_id: payload.quote_id,
    description: payload.description.trim(),
    quantity,
    unit_price,
  }
  const meta = payload.metadata && Object.keys(payload.metadata).length > 0 ? payload.metadata : undefined
  const withMeta = meta ? { ...base, metadata: meta as object } : base

  const { error: e1 } = await supabase.from("quote_items").insert(withMeta)
  if (!e1) return { ok: true }

  if (meta && isQuoteItemsMetadataSchemaError(e1)) {
    const { error: e2 } = await supabase.from("quote_items").insert(base)
    if (e2) return { ok: false, error: e2.message }
    console.warn(
      "[quote_items] Line saved without metadata (crew, job link, etc.). Run tradesman/supabase/quote-items-metadata.sql in Supabase if you need those fields.",
    )
    return { ok: true }
  }

  return { ok: false, error: e1.message }
}
