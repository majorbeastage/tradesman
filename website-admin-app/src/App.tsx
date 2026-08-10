import { useEffect, useState, type ReactNode } from "react"
import { supabase } from "./lib/supabaseClient"
import { parseHostedWebsiteDoc, type HostedWebsiteDoc } from "./lib/hostedWebsite"

export default function App() {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [hosted, setHosted] = useState<HostedWebsiteDoc | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!supabase) {
      setErr("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.")
      setReady(true)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session))
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!signedIn || !supabase) return
    void supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      const { data: row } = await supabase.from("profiles").select("metadata, display_name").eq("id", uid).maybeSingle()
      const meta = row?.metadata
      const parsed = parseHostedWebsiteDoc(meta)
      setHosted(parsed)
    })
  }, [signedIn])

  if (!ready) return <Shell>Signing in…</Shell>

  if (!signedIn) {
    return (
      <Shell>
        <h1 style={h1}>Website editor</h1>
        <p style={p}>
          Open this page from <strong>Growth → Open website editor</strong> in Tradesman so we can sign you in with your
          existing account — no separate website password.
        </p>
        {err ? <p style={{ ...p, color: "#b91c1c" }}>{err}</p> : null}
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 style={h1}>Website editor</h1>
      <p style={p}>
        Tradesman-hosted marketing site (templates for plumbing, HVAC, and more coming soon). This portal uses your
        Tradesman login only.
      </p>
      {hosted ? (
        <div style={card}>
          <div style={{ fontSize: 13, color: "#64748b" }}>Site slug</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{hosted.siteSlug || "— not set yet —"}</div>
          {hosted.customDomain ? (
            <>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>Custom domain</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{hosted.customDomain}</div>
            </>
          ) : null}
        </div>
      ) : null}
      <p style={{ ...p, marginTop: 16 }}>
        Editor tools (page builder, trade templates, publish) will land here on this Vercel deployment without affecting
        the main Tradesman app.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 8px 30px rgba(15,23,42,0.08)" }}>
        {children}
      </div>
    </div>
  )
}

const h1: React.CSSProperties = { margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: "#0f172a" }
const p: React.CSSProperties = { margin: "0 0 12px", fontSize: 14, color: "#475569", lineHeight: 1.55 }
const card: React.CSSProperties = { marginTop: 16, padding: 16, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }
