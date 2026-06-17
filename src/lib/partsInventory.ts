import type { SupabaseClient } from "@supabase/supabase-js"

export type PartsInventoryItem = {
  id: string
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
  updated_at: string
}

export const PARTS_INVENTORY_META_KEY = "parts_inventory_v1"

export function parsePartsInventory(raw: unknown): PartsInventoryItem[] {
  if (!Array.isArray(raw)) return []
  const out: PartsInventoryItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    if (typeof o.id !== "string" || typeof o.name !== "string") continue
    const q = Number(o.quantity)
    out.push({
      id: o.id,
      sku: typeof o.sku === "string" ? o.sku : "",
      name: o.name,
      quantity: Number.isFinite(q) ? q : 0,
      unit: typeof o.unit === "string" ? o.unit : "ea",
      location: typeof o.location === "string" ? o.location : "",
      updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadPartsInventoryFromProfile(client: SupabaseClient, userId: string): Promise<PartsInventoryItem[]> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parsePartsInventory(meta[PARTS_INVENTORY_META_KEY])
}

export async function savePartsInventoryToProfile(
  client: SupabaseClient,
  userId: string,
  items: PartsInventoryItem[],
): Promise<void> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const { error: upErr } = await client
    .from("profiles")
    .update({ metadata: { ...prevMeta, [PARTS_INVENTORY_META_KEY]: items.slice(0, 500) } })
    .eq("id", userId)
  if (upErr) throw upErr
}

export async function upsertPartsInventoryItem(
  client: SupabaseClient,
  userId: string,
  item: { id?: string; sku: string; name: string; quantity: number; unit: string; location: string },
): Promise<PartsInventoryItem> {
  const items = await loadPartsInventoryFromProfile(client, userId)
  const now = new Date().toISOString()
  const record: PartsInventoryItem = {
    id: item.id ?? crypto.randomUUID(),
    sku: item.sku.trim(),
    name: item.name.trim() || "Part",
    quantity: item.quantity,
    unit: item.unit.trim() || "ea",
    location: item.location.trim(),
    updated_at: now,
  }
  const next = [record, ...items.filter((x) => x.id !== record.id)]
  await savePartsInventoryToProfile(client, userId, next)
  return record
}
