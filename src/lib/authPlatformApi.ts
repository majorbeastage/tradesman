import type { Session, SupabaseClient } from "@supabase/supabase-js"

/**
 * Access token for /api/platform-tools (and similar) routes.
 * Prefer `supabase.auth.getSession()` so the token matches the client after auto-refresh
 * (React `session` from context can lag by a render).
 */
export async function getFreshAccessToken(
  client: SupabaseClient | null,
  fallback: Session | null,
): Promise<string | null> {
  if (client) {
    const { data, error } = await client.auth.getSession()
    if (!error && data.session?.access_token) return data.session.access_token
  }
  return fallback?.access_token ?? null
}

/** Call after a 401 from platform-tools if the access token may have expired. */
export async function forceRefreshAccessToken(client: SupabaseClient | null): Promise<string | null> {
  if (!client) return null
  const { data, error } = await client.auth.refreshSession()
  if (error || !data.session?.access_token) return null
  return data.session.access_token
}
