import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

/** Quote owner, office manager for that user, or admin. */
export async function userCanAccessQuoteUser(
  admin: SupabaseClient,
  authUserId: string,
  quoteOwnerUserId: string,
): Promise<boolean> {
  if (authUserId === quoteOwnerUserId) return true
  const { data: prof } = await admin.from("profiles").select("role").eq("id", authUserId).maybeSingle()
  if (prof?.role === "admin") return true
  const { data: link } = await admin
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", authUserId)
    .eq("user_id", quoteOwnerUserId)
    .maybeSingle()
  return !!link
}
