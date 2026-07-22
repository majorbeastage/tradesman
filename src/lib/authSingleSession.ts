import { supabase } from "./supabase"

/**
 * Hard-revoke every other Supabase Auth session (other browsers/devices).
 * Use only for security-sensitive flows (password reset), NOT normal login —
 * normal Main login uses user_app_sessions soft takeover so Messaging can stay signed in.
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
