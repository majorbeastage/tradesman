import { supabaseAnonKey, supabaseUrl } from "./supabase"

/**
 * Spread Vite Supabase URL + anon key into a JSON POST body so serverless routes can use the user JWT
 * when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not set on Vercel.
 */
export function withSupabasePublicCredentials<T extends Record<string, unknown>>(payload: T): T & { supabaseUrl?: string; supabaseAnonKey?: string } {
  const url = supabaseUrl.trim() || String(import.meta.env.VITE_SUPABASE_URL ?? "").trim()
  const anon = supabaseAnonKey.trim() || String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim()
  return {
    ...payload,
    ...(url ? { supabaseUrl: url } : {}),
    ...(anon ? { supabaseAnonKey: anon } : {}),
  }
}

/** POST body for `/api/platform-tools` so JWT validation works when Vercel omits SUPABASE_URL / anon. */
export function platformToolsJsonBody(payload: Record<string, unknown>): string {
  return JSON.stringify(withSupabasePublicCredentials(payload))
}

/** Same credentials merge, stringified for `/api/outbound-messages` (and similar). */
export function outboundMessagesJsonBody(payload: Record<string, unknown>): string {
  return JSON.stringify(withSupabasePublicCredentials(payload))
}
