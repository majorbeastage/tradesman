import { useEffect, useMemo, useState } from "react"
import { BusinessProfilePublicSite, type PublicBusinessProfileData } from "./BusinessProfilePublicSite"

type Props = { slug: string }

type PublicBusinessProfilePayload = PublicBusinessProfileData | { ok?: false; error?: string }

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
            json && "ok" in json && json.ok
              ? json
              : { ok: false, error: (json as { error?: string }).error ?? (res.status === 404 ? "Profile not found." : `Could not load profile (${res.status}).`) },
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
      <div style={{ minHeight: "100vh", width: "100%", display: "grid", placeItems: "center", background: "#f8fafc" }}>
        <p style={{ color: "#64748b" }}>Loading…</p>
      </div>
    )
  }

  if (!data || !("ok" in data) || !data.ok) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", padding: "48px 16px", background: "#f8fafc", boxSizing: "border-box" }}>
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
            border: "1px solid #e2e8f0",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Profile not available</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>
            {(data as { error?: string } | null)?.error ?? "This business profile is not published."}
          </p>
        </div>
      </div>
    )
  }

  return <BusinessProfilePublicSite data={data} />
}
