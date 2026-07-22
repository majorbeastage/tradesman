import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./lib/supabaseClient"
import { initSharedAuth } from "./lib/sharedAuth"
import { initMessagingPushTapListener } from "./lib/pushTapHandler"
import {
  heartbeatAppSession,
  registerAppSession,
  revokeLocalAppSession,
} from "./lib/appSessions"
import LoginScreen from "./screens/LoginScreen"
import MessengerScreen from "./screens/MessengerScreen"

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [kicked, setKicked] = useState(false)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let pushCleanup: (() => void) | undefined
    void (async () => {
      cleanup = await initSharedAuth()
      pushCleanup = await initMessagingPushTapListener()
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setReady(true)
      if (data.session?.user) {
        void registerAppSession(supabase, "messaging")
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === "SIGNED_IN" && s?.user) {
        setKicked(false)
        void registerAppSession(supabase, "messaging")
      }
    })
    return () => {
      sub.subscription.unsubscribe()
      cleanup?.()
      pushCleanup?.()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) return
    let cancelled = false
    const tick = () => {
      void heartbeatAppSession(supabase, "messaging").then((r) => {
        if (cancelled) return
        if (r.missing) {
          void registerAppSession(supabase, "messaging")
          return
        }
        if (r.superseded) {
          setKicked(true)
          void (async () => {
            await revokeLocalAppSession(supabase, "messaging")
            await supabase.auth.signOut({ scope: "local" })
          })()
        }
      })
    }
    const id = window.setInterval(tick, 30_000)
    tick()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [session?.user?.id])

  if (!ready) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Loading…</div>
  }
  if (!session?.user) {
    return (
      <>
        {kicked ? (
          <div style={{ background: "#0f172a", color: "#fff", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
            Signed out here — you reached the device limit (3) or signed in elsewhere on Messaging.
          </div>
        ) : null}
        <LoginScreen />
      </>
    )
  }
  return <MessengerScreen me={session.user.id} />
}
