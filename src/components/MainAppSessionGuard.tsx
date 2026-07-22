import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  heartbeatAppSession,
  registerAppSession,
  revokeLocalAppSession,
} from "../lib/appSessions"
import { getVoiceTrafficInCall, subscribeVoiceTrafficInCall } from "../lib/voiceTrafficGuard"

/**
 * Main app common-login guard: registers this device, heartbeats, soft-takes over
 * when another main session wins. Never interrupts live voice (defers sign-out).
 */
export default function MainAppSessionGuard({ userId }: { userId: string | null }) {
  const [inCall, setInCall] = useState(getVoiceTrafficInCall)
  const [takeoverPending, setTakeoverPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => subscribeVoiceTrafficInCall(setInCall), [])

  useEffect(() => {
    const sb = supabase
    if (!sb || !userId) return
    let cancelled = false

    const applySuperseded = () => {
      if (getVoiceTrafficInCall()) {
        setTakeoverPending(true)
        setMessage("Signed in on another device. This session will end when your call finishes.")
        return
      }
      setTakeoverPending(false)
      setMessage("Signed in on another device. Signing out here…")
      void (async () => {
        await revokeLocalAppSession(sb, "main")
        await sb.auth.signOut({ scope: "local" })
      })()
    }

    void registerAppSession(sb, "main").then((r) => {
      if (cancelled) return
      if (!r.ok && r.error) console.warn("[sessions] register main:", r.error)
    })

    const tick = () => {
      void heartbeatAppSession(sb, "main").then((r) => {
        if (cancelled) return
        if (r.missing) {
          void registerAppSession(sb, "main")
          return
        }
        if (r.superseded) applySuperseded()
      })
    }

    const interval = window.setInterval(tick, 25_000)
    const onFocus = () => tick()
    window.addEventListener("focus", onFocus)
    const onVis = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVis)

    const channel = sb
      .channel(`user-app-sessions-main-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_app_sessions", filter: `user_id=eq.${userId}` },
        () => tick(),
      )
      .subscribe()

    tick()

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
      void sb.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    const sb = supabase
    if (inCall) return
    if (!takeoverPending || !sb) return
    setTakeoverPending(false)
    setMessage("Signed in on another device. Signing out here…")
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
