import { supabase } from "./supabaseClient"

/**
 * Shared auto-login: accept a session handed off from the full Tradesman mobile app.
 *
 * The main app opens this app via a deep link with tokens in the URL fragment:
 *   tradesmanmsg://auth#access_token=<JWT>&refresh_token=<RT>
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

export async function applySessionFromUrl(url: string): Promise<boolean> {
  const tokens = parseTokensFromUrl(url)
  if (!tokens) return false
  const { error } = await supabase.auth.setSession(tokens)
  return !error
}

/**
 * Register handoff listeners. On native, listens for Capacitor App `appUrlOpen`.
 * On web, checks the current location hash once.
 */
export async function initSharedAuth(): Promise<() => void> {
  // Web: handle a hash present at load.
  if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
    await applySessionFromUrl(window.location.href)
    history.replaceState(null, "", window.location.pathname + window.location.search)
  }

  // Native: Capacitor App plugin (loaded dynamically so web build/dev works without it).
  try {
    const mod = (await import("@capacitor/app")) as {
      App?: { addListener: (event: string, cb: (data: { url: string }) => void) => Promise<{ remove: () => void }> }
    }
    const App = mod.App
    if (App?.addListener) {
      const handle = await App.addListener("appUrlOpen", (data) => {
        if (data?.url) void applySessionFromUrl(data.url)
      })
      return () => handle.remove()
    }
  } catch {
    /* @capacitor/app not installed in this environment — web fallback only */
  }
  return () => {}
}
