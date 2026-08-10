/**
 * Open the standalone Tradesman Messaging app with a one-time exchange code so
 * the user does not re-enter email/password. Messaging redeems the code for its
 * own independently rotating Supabase session; refresh tokens never cross apps.
 *
 * Deep link: tradesmanmsg://auth?code=mh_...
 * If Messaging is not installed (Android), Intent browser_fallback goes to Play Store.
 * We deliberately do NOT force Play Store after a short timer — Capacitor WebViews often
 * stay "visible" after a successful launch, which was wrongly opening Play Store every time.
 */
import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabase"
import { forceRefreshAccessToken, getFreshAccessToken } from "./authPlatformApi"

export const MESSAGING_ANDROID_PACKAGE = "com.tradesmanus.messaging"
export const MESSAGING_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MESSAGING_ANDROID_PACKAGE}`
export const MESSAGING_PLAY_STORE_MARKET_URL = `market://details?id=${MESSAGING_ANDROID_PACKAGE}`

export const MAIN_ANDROID_PACKAGE = "com.tradesmanus.com"
export const MAIN_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MAIN_ANDROID_PACKAGE}`
export const MAIN_PLAY_STORE_MARKET_URL = `market://details?id=${MAIN_ANDROID_PACKAGE}`

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

function handoffApiUrl(): string {
  if (!Capacitor.isNativePlatform()) return "/api/messaging-handoff"
  const configured = String(import.meta.env.VITE_PUBLIC_APP_ORIGIN ?? "").trim().replace(/\/+$/, "")
  return `${configured || "https://www.tradesman-us.com"}/api/messaging-handoff`
}

async function issueMessagingHandoffCode(): Promise<string> {
  if (!supabase) throw new Error("Not signed in.")
  let token = await getFreshAccessToken(supabase, null)
  if (!token) throw new Error("No active session. Sign in to Tradesman first.")

  const request = (accessToken: string) =>
    fetch(handoffApiUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue" }),
    })

  let response = await request(token)
  if (response.status === 401) {
    token = (await forceRefreshAccessToken(supabase)) ?? ""
    if (token) response = await request(token)
  }
  const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string }
  if (!response.ok || !payload.code) {
    throw new Error(payload.error || "Could not create the secure Messaging sign-in.")
  }
  return payload.code
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
 *   tradesmanmsg://auth?code=…&phone=…&thread=…
 */
export async function openMessagingAppWithSession(opts?: {
  playStoreFallbackMs?: number
  phone?: string | null
  label?: string | null
  threadId?: string | null
  messageId?: string | null
  /** Open Messenger focused on missed calls. */
  openMissed?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  let code: string
  try {
    code = await issueMessagingHandoffCode()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not prepare Messaging sign-in." }
  }
  let qs = `code=${encodeURIComponent(code)}`
  const phone = opts?.phone?.trim()
  if (phone) {
    qs += `&phone=${encodeURIComponent(phone)}`
    const label = opts?.label?.trim()
    if (label) qs += `&label=${encodeURIComponent(label)}`
  }
  const threadId = opts?.threadId?.trim()
  if (threadId) {
    qs += `&thread=${encodeURIComponent(threadId)}`
    const messageId = opts?.messageId?.trim()
    if (messageId) qs += `&messageId=${encodeURIComponent(messageId)}`
  }
  if (opts?.openMissed) {
    qs += `&missed=1`
  }
  const playFallback = encodeURIComponent(MESSAGING_PLAY_STORE_URL)
  // Query string (not #fragment) — Android Intent / getLaunchUrl often drops fragments.
  const deepLink = `tradesmanmsg://auth?${qs}`

  try {
    const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    const android = nativeAndroid || isAndroidUa()

    if (android) {
      const intent =
        `intent://auth?${qs}#Intent;scheme=tradesmanmsg;package=${MESSAGING_ANDROID_PACKAGE};` +
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

/** Listen for tradesman://messaging-handoff and open Messaging with a one-time code. */
export async function initMessagingHandoffListener(): Promise<() => void> {
  try {
    const { App } = await import("@capacitor/app")

    // Cold start: URL that launched the app (mirror messaging sharedAuth).
    try {
      const launch = await App.getLaunchUrl()
      if (launch?.url) handleHandoffUrl(launch.url)
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
