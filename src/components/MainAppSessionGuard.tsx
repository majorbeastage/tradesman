import { useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"
import { heartbeatAppSession, registerAppSession } from "../lib/appSessions"

const HEARTBEAT_MS = 60_000
const MIN_HEARTBEAT_GAP_MS = 30_000

/**
 * Main app common-login registry: tracks devices in user_app_sessions (up to 4 main).
 * Registration + heartbeat only — does NOT sign users out (that was breaking login).
 * Device-limit enforcement can be re-enabled once registry is stable in production.
 */
export default function MainAppSessionGuard({ userId }: { userId: string | null }) {
  const lastTickRef = useRef(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const sb = supabase
    if (!sb || !userId) return
    let cancelled = false
    let registered = false

    const ensureRegistered = async () => {
      const r = await registerAppSession(sb, "main")
      if (cancelled) return
      registered = true
      if (!r.ok && r.error) console.warn("[sessions] register main:", r.error)
    }

    const tick = async (force = false) => {
      if (!registered || inFlightRef.current || cancelled) return
      const now = Date.now()
      if (!force && now - lastTickRef.current < MIN_HEARTBEAT_GAP_MS) return
      lastTickRef.current = now
      inFlightRef.current = true
      try {
        const hb = await heartbeatAppSession(sb, "main")
        if (cancelled) return
        if (hb.missing || hb.error) await ensureRegistered()
        // Intentionally ignore hb.superseded — never auto sign-out from here.
      } finally {
        inFlightRef.current = false
      }
    }

    void (async () => {
      await ensureRegistered()
      if (!cancelled) void tick(true)
    })()

    const interval = window.setInterval(() => void tick(true), HEARTBEAT_MS)
    const onFocus = () => void tick()
    window.addEventListener("focus", onFocus)
    const onVis = () => {
      if (document.visibilityState === "visible") void tick()
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [userId])

  return null
}
