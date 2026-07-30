import type { SupabaseClient } from "@supabase/supabase-js"
import { Capacitor } from "@capacitor/core"

const REFRESH_EARLY_MS = 2 * 60_000
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000]

/**
 * Keep native auth healthy while the WebView is suspended and resumed.
 * Network failures retry without clearing the stored refresh token or signing out.
 */
export async function initNativeAuthLifecycle(client: SupabaseClient): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}

  const { App } = await import("@capacitor/app")
  let active = true
  let disposed = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = undefined
  }

  const ensureFresh = async (attempt = 0): Promise<void> => {
    if (disposed || !active) return
    client.auth.startAutoRefresh()
    const { data, error } = await client.auth.getSession()
    if (!error && data.session) {
      const expiresAtMs = Number(data.session.expires_at ?? 0) * 1000
      if (!expiresAtMs || expiresAtMs > Date.now() + REFRESH_EARLY_MS) return
      const { error: refreshError } = await client.auth.refreshSession()
      if (!refreshError) return
    } else if (!error) {
      return
    }

    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
    clearRetry()
    retryTimer = setTimeout(() => void ensureFresh(attempt + 1), delay)
  }

  const initial = await App.getState()
  active = initial.isActive
  if (active) void ensureFresh()
  else client.auth.stopAutoRefresh()

  const listener = await App.addListener("appStateChange", ({ isActive }) => {
    active = isActive
    clearRetry()
    if (isActive) void ensureFresh()
    else client.auth.stopAutoRefresh()
  })

  return () => {
    disposed = true
    clearRetry()
    client.auth.stopAutoRefresh()
    void listener.remove()
  }
}
