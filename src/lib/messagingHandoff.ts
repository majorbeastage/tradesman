/**
 * Open the standalone Tradesman Messaging app with the current Supabase session
 * so the user does not re-enter email/password.
 *
 * Deep link: tradesmanmsg://auth#access_token=...&refresh_token=...
 * If Messaging is not installed (Android), falls through to the Play Store listing.
 */
import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabase"

export const MESSAGING_ANDROID_PACKAGE = "com.tradesmanus.messaging"
export const MESSAGING_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MESSAGING_ANDROID_PACKAGE}`
export const MESSAGING_PLAY_STORE_MARKET_URL = `market://details?id=${MESSAGING_ANDROID_PACKAGE}`

function isAndroidUa(): boolean {
  if (typeof navigator === "undefined") return false
  return /Android/i.test(navigator.userAgent)
}

/** Open Play Store for Tradesman Messaging (market:// on Android, https elsewhere). */
export function openMessagingPlayStore(): void {
  if (typeof window === "undefined") return
  try {
    if (isAndroidUa() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) {
      window.location.href = MESSAGING_PLAY_STORE_MARKET_URL
      return
    }
  } catch {
    /* fall through */
  }
  window.open(MESSAGING_PLAY_STORE_URL, "_blank", "noopener,noreferrer")
}

/**
 * Open Messaging with session when possible; otherwise Play Store.
 * On desktop web (wide screens), callers may prefer the in-app messenger widget instead.
 */
export async function openMessagingAppWithSession(opts?: {
  /** After this many ms without leaving the page, open Play Store (Android/native). */
  playStoreFallbackMs?: number
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Not signed in." }
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session?.access_token || !session.refresh_token) {
    return { ok: false, error: "No active session. Sign in to Tradesman first." }
  }
  const hash = `access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`
  const playFallback = encodeURIComponent(MESSAGING_PLAY_STORE_URL)

  try {
    const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    const android = nativeAndroid || isAndroidUa()

    if (android) {
      // Intent with Play Store browser_fallback when the package is missing.
      window.location.href =
        `intent://auth#${hash}#Intent;scheme=tradesmanmsg;package=${MESSAGING_ANDROID_PACKAGE};` +
        `S.browser_fallback_url=${playFallback};end`

      const ms = opts?.playStoreFallbackMs ?? 1600
      window.setTimeout(() => {
        // If deep link failed (still on this page), nudge to the store.
        try {
          if (document.visibilityState === "visible") openMessagingPlayStore()
        } catch {
          /* ignore */
        }
      }, ms)
      return { ok: true }
    }

    window.location.href = `tradesmanmsg://auth#${hash}`
    return { ok: true }
  } catch (e) {
    openMessagingPlayStore()
    return { ok: false, error: e instanceof Error ? e.message : "Could not open Messaging." }
  }
}

type CapAppMod = {
  App?: {
    addListener: (event: string, cb: (data: { url: string }) => void) => Promise<{ remove: () => void }>
  }
}

/** Listen for tradesman://messaging-handoff and open the messaging app with tokens. */
export async function initMessagingHandoffListener(): Promise<() => void> {
  try {
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<CapAppMod>
    const mod = await importer("@capacitor/app")
    const App = mod.App
    if (!App?.addListener) return () => {}
    const handle = await App.addListener("appUrlOpen", (data) => {
      const u = data?.url ?? ""
      if (u.includes("messaging-handoff") || u.includes("tradesman://messaging")) {
        void openMessagingAppWithSession()
      }
    })
    return () => handle.remove()
  } catch {
    return () => {}
  }
}
