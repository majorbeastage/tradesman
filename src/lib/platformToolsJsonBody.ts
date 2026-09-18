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

const LIVE_APP_ORIGIN = "https://www.tradesman-us.com"

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
  const host = typeof window !== "undefined" ? window.location.hostname : ""
  if ((host === "localhost" || host === "127.0.0.1") && !bases.includes(LIVE_APP_ORIGIN)) {
    bases.push(LIVE_APP_ORIGIN)
  }
  return bases
}

function outboundErrorMessage(status: number, data: Record<string, unknown> | null, jsonInvalid?: boolean, rawEmpty?: boolean): string {
  const error = typeof data?.error === "string" ? data.error.trim() : ""
  const message = typeof data?.message === "string" ? data.message.trim() : ""
  const hint = typeof data?.hint === "string" ? data.hint.trim() : ""
  const parts = [error, message, hint].filter(Boolean)
  if (parts.length) return parts.join(" — ")
  if (rawEmpty || jsonInvalid || status >= 500) {
    return `Send failed (HTTP ${status}). Local Vite does not send mail by itself — restart npm run dev so /api proxies to the live site, or uncheck the payment link and try again.`
  }
  return `Send failed (HTTP ${status}).`
}

export async function postOutboundMessages(
  channel: "email" | "sms",
  payload: Record<string, unknown>,
  token: string,
): Promise<{ simulated: boolean }> {
  const origins = platformToolsFetchOrigins()
  let lastErr = "Could not reach the send API."
  for (let i = 0; i < origins.length; i++) {
    const origin = origins[i]
    try {
      const res = await fetch(`${origin}/api/outbound-messages?__channel=${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: outboundMessagesJsonBody(payload),
      })
      const parsed = await readPlatformToolsJsonBody<Record<string, unknown>>(res)
      if (!res.ok) {
        lastErr = outboundErrorMessage(res.status, parsed.data, parsed.jsonInvalid, parsed.rawEmpty)
        if (res.status >= 500 && i < origins.length - 1) continue
        throw new Error(lastErr)
      }
      if (!parsed.data || parsed.jsonInvalid) {
        lastErr = "Send API returned a non-JSON response."
        if (i < origins.length - 1) continue
        throw new Error(lastErr)
      }
      return { simulated: parsed.data.simulated === true }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < origins.length - 1) continue
      throw new Error(lastErr)
    }
  }
  throw new Error(lastErr)
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
