import { useEffect, useState } from "react"
import { BusinessProfilePublicSite, type PublicBusinessProfileData } from "../public/BusinessProfilePublicSite"
import { WEBSITE_BUILDER_PREVIEW_STORAGE_KEY } from "../../lib/businessPublicProfile"

function readPreviewPayload(): PublicBusinessProfileData | null {
  try {
    // localStorage survives window.open(..., "noopener") — sessionStorage does not.
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
    if (data?.ok) return
    const again = readPreviewPayload()
    if (again?.ok) setData(again)
  }, [data?.ok])

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
        <strong style={{ fontSize: 13 }}>Website preview (unsaved changes included)</strong>
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
