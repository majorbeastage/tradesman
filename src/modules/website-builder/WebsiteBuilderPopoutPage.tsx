import { useEffect, useState } from "react"
import { BusinessProfilePublicSite, type PublicBusinessProfileData } from "../public/BusinessProfilePublicSite"
import {
  WEBSITE_BUILDER_PREVIEW_CHANNEL,
  WEBSITE_BUILDER_PREVIEW_MESSAGE,
  WEBSITE_BUILDER_PREVIEW_STORAGE_KEY,
} from "../../lib/businessPublicProfile"

function readPreviewPayload(): PublicBusinessProfileData | null {
  try {
    const raw =
      localStorage.getItem(WEBSITE_BUILDER_PREVIEW_STORAGE_KEY) ||
      sessionStorage.getItem(WEBSITE_BUILDER_PREVIEW_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PublicBusinessProfileData
  } catch {
    return null
  }
}

/** Full-window live preview opened from Website Builder (no editor chrome). */
export default function WebsiteBuilderPopoutPage() {
  const [data, setData] = useState<PublicBusinessProfileData | null>(() => readPreviewPayload())

  useEffect(() => {
    const apply = () => {
      const next = readPreviewPayload()
      if (next?.ok) setData(next)
    }
    apply()
    const onStorage = (e: StorageEvent) => {
      if (e.key === WEBSITE_BUILDER_PREVIEW_STORAGE_KEY || e.key === null) apply()
    }
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === WEBSITE_BUILDER_PREVIEW_MESSAGE) apply()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("message", onMessage)
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(WEBSITE_BUILDER_PREVIEW_CHANNEL)
      bc.onmessage = apply
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("message", onMessage)
      try {
        bc?.close()
      } catch {
        /* ignore */
      }
    }
  }, [])

  if (!data?.ok) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#0f172a" }}>
        <h1 style={{ marginTop: 0 }}>Preview unavailable</h1>
        <p>Open Website Builder and click Pop-out preview again.</p>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          If this keeps happening, allow pop-ups for tradesman-us.com, then try Pop-out once more from the editor.
        </p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "rgba(15,23,42,0.92)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <strong style={{ fontSize: 13 }}>Website preview (updates as you edit)</strong>
        <button
          type="button"
          onClick={() => window.close()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "#fff",
            color: "#0f172a",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
      <BusinessProfilePublicSite data={data} activePage="home" />
    </div>
  )
}
