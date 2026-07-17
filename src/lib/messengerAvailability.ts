import type { SupabaseClient } from "@supabase/supabase-js"

export type Availability = "available" | "away" | "busy"

export const AVAILABILITY_META_KEY = "messenger_availability_v1"

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available",
  away: "Away",
  busy: "Busy",
}

export const AVAILABILITY_COLOR: Record<Availability, string> = {
  available: "#22c55e",
  away: "#f59e0b",
  busy: "#ef4444",
}

export function parseAvailability(raw: unknown): Availability {
  return raw === "away" || raw === "busy" || raw === "available" ? raw : "available"
}

export async function loadMyAvailability(client: SupabaseClient | null, userId: string): Promise<Availability> {
  if (!client) return "available"
  const { data } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta = (data?.metadata ?? {}) as Record<string, unknown>
  return parseAvailability(meta[AVAILABILITY_META_KEY])
}

export async function saveMyAvailability(
  client: SupabaseClient | null,
  userId: string,
  status: Availability,
): Promise<void> {
  if (!client) return
  const { data } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  meta[AVAILABILITY_META_KEY] = status
  await client.from("profiles").update({ metadata: meta }).eq("id", userId)
}
