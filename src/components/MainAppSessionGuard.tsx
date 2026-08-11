import { useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  heartbeatAppSession,
  registerAppSession,
  revokeLocalAppSession,
} from "../lib/appSessions"
import { getVoiceTrafficInCall, subscribeVoiceTrafficInCall } from "../lib/voiceTrafficGuard"

const HEARTBEAT_MS = 60_000
/** Focus/visibility can fire in bursts; never let them heartbeat faster than this. */
const MIN_HEARTBEAT_GAP_MS = 30_000
/** Grace after mount — never sign out during initial register + reclaim. */
const MOUNT_GRACE_MS = 8_000

/**
 * Main app common-login guard: registers this device, heartbeats, soft-takes over
 * when another main session wins. Never interrupts live voice (defers sign-out).
 *
 * Polls rather than subscribing to user_app_sessions. A realtime subscription here fed
 * itself — each heartbeat wrote last_seen, which published a change, which triggered the
 * next heartbeat — and the resulting write storm took the Supabase instance down with it.
 */
export default function MainAppSessionGuard({ userId }: { userId: string | null }) {
  const [inCall, setInCall] = useState(getVoiceTrafficInCall)
  const [takeoverPending, setTakeoverPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const lastTickRef = useRef(0)
  const inFlightRef = useRef(false)
  const mountedAtRef = useRef(0)

  useEffect(() => subscribeVoiceTrafficInCall(setInCall), [])

  useEffect(() => {
    const sb = supabase
    if (!sb || !userId) return
    let cancelled = false
    mountedAtRef.current = Date.now()
    let registered = false

    const applySuperseded = () => {
      if (Date.now() - mountedAtRef.current < MOUNT_GRACE_MS) return
      if (getVoiceTrafficInCall()) {
        setTakeoverPending(true)
        setMessage(
          "This account reached its 4-device limit. This least-recently-used session will end when your call finishes.",
        )
        return
      }
      setTakeoverPending(false)
      setMessage("This account reached its 4-device limit. Signing out the least-recently-used session here…")
      void (async () => {
        await revokeLocalAppSession(sb, "main")
        await sb.auth.signOut({ scope: "local" })
      })()
    }

    const ensureRegistered = async (): Promise<boolean> => {
      const r = await registerAppSession(sb, "main")
      if (cancelled) return false
      registered = true
      if (!r.ok && r.error) console.warn("[sessions] register main:", r.error)
      return r.ok
    }

    /** Fresh sign-in should reclaim an active slot before we sign this device out. */
    const heartbeatOrReclaim = async () => {
      let hb = await heartbeatAppSession(sb, "main")
      if (cancelled) return
      if (hb.missing || hb.error) {
        await ensureRegistered()
        return
      }
      if (!hb.superseded) {
        setTakeoverPending(false)
        setMessage(null)
        return
      }
      await ensureRegistered()
      if (cancelled) return
      hb = await heartbeatAppSession(sb, "main")
      if (cancelled) return
      if (hb.superseded) applySuperseded()
      else {
        setTakeoverPending(false)
        setMessage(null)
      }
    }

    const tick = (force = false) => {
      if (!registered || inFlightRef.current) return
      const now = Date.now()
      if (!force && now - lastTickRef.current < MIN_HEARTBEAT_GAP_MS) return
      lastTickRef.current = now
      inFlightRef.current = true
      void heartbeatOrReclaim().finally(() => {
        inFlightRef.current = false
      })
    }

    void (async () => {
      await ensureRegistered()
      if (cancelled) return
      tick(true)
    })()

    const interval = window.setInterval(() => tick(true), HEARTBEAT_MS)
    const onFocus = () => tick()
    window.addEventListener("focus", onFocus)
    const onVis = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [userId])

  useEffect(() => {
    const sb = supabase
    if (inCall) return
    if (!takeoverPending || !sb) return
    if (Date.now() - mountedAtRef.current < MOUNT_GRACE_MS) return
    setTakeoverPending(false)
    setMessage("This account reached its 4-device limit. Signing out the least-recently-used session here…")
    void (async () => {
      await revokeLocalAppSession(sb, "main")
      await sb.auth.signOut({ scope: "local" })
    })()
  }, [inCall, takeoverPending])

  if (!message && !takeoverPending) return null

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10050,
        padding: "10px 16px",
        background: takeoverPending ? "#92400e" : "#0f172a",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        boxShadow: "0 4px 16px rgba(15,23,42,0.25)",
      }}
    >
      {message}
      {takeoverPending ? (
        <span style={{ display: "block", marginTop: 4, fontWeight: 600, opacity: 0.9, color: "#fde68a" }}>
          Your call stays connected.
        </span>
      ) : null}
    </div>
  )
}
