/**
 * Open the standalone Tradesman Messaging app with the current Supabase session
 * so the user does not re-enter email/password.
 *
 * Deep link: tradesmanmsg://auth#access_token=...&refresh_token=...
 */
import { supabase } from "./supabase"

export async function openMessagingAppWithSession(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Not signed in." }
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session?.access_token || !session.refresh_token) {
    return { ok: false, error: "No active session. Sign in to Tradesman first." }
  }
  const hash = `access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`
  const url = `tradesmanmsg://auth#${hash}`

  try {
    // Android: prefer intent so the messaging package is targeted when installed.
    const isAndroid = /Android/i.test(navigator.userAgent)
    if (isAndroid) {
      window.location.href = `intent://auth#${hash}#Intent;scheme=tradesmanmsg;package=com.tradesmanus.messaging;end`
    } else {
      window.location.href = url
    }
    return { ok: true }
  } catch (e) {
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
    // Optional native dependency — resolve at runtime only.
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
