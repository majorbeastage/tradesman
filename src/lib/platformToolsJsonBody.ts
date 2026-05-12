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

/** Origins to try for `/api/*` when the SPA origin has no serverless routes (local Vite). */
export function platformToolsFetchOrigins(): string[] {
  const bases: string[] = []
  if (typeof window !== "undefined" && window.location?.origin) bases.push(window.location.origin)
  const pub = import.meta.env.VITE_PUBLIC_APP_ORIGIN?.trim()
  if (pub) {
    try {
      const u = new URL(pub.startsWith("http") ? pub : `https://${pub}`)
      if (u.origin && !bases.includes(u.origin)) bases.push(u.origin)
    } catch {
      /* ignore */
    }
  }
  return bases
}

export type ParsedPlatformToolsBody<T extends Record<string, unknown>> = {
  ok: boolean
  status: number
  data: T | null
  /** True when the body was empty or whitespace only. */
  rawEmpty: boolean
  /** True when body was non-empty but not valid JSON. */
  jsonInvalid?: boolean
}

/**
 * Read `/api/platform-tools` (and similar) responses without calling `Response.json()` on empty bodies
 * (502/504/gateway errors often return no JSON and throw "Unexpected end of JSON input").
 */
export async function readPlatformToolsJsonBody<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response,
): Promise<ParsedPlatformToolsBody<T>> {
  const raw = await res.text()
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: res.ok, status: res.status, data: null, rawEmpty: true }
  }
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(trimmed) as T, rawEmpty: false }
  } catch {
    return { ok: res.ok, status: res.status, data: null, rawEmpty: false, jsonInvalid: true }
  }
}
