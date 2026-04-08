import { supabase } from "./supabase"

/**
 * Ends every other Supabase session for this user (other browsers / devices / tabs),
 * keeping only the current session. Safe to call after password sign-in or password update.
 *
 * @see https://supabase.com/docs/reference/javascript/auth-signout — scope `others`
 */
export async function revokeOtherAuthSessions(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut({ scope: "others" })
  if (error) {
    console.warn("[auth] Could not revoke other sessions (other devices may stay signed in until refresh):", error.message)
  }
}
