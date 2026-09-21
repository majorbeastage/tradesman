import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { usePortalTheme } from "../lib/useSchemeStyles"
import { platformToolsFetchOrigins, platformToolsJsonBody, readPlatformToolsJsonBody } from "../lib/platformToolsJsonBody"

type Connection = { networkSlug: string; status: string; accountDisplayName?: string }

type Payload = {
  appletUrl: string
  opsUrl?: string
  client: {
    id: string
    displayName: string
    contactEmail: string
    status: string
    connections: Connection[]
  }
  error?: string
}

async function loadApplet(): Promise<Payload> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error("Sign in again.")
  let last = "Could not reach SOLE."
  for (const origin of platformToolsFetchOrigins()) {
    const res = await fetch(`${origin}/api/platform-tools?__route=growth-sole-applet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: platformToolsJsonBody({}),
    })
    const parsed = await readPlatformToolsJsonBody<Payload>(res)
    if (!res.ok) {
      last = parsed.data?.error || `Request failed (${res.status}).`
      if (res.status >= 500) continue
      throw new Error(last)
    }
    if (!parsed.data?.appletUrl) {
      last = parsed.data?.error || "SOLE did not return an applet."
      continue
    }
    return parsed.data
  }
  throw new Error(last)
}

export default function GrowthSoleAppletPanel() {
  const portalTheme = usePortalTheme()
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setErr("")
    setLoading(true)
    try {
      setData(await loadApplet())
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open the SOLE applet.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div>
      <div
        style={{
          border: `1px solid ${portalTheme.border}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 14,
          background: portalTheme.isDark ? "rgba(30,41,59,0.85)" : "#fff",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: portalTheme.text }}>SOLE applet</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: portalTheme.text, opacity: 0.85 }}>
          This Growth tab is the Client applet for this shop. Grant SOLE management of your profiles here — official
          screens only. SOLE’s own logins to those websites live in SOLE Admin, not in Tradesman.
        </p>
        {data?.client ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: portalTheme.text, opacity: 0.75 }}>
            {data.client.displayName} · {data.client.contactEmail} · {data.client.status}
            {data.client.connections.length
              ? ` · ${data.client.connections.map((c) => `${c.networkSlug}: ${c.status}`).join(" · ")}`
              : " · not connected yet"}
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${portalTheme.border}`,
              background: "transparent",
              color: portalTheme.text,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
          {data?.appletUrl ? (
            <a
              href={data.appletUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: portalTheme.primary,
                color: "#fff",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open applet
            </a>
          ) : null}
        </div>
        {loading ? <p style={{ margin: "12px 0 0", fontSize: 13, color: portalTheme.text }}>Issuing SOLE applet…</p> : null}
        {err ? <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c" }}>{err}</p> : null}
      </div>

      {data?.appletUrl ? (
        <iframe
          title="SOLE Client applet"
          src={data.appletUrl}
          style={{
            width: "100%",
            minHeight: 760,
            border: `1px solid ${portalTheme.border}`,
            borderRadius: 12,
            background: "#fff",
          }}
        />
      ) : null}
    </div>
  )
}
