import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./lib/supabaseClient"
import { initSharedAuth } from "./lib/sharedAuth"
import LoginScreen from "./screens/LoginScreen"
import MessengerScreen from "./screens/MessengerScreen"

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    void (async () => {
      cleanup = await initSharedAuth()
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setReady(true)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => {
      sub.subscription.unsubscribe()
      cleanup?.()
    }
  }, [])

  if (!ready) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Loading…</div>
  }
  if (!session?.user) return <LoginScreen />
  return <MessengerScreen me={session.user.id} />
}
