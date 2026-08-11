/**
 * Messaging common-login registry.
 * TEMPORARILY DISABLED — same kill-switch as main app (prod RPC errors / login outage).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { Capacitor } from "@capacitor/core"

export type AppSessionKind = "main" | "messaging"

const APP_SESSION_RPC_ENABLED = false

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
  _supabase: SupabaseClient | null,
  _app: AppSessionKind,
  _opts?: { deviceLabel?: string; maxMessaging?: number; maxMain?: number },
): Promise<{ ok: boolean; supersededOthers?: number; error?: string }> {
  if (!APP_SESSION_RPC_ENABLED) return { ok: true, supersededOthers: 0 }
  return { ok: true, supersededOthers: 0 }
}

export async function heartbeatAppSession(
  _supabase: SupabaseClient | null,
  _app: AppSessionKind,
): Promise<{ ok: boolean; superseded: boolean; missing?: boolean; error?: string }> {
  if (!APP_SESSION_RPC_ENABLED) return { ok: true, superseded: false }
  return { ok: true, superseded: false }
}

export async function setAppSessionInCall(
  _supabase: SupabaseClient | null,
  _app: AppSessionKind,
  _inCall: boolean,
): Promise<void> {
  /* disabled */
}

export async function revokeLocalAppSession(
  _supabase: SupabaseClient | null,
  _app: AppSessionKind,
): Promise<void> {
  /* disabled */
}

export async function getMessagingStaySignedIn(): Promise<boolean> {
  const v = await prefsGet(STAY_SIGNED_IN_KEY)
  return v !== "0"
}

export async function setMessagingStaySignedIn(on: boolean): Promise<void> {
  await prefsSet(STAY_SIGNED_IN_KEY, on ? "1" : "0")
}

export const MESSAGING_STAY_SIGNED_IN_DAYS = 30
