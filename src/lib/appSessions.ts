/**
 * Common login — app-level session registry (see supabase/user-app-sessions.sql).
 * Main: one active device (soft supersede, never kill Messaging JWTs).
 * Messaging: up to 3 devices; optional 30-day stay-signed-in preference (local).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { Capacitor } from "@capacitor/core"

export type AppSessionKind = "main" | "messaging"

const DEVICE_KEY = "tradesman_app_device_id"
const STAY_SIGNED_IN_KEY = "tradesman_messaging_stay_signed_in"

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function prefsGet(key: string): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences")
      const { value } = await Preferences.get({ key })
      return value ?? null
    }
  } catch {
    /* fall through */
  }
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function prefsSet(key: string, value: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences")
      await Preferences.set({ key, value })
      return
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await prefsGet(DEVICE_KEY)
  if (existing && existing.length >= 8) return existing
  const id = randomId()
  await prefsSet(DEVICE_KEY, id)
  return id
}

export function defaultDeviceLabel(): string {
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web"
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  if (/iPhone|iPad/i.test(ua)) return "iPhone"
  if (/Android/i.test(ua)) return "Android"
  if (platform === "ios") return "iOS"
  if (platform === "android") return "Android"
  return "Browser"
}

export async function registerAppSession(
  supabase: SupabaseClient | null,
  app: AppSessionKind,
  opts?: { deviceLabel?: string; maxMessaging?: number },
): Promise<{ ok: boolean; supersededOthers?: number; error?: string }> {
  if (!supabase) return { ok: false, error: "No client" }
  const deviceId = await getOrCreateDeviceId()
  const { data, error } = await supabase.rpc("register_app_session", {
    p_app: app,
    p_device_id: deviceId,
    p_device_label: opts?.deviceLabel ?? defaultDeviceLabel(),
    p_max_messaging: opts?.maxMessaging ?? 3,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as { superseded_others?: number } | null
  return { ok: true, supersededOthers: row?.superseded_others ?? 0 }
}

export async function heartbeatAppSession(
  supabase: SupabaseClient | null,
  app: AppSessionKind,
): Promise<{ ok: boolean; superseded: boolean; missing?: boolean; error?: string }> {
  if (!supabase) return { ok: false, superseded: false, error: "No client" }
  const deviceId = await getOrCreateDeviceId()
  const { data, error } = await supabase.rpc("heartbeat_app_session", {
    p_app: app,
    p_device_id: deviceId,
  })
  if (error) return { ok: false, superseded: false, error: error.message }
  const row = data as { ok?: boolean; superseded?: boolean; missing?: boolean } | null
  if (row?.missing) return { ok: false, superseded: false, missing: true }
  return { ok: true, superseded: Boolean(row?.superseded) }
}

export async function setAppSessionInCall(
  supabase: SupabaseClient | null,
  app: AppSessionKind,
  inCall: boolean,
): Promise<void> {
  if (!supabase) return
  try {
    const deviceId = await getOrCreateDeviceId()
    await supabase.rpc("set_app_session_in_call", {
      p_app: app,
      p_device_id: deviceId,
      p_in_call: inCall,
    })
  } catch {
    /* best-effort */
  }
}

export async function revokeLocalAppSession(
  supabase: SupabaseClient | null,
  app: AppSessionKind,
): Promise<void> {
  if (!supabase) return
  try {
    const deviceId = await getOrCreateDeviceId()
    await supabase.rpc("revoke_app_session", { p_app: app, p_device_id: deviceId })
  } catch {
    /* best-effort */
  }
}

export async function getMessagingStaySignedIn(): Promise<boolean> {
  const v = await prefsGet(STAY_SIGNED_IN_KEY)
  return v !== "0"
}

export async function setMessagingStaySignedIn(on: boolean): Promise<void> {
  await prefsSet(STAY_SIGNED_IN_KEY, on ? "1" : "0")
}

/** Days we treat a messaging Preference session as intended to persist (product policy). */
export const MESSAGING_STAY_SIGNED_IN_DAYS = 30
