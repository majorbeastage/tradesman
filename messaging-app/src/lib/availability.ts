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

export async function loadMyAvailability(supabase: SupabaseClient, userId: string): Promise<Availability> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta = (data?.metadata ?? {}) as Record<string, unknown>
  return parseAvailability(meta[AVAILABILITY_META_KEY])
}

export async function saveMyAvailability(
  supabase: SupabaseClient,
  userId: string,
  status: Availability,
): Promise<void> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  meta[AVAILABILITY_META_KEY] = status
  await supabase.from("profiles").update({ metadata: meta }).eq("id", userId)
}

export async function loadDisplayName(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle()
  const name = (data as { display_name?: string | null; email?: string | null } | null)?.display_name?.trim()
  if (name) return name
  const email = (data as { email?: string | null } | null)?.email?.trim()
  if (email) return email.split("@")[0] || "You"
  return "You"
}
