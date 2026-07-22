import { supabase } from "./supabaseClient"
import { parseDialFromUrl, setPendingDial } from "./pendingDial"

/**
 * Shared auto-login: accept a session handed off from the full Tradesman mobile app.
 *
 * The main app opens this app via a deep link with tokens in the URL fragment:
 *   tradesmanmsg://auth#access_token=<JWT>&refresh_token=<RT>
 * Optional dial prefill:
 *   …&phone=<number>&label=<name>
 *
 * We parse that fragment and call supabase.auth.setSession(...). Works on web too
 * (paste the same fragment into the browser URL) for testing.
 */

function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const hashIndex = url.indexOf("#")
    const frag = hashIndex >= 0 ? url.slice(hashIndex + 1) : ""
    if (!frag) return null
    const params = new URLSearchParams(frag)
    const access_token = params.get("access_token")
    const refresh_token = params.get("refresh_token")
    if (access_token && refresh_token) return { access_token, refresh_token }
    return null
  } catch {
    return null
  }
}

function captureDialFromUrl(url: string): void {
  const dial = parseDialFromUrl(url)
  if (dial) setPendingDial(dial)
}

export async function applySessionFromUrl(url: string): Promise<boolean> {
  captureDialFromUrl(url)
  const tokens = parseTokensFromUrl(url)
  if (!tokens) return false
  const { error } = await supabase.auth.setSession(tokens)
  return !error
}

/**
 * Register handoff listeners. On native, listens for Capacitor App `appUrlOpen`
 * and also checks cold-start `getLaunchUrl` (common miss when Messaging was closed).
 * On web, checks the current location hash once.
 */
export async function initSharedAuth(): Promise<() => void> {
  // Web: handle a hash present at load.
  if (typeof window !== "undefined" && (window.location.hash.includes("access_token") || window.location.hash.includes("phone="))) {
    await applySessionFromUrl(window.location.href)
    history.replaceState(null, "", window.location.pathname + window.location.search)
  }

  // Native: Capacitor App plugin (loaded dynamically so web build/dev works without it).
  try {
    const mod = (await import("@capacitor/app")) as {
      App?: {
        addListener: (event: string, cb: (data: { url: string }) => void) => Promise<{ remove: () => void }>
        getLaunchUrl?: () => Promise<{ url?: string } | undefined>
      }
    }
    const App = mod.App
    if (!App?.addListener) return () => {}

    // Cold start: app opened by the deep link while previously closed.
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
