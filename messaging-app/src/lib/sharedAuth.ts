import { supabase } from "./supabaseClient"
import { Capacitor } from "@capacitor/core"
import { parseDialFromUrl, setPendingDial } from "./pendingDial"
import { parseMissedFromUrl, parseThreadFromUrl, setPendingMissedCalls, setPendingThread } from "./pendingThread"

/**
 * Shared auto-login: accept a session handed off from the full Tradesman mobile app.
 *
 * Preferred (Android-safe): a 60-second single-use exchange code
 *   tradesmanmsg://auth?code=mh_...
 * Legacy token query/fragment (accepted for one release during rollout):
 *   tradesmanmsg://auth?access_token=<JWT>&refresh_token=<RT>
 *   tradesmanmsg://auth#access_token=<JWT>&refresh_token=<RT>
 * Optional dial / thread extras in either place.
 */

function paramsFromUrl(url: string): URLSearchParams {
  try {
    const hashIndex = url.indexOf("#")
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
    const qIndex = withoutHash.indexOf("?")
    const query = qIndex >= 0 ? withoutHash.slice(qIndex + 1) : ""
    const frag = hashIndex >= 0 ? url.slice(hashIndex + 1) : ""
    // Prefer query (survives Android Intent / getLaunchUrl); fall back to hash.
    const merged = new URLSearchParams(query)
    if (frag) {
      const fp = new URLSearchParams(frag.includes("=") ? frag : "")
      fp.forEach((v, k) => {
        if (!merged.has(k)) merged.set(k, v)
      })
    }
    return merged
  } catch {
    return new URLSearchParams()
  }
}

function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  const params = paramsFromUrl(url)
  const access_token = params.get("access_token")
  const refresh_token = params.get("refresh_token")
  if (access_token && refresh_token) return { access_token, refresh_token }
  return null
}

function handoffApiUrl(): string {
  if (!Capacitor.isNativePlatform()) return "/api/messaging-handoff"
  const configured = String(import.meta.env.VITE_PUBLIC_APP_ORIGIN ?? "").trim().replace(/\/+$/, "")
  return `${configured || "https://www.tradesman-us.com"}/api/messaging-handoff`
}

async function redeemHandoffCode(code: string): Promise<boolean> {
  const response = await fetch(handoffApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem", code }),
  })
  const payload = (await response.json().catch(() => ({}))) as { tokenHash?: string }
  if (!response.ok || !payload.tokenHash) return false
  const { error } = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "magiclink",
  })
  return !error
}

function captureHandoffExtras(url: string): void {
  const dial = parseDialFromUrl(url)
  if (dial) setPendingDial(dial)
  const thread = parseThreadFromUrl(url)
  if (thread) setPendingThread(thread)
  if (parseMissedFromUrl(url)) setPendingMissedCalls(true)
}

export async function applySessionFromUrl(url: string): Promise<boolean> {
  captureHandoffExtras(url)
  const code = paramsFromUrl(url).get("code")?.trim()
  if (code) return redeemHandoffCode(code)
  // Temporary compatibility for main-app versions already installed in the field.
  const tokens = parseTokensFromUrl(url)
  if (!tokens) return false
  const { error } = await supabase.auth.setSession(tokens)
  return !error
}

/**
 * Register handoff listeners. On native, listens for Capacitor App `appUrlOpen`
 * and also checks cold-start `getLaunchUrl` (common miss when Messaging was closed).
 * On web, checks the current location hash/query once.
 */
export async function initSharedAuth(): Promise<() => void> {
  if (typeof window !== "undefined") {
    const href = window.location.href
    if (
      href.includes("access_token") ||
      href.includes("code=") ||
      href.includes("phone=") ||
      href.includes("thread=") ||
      href.includes("missed=")
    ) {
      await applySessionFromUrl(href)
      history.replaceState(null, "", window.location.pathname)
    }
  }

  try {
    const mod = (await import("@capacitor/app")) as {
      App?: {
        addListener: (event: string, cb: (data: { url: string }) => void) => Promise<{ remove: () => void }>
        getLaunchUrl?: () => Promise<{ url?: string } | undefined>
      }
    }
    const App = mod.App
    if (!App?.addListener) return () => {}

    try {
      const launch = await App.getLaunchUrl?.()
      if (launch?.url) await applySessionFromUrl(launch.url)
    } catch {
      /* ignore */
    }

    const handle = await App.addListener("appUrlOpen", (data) => {
      if (data?.url) void applySessionFromUrl(data.url)
    })
    return () => handle.remove()
  } catch {
    /* @capacitor/app not installed in this environment — web fallback only */
  }
  return () => {}
}
