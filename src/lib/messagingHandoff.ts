/**
 * Open the standalone Tradesman Messaging app with the current Supabase session
 * so the user does not re-enter email/password.
 *
 * Deep link: tradesmanmsg://auth#access_token=...&refresh_token=...
 * If Messaging is not installed (Android), Intent browser_fallback goes to Play Store.
 * We deliberately do NOT force Play Store after a short timer — Capacitor WebViews often
 * stay "visible" after a successful launch, which was wrongly opening Play Store every time.
 */
import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabase"

export const MESSAGING_ANDROID_PACKAGE = "com.tradesmanus.messaging"
export const MESSAGING_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MESSAGING_ANDROID_PACKAGE}`
export const MESSAGING_PLAY_STORE_MARKET_URL = `market://details?id=${MESSAGING_ANDROID_PACKAGE}`

export const MAIN_ANDROID_PACKAGE = "com.tradesmanus.com"
export const MAIN_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MAIN_ANDROID_PACKAGE}`

/** Set when the iOS Messaging app is live on the App Store. */
export const MESSAGING_IOS_APP_STORE_URL =
  (typeof import.meta !== "undefined" &&
    typeof import.meta.env?.VITE_MESSAGING_IOS_APP_STORE_URL === "string" &&
    import.meta.env.VITE_MESSAGING_IOS_APP_STORE_URL.trim()) ||
  ""

function isAndroidUa(): boolean {
  if (typeof navigator === "undefined") return false
  return /Android/i.test(navigator.userAgent)
}

function isIosUa(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** Open store listing for Tradesman Messaging (Play on Android, App Store on iOS when configured). */
export function openMessagingPlayStore(): void {
  if (typeof window === "undefined") return
  try {
    const nativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"
    if ((nativeIos || isIosUa()) && MESSAGING_IOS_APP_STORE_URL) {
      window.location.href = MESSAGING_IOS_APP_STORE_URL
      return
    }
    if (isAndroidUa() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) {
      window.location.href = MESSAGING_PLAY_STORE_MARKET_URL
      return
    }
  } catch {
    /* fall through */
  }
  window.open(MESSAGING_PLAY_STORE_URL, "_blank", "noopener,noreferrer")
}

export function openMainAppPlayStore(): void {
  if (typeof window === "undefined") return
  try {
    if (isAndroidUa() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) {
      window.location.href = `market://details?id=${MAIN_ANDROID_PACKAGE}`
      return
    }
  } catch {
    /* fall through */
  }
  window.open(MAIN_PLAY_STORE_URL, "_blank", "noopener,noreferrer")
}

/**
 * Open Messaging with session when possible; otherwise store listing (via Intent fallback only).
 * Optional `phone` / `label` open the Phone tab with dial prefill.
 * Optional `threadId` opens that Instant Messaging thread.
 *   tradesmanmsg://auth#access_token=…&refresh_token=…&phone=…&thread=…
 */
export async function openMessagingAppWithSession(opts?: {
  playStoreFallbackMs?: number
  phone?: string | null
  label?: string | null
  threadId?: string | null
  messageId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Not signed in." }
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session?.access_token || !session.refresh_token) {
    return { ok: false, error: "No active session. Sign in to Tradesman first." }
  }
  let hash = `access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`
  const phone = opts?.phone?.trim()
  if (phone) {
    hash += `&phone=${encodeURIComponent(phone)}`
    const label = opts?.label?.trim()
    if (label) hash += `&label=${encodeURIComponent(label)}`
  }
  const threadId = opts?.threadId?.trim()
  if (threadId) {
    hash += `&thread=${encodeURIComponent(threadId)}`
    const messageId = opts?.messageId?.trim()
    if (messageId) hash += `&messageId=${encodeURIComponent(messageId)}`
  }
  const playFallback = encodeURIComponent(MESSAGING_PLAY_STORE_URL)
  const deepLink = `tradesmanmsg://auth#${hash}`

  try {
    const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    const android = nativeAndroid || isAndroidUa()

    if (android) {
      // Prefer opening the installed package. browser_fallback_url only if package missing.
      const intent =
        `intent://auth#${hash}#Intent;scheme=tradesmanmsg;package=${MESSAGING_ANDROID_PACKAGE};` +
        `S.browser_fallback_url=${playFallback};end`
      if (nativeAndroid) {
        try {
          const { TradesmanNative } = await import("../plugins/tradesman-native")
          await TradesmanNative.openExternalUrl({ url: intent })
          return { ok: true }
        } catch {
          /* fall through */
        }
      }
      window.location.href = intent
      return { ok: true }
    }

    window.location.href = deepLink
    return { ok: true }
  } catch (e) {
    openMessagingPlayStore()
    return { ok: false, error: e instanceof Error ? e.message : "Could not open Messaging." }
  }
}

type CapAppMod = {
  App?: {
    addListener: (event: string, cb: (data: { url: string }) => void) => Promise<{ remove: () => void }>
    getLaunchUrl?: () => Promise<{ url?: string } | undefined>
    openUrl?: (opts: { url: string }) => Promise<void>
  }
}

function handleHandoffUrl(u: string): void {
  if (!u.includes("messaging-handoff") && !u.includes("tradesman://messaging")) return
  void openMessagingAppWithSession().then((r) => {
    if (!r.ok && r.error) {
      try {
        window.alert(r.error)
      } catch {
        /* ignore */
      }
    }
  })
}

/** Listen for tradesman://messaging-handoff and open the messaging app with tokens. */
export async function initMessagingHandoffListener(): Promise<() => void> {
  try {
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<CapAppMod>
    const mod = await importer("@capacitor/app")
    const App = mod.App
    if (!App?.addListener) return () => {}

    // Cold start: URL that launched the app (mirror messaging sharedAuth).
    try {
      if (typeof App.getLaunchUrl === "function") {
        const launch = await App.getLaunchUrl()
        if (launch?.url) handleHandoffUrl(launch.url)
      }
    } catch {
      /* ignore */
    }

    const handle = await App.addListener("appUrlOpen", (data) => {
      handleHandoffUrl(data?.url ?? "")
    })
    return () => handle.remove()
  } catch {
    return () => {}
  }
}
