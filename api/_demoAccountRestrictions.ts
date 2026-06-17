import type { SupabaseClient } from "@supabase/supabase-js"

export const DEMO_COMM_BLOCK_MESSAGE =
  "Demo accounts cannot send or receive texts, emails, or phone calls. Upgrade to a paid plan to go live."

/** Demo trial accounts must not use live communications. */
export async function isDemoRestrictedUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId.trim()) return false
  const { data } = await supabase
    .from("profiles")
    .select("role, metadata, portal_config")
    .eq("id", userId.trim())
    .maybeSingle()
  const row = data as { role?: string; metadata?: Record<string, unknown>; portal_config?: { demo_account?: boolean } } | null
  if (row?.role === "demo_user") return true
  if (row?.portal_config?.demo_account === true) return true
  if (row?.metadata?.demo_communications_blocked === true) return true
  return false
}
