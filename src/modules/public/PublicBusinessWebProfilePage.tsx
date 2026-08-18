import { useEffect, useMemo, useState } from "react"
import {
  BusinessProfilePublicSite,
  type PublicBusinessProfileData,
} from "./BusinessProfilePublicSite"
import type { WebsitePublicPageId } from "../../lib/businessPublicProfile"

type Props = {
  slug: string
  /** home | about | contact — from URL path */
  page?: WebsitePublicPageId
}

type PublicBusinessProfilePayload = PublicBusinessProfileData | { ok?: false; error?: string }

export default function PublicBusinessWebProfilePage({ slug, page = "home" }: Props) {
  const [data, setData] = useState<PublicBusinessProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [activePage, setActivePage] = useState<WebsitePublicPageId>(page)

  const safeSlug = useMemo(() => slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64), [slug])

  useEffect(() => {
    setActivePage(page)
  }, [page])

  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname.toLowerCase()
      if (p.endsWith("/about") || p.endsWith("/about/")) setActivePage("about")
      else if (p.endsWith("/contact") || p.endsWith("/contact/")) setActivePage("contact")
      else {
        const custom = /\/page\/([^/]+)\/?$/i.exec(p)
        if (custom?.[1]) setActivePage(`custom:${custom[1]}`)
        else setActivePage("home")
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (!safeSlug || safeSlug.length < 3) {
      setData({ ok: false, error: "Invalid profile link." })
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/platform-tools?__route=public-business-profile&slug=${encodeURIComponent(safeSlug)}`,
        )
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
              : {
                  ok: false,
                  error:
                    (json as { error?: string }).error ??
                    (res.status === 404 ? "Profile not found." : `Could not load profile (${res.status}).`),
                },
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

  const resolvedPage: WebsitePublicPageId =
    activePage === "about" && data.subPages?.about?.enabled === false
      ? "home"
      : activePage === "contact" && data.subPages?.contact?.enabled === false
        ? "home"
        : typeof activePage === "string" && activePage.startsWith("custom:")
          ? data.customPages?.some((p) => p.enabled !== false && `custom:${p.id}` === activePage)
            ? activePage
            : "home"
          : activePage

  return (
    <BusinessProfilePublicSite
      data={data}
      activePage={resolvedPage}
      onNavigatePage={(next) => {
        setActivePage(next)
        const path =
          next === "home"
            ? `/${safeSlug}`
            : typeof next === "string" && next.startsWith("custom:")
              ? `/${safeSlug}/page/${next.slice("custom:".length)}`
              : `/${safeSlug}/${next}`
        try {
          window.history.pushState({}, "", path)
        } catch {
          /* ignore */
        }
      }}
    />
  )
}
