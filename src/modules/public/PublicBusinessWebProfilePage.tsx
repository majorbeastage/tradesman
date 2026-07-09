import { useEffect, useMemo, useState, type CSSProperties } from "react"
import logo from "../../assets/logo.png"
import { theme } from "../../styles/theme"

type Props = { slug: string }

type PublicBusinessProfilePayload = {
  ok?: boolean
  error?: string
  businessName?: string
  tagline?: string
  aboutUs?: string
  profilePhotoUrl?: string | null
  workPhotoUrls?: string[]
  phone?: string | null
  email?: string | null
  address?: string | null
  serviceArea?: string | null
  businessHours?: Array<{ day: string; hours: string }>
}

const shell: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: "#0f172a",
}

const card: CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  background: "#fff",
  borderRadius: 16,
  border: `1px solid ${theme.border}`,
  boxShadow: "0 16px 48px rgba(15, 23, 42, 0.08)",
  overflow: "hidden",
}

export default function PublicBusinessWebProfilePage({ slug }: Props) {
  const [data, setData] = useState<PublicBusinessProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)

  const safeSlug = useMemo(() => slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64), [slug])

  useEffect(() => {
    if (!safeSlug || safeSlug.length < 3) {
      setData({ ok: false, error: "Invalid profile link." })
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/platform-tools?__route=public-business-profile&slug=${encodeURIComponent(safeSlug)}`)
        const text = await res.text()
        let json: PublicBusinessProfilePayload
        try {
          json = JSON.parse(text) as PublicBusinessProfilePayload
        } catch {
          if (!cancelled) {
            setData({
              ok: false,
              error: res.ok
                ? "Unexpected response from server."
                : text.trim().slice(0, 200) || `Server error (${res.status}).`,
            })
          }
          return
        }
        if (!cancelled) {
          setData(
            json.ok
              ? json
              : { ok: false, error: json.error ?? (res.status === 404 ? "Profile not found." : `Could not load profile (${res.status}).`) },
          )
        }
      } catch {
        if (!cancelled) setData({ ok: false, error: "Could not reach the server. Try again in a moment." })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [safeSlug])

  if (loading) {
    return (
      <div style={{ ...shell, display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ color: "#64748b" }}>Loading…</p>
      </div>
    )
  }

  if (!data?.ok) {
    return (
      <div style={{ ...shell, padding: "48px 16px" }}>
        <div style={{ ...card, padding: 32, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Profile not available</h1>
          <p style={{ margin: 0, color: "#64748b" }}>{data?.error ?? "This business profile is not published."}</p>
          <PoweredByFooter />
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...shell, padding: "32px 16px 48px" }}>
      <article style={card}>
        <header style={{ padding: "28px 24px 20px", textAlign: "center", borderBottom: `1px solid ${theme.border}` }}>
          {data.profilePhotoUrl ? (
            <img
              src={data.profilePhotoUrl}
              alt=""
              style={{
                width: 112,
                height: 112,
                borderRadius: "50%",
                objectFit: "cover",
                border: `3px solid ${theme.border}`,
                marginBottom: 16,
              }}
            />
          ) : null}
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 900, lineHeight: 1.2 }}>{data.businessName}</h1>
          {data.tagline ? (
            <p style={{ margin: 0, fontSize: 16, color: "#475569", lineHeight: 1.45, maxWidth: 520, marginInline: "auto" }}>
              {data.tagline}
            </p>
          ) : null}
        </header>

        {data.aboutUs ? (
          <section style={{ padding: "20px 24px", borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
              About us
            </h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#334155", whiteSpace: "pre-wrap" }}>{data.aboutUs}</p>
          </section>
        ) : null}

        {(data.phone || data.email || data.address || data.serviceArea) && (
          <section style={{ padding: "20px 24px", borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
              Contact us
            </h2>
            <div style={{ display: "grid", gap: 10, fontSize: 15, lineHeight: 1.5 }}>
              {data.phone ? (
                <div>
                  <strong>Phone:</strong>{" "}
                  <a href={`tel:${data.phone.replace(/\D/g, "")}`} style={{ color: theme.primary, fontWeight: 700 }}>
                    {data.phone}
                  </a>
                </div>
              ) : null}
              {data.email ? (
                <div>
                  <strong>Email:</strong>{" "}
                  <a href={`mailto:${data.email}`} style={{ color: theme.primary, fontWeight: 700 }}>
                    {data.email}
                  </a>
                </div>
              ) : null}
              {data.address ? (
                <div>
                  <strong>Address:</strong> {data.address}
                </div>
              ) : null}
              {data.serviceArea ? (
                <div>
                  <strong>Service area:</strong> {data.serviceArea}
                </div>
              ) : null}
            </div>
          </section>
        )}

        {data.businessHours && data.businessHours.length > 0 ? (
          <section style={{ padding: "20px 24px", borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
              Business hours
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6, fontSize: 15 }}>
              {data.businessHours.map((row) => (
                <li key={row.day} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontWeight: 600 }}>{row.day}</span>
                  <span style={{ color: "#475569" }}>{row.hours}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.workPhotoUrls && data.workPhotoUrls.length > 0 ? (
          <section style={{ padding: "20px 24px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
              Our work
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {data.workPhotoUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 10, border: `1px solid ${theme.border}` }}
                />
              ))}
            </div>
          </section>
        ) : null}

        <PoweredByFooter />
      </article>
    </div>
  )
}

function PoweredByFooter() {
  return (
    <footer
      style={{
        padding: "20px 24px 24px",
        borderTop: `1px solid ${theme.border}`,
        background: "#f8fafc",
        textAlign: "center",
      }}
    >
      <a
        href="/"
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
          color: "#475569",
        }}
      >
        <img src={logo} alt="Tradesman" style={{ height: 40, width: "auto", objectFit: "contain" }} />
        <span style={{ fontSize: 12, fontWeight: 700 }}>Powered by Tradesman Systems LLC</span>
      </a>
    </footer>
  )
}
