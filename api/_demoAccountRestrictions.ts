import type { SupabaseClient } from "@supabase/supabase-js"

export const DEMO_COMM_BLOCK_MESSAGE =
  "Demo accounts cannot send or receive texts, emails, or phone calls. Upgrade to a paid plan to go live."

/** Demo trial accounts must not use live communications. */
export async function isDemoRestrictedUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId.trim()) return false
  const { data } = await supabase.from("profiles").select("role").eq("id", userId.trim()).maybeSingle()
  return (data as { role?: string } | null)?.role === "demo_user"
}
