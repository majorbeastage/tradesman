import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"

type Row = {
  user_id: string
  lat: number
  lng: number
  accuracy_m: number | null
  updated_at: string
}

type Props = {
  userIds: string[]
  onClose: () => void
}

export default function TeamLocationsMapModal({ userIds, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!supabase || userIds.length === 0) {
      setLoading(false)
      setError("No team users to load.")
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const { data: locs, error: e1 } = await supabase
        .from("user_last_locations")
        .select("user_id, lat, lng, accuracy_m, updated_at")
        .in("user_id", userIds)
      if (cancelled) return
      if (e1) {
        setError(e1.message)
        setLoading(false)
        return
      }
      const { data: profs, error: e2 } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds)
      if (cancelled) return
      if (e2) {
        setError(e2.message)
        setLoading(false)
        return
      }
      const lab: Record<string, string> = {}
      for (const p of profs ?? []) {
        lab[p.id] = (p.display_name as string)?.trim() || p.id.slice(0, 8) + "…"
      }
      setLabels(lab)

      if (!mapRef.current) {
        setLoading(false)
        return
      }

      const rows = (locs ?? []) as Row[]
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const map = L.map(mapRef.current, { zoomControl: true })
      mapInstanceRef.current = map
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map)

      if (rows.length === 0) {
        map.setView([39.8283, -98.5795], 4)
        setLoading(false)
        return
      }

      const group = L.featureGroup()
      for (const r of rows) {
        const m = L.circleMarker([r.lat, r.lng], {
          radius: 9,
          color: "#15803d",
          fillColor: "#22c55e",
          fillOpacity: 0.85,
          weight: 2,
        })
        const when = r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"
        const acc = r.accuracy_m != null ? `${Math.round(r.accuracy_m)} m` : "—"
        m.bindPopup(
          `<strong>${lab[r.user_id] ?? r.user_id.slice(0, 8)}</strong><br/>Updated: ${when}<br/>Accuracy: ${acc}`,
        )
        m.addTo(group)
      }
      group.addTo(map)
      map.fitBounds(group.getBounds().pad(0.25))
      setLoading(false)
    })()
    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [userIds])

  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(720px, 94vw)",
          maxHeight: "88vh",
          overflow: "hidden",
          background: "#fff",
          borderRadius: 10,
          padding: 16,
          zIndex: 10001,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: theme.text }}>Team map</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
          Last position from users who enabled GPS under Account → Mobile app. Updates about every 2 minutes while the app is open.
          {Object.keys(labels).length > 0 ? ` Tracking ${userIds.length} selected account(s).` : ""}
        </p>
        {error && <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p>}
        {loading && <p style={{ margin: 0, fontSize: 13, color: theme.text }}>Loading map…</p>}
        <div ref={mapRef} style={{ height: "min(50vh, 420px)", width: "100%", borderRadius: 8, border: `1px solid ${theme.border}` }} />
      </div>
    </>
  )
}
