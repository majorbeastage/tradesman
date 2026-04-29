import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { teamMarkerColors, teamMemberDisplayIndex } from "../lib/teamMapStyle"
import { resolveJobMapCoords } from "../lib/jobSiteLocation"

export type TeamMapMember = {
  userId: string
  label: string
  isSelf?: boolean
}

type LocRow = {
  user_id: string
  lat: number
  lng: number
  accuracy_m: number | null
  updated_at: string
}

type CalendarJobRow = {
  id: string
  user_id: string | null
  title: string
  start_at: string
  customer_id: string | null
  metadata: unknown
  customers?: { display_name?: string | null; service_address?: string | null; service_lat?: number | null; service_lng?: number | null } | null
}

type Props = {
  /** Office roster (or single user) — order defines map numbers / colors. */
  members: TeamMapMember[]
  /** User IDs whose calendars are searched for “next job” pins (usually same as all members). */
  orgUserIdsForJobs: string[]
  onClose: () => void
  /** Inline panel (no modal overlay); used inside Calendar → Team management. */
  variant?: "modal" | "embedded"
}

function normalizeCustomerJoin(
  c: CalendarJobRow["customers"],
): { display_name?: string | null; service_address?: string | null; service_lat?: number | null; service_lng?: number | null } | null {
  if (!c) return null
  if (Array.isArray(c)) return c[0] ?? null
  return c
}

export default function TeamLocationsMapModal({ members, orgUserIdsForJobs, onClose, variant = "modal" }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewUserId, setViewUserId] = useState<string>("all")
  const [showNextJobs, setShowNextJobs] = useState(true)

  const orderedIds = useMemo(() => members.map((m) => m.userId).filter(Boolean), [members])
  const labelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const row of members) m.set(row.userId, row.label)
    return m
  }, [members])

  const activeLocationUserIds = useMemo(() => {
    if (viewUserId === "all") return orderedIds
    return orderedIds.includes(viewUserId) ? [viewUserId] : orderedIds
  }, [orderedIds, viewUserId])

  useEffect(() => {
    if (!supabase || members.length === 0) {
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
        .in("user_id", orderedIds)
      if (cancelled) return
      if (e1) {
        setError(e1.message)
        setLoading(false)
        return
      }

      let jobRows: CalendarJobRow[] = []
      if (showNextJobs && orgUserIdsForJobs.length > 0) {
        const nowIso = new Date().toISOString()
        const jobSelect = `
          id,
          user_id,
          title,
          start_at,
          customer_id,
          metadata,
          customers (
            display_name,
            service_address,
            service_lat,
            service_lng
          )
        `
        const jobSelectFallback = `
          id,
          user_id,
          title,
          start_at,
          customer_id,
          metadata,
          customers (
            display_name
          )
        `
        const jrPrimary = await supabase
          .from("calendar_events")
          .select(jobSelect)
          .in("user_id", orgUserIdsForJobs)
          .is("removed_at", null)
          .is("completed_at", null)
          .gte("start_at", nowIso)
          .order("start_at", { ascending: true })
          .limit(120)
        const jr =
          jrPrimary.error && String(jrPrimary.error.message || "").toLowerCase().includes("service_")
            ? await supabase
                .from("calendar_events")
                .select(jobSelectFallback)
                .in("user_id", orgUserIdsForJobs)
                .is("removed_at", null)
                .is("completed_at", null)
                .gte("start_at", nowIso)
                .order("start_at", { ascending: true })
                .limit(120)
            : jrPrimary
        if (!cancelled && !jr.error && jr.data) {
          jobRows = (jr.data as CalendarJobRow[]).map((row) => ({
            ...row,
            customers: normalizeCustomerJoin(row.customers),
          }))
        }
      }

      if (cancelled) return
      if (!mapRef.current) {
        setLoading(false)
        return
      }

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

      const group = L.featureGroup()
      const locRows = (locs ?? []) as LocRow[]

      for (const r of locRows) {
        if (!activeLocationUserIds.includes(r.user_id)) continue
        const n = teamMemberDisplayIndex(r.user_id, orderedIds)
        const { fill, stroke } = teamMarkerColors(n)
        const marker = L.circleMarker([r.lat, r.lng], {
          radius: 11,
          color: stroke,
          fillColor: fill,
          fillOpacity: 0.9,
          weight: 2,
        })
        const when = r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"
        const acc = r.accuracy_m != null ? `${Math.round(r.accuracy_m)} m` : "—"
        const name = labelById.get(r.user_id) ?? r.user_id.slice(0, 8)
        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;font-size:13px"><strong>#${n} ${escapeHtml(name)}</strong> <span style="color:#64748b">(GPS)</span><br/>Updated: ${escapeHtml(when)}<br/>Accuracy: ${escapeHtml(acc)}</div>`,
        )
        marker.addTo(group)
      }

      if (showNextJobs) {
        const byUser = new Map<string, CalendarJobRow>()
        for (const ev of jobRows) {
          const uid = ev.user_id ?? ""
          if (!uid || !orgUserIdsForJobs.includes(uid)) continue
          if (viewUserId !== "all" && uid !== viewUserId) continue
          if (!byUser.has(uid)) byUser.set(uid, ev)
        }
        for (const ev of byUser.values()) {
          const cust = ev.customers
          const coords = resolveJobMapCoords({ eventMetadata: ev.metadata, customer: cust })
          if (!coords) continue
          const n = teamMemberDisplayIndex(ev.user_id ?? "", orderedIds)
          const { fill, stroke } = teamMarkerColors(n > 0 ? n : 0)
          const jm = L.circleMarker([coords.lat, coords.lng], {
            radius: 8,
            color: stroke,
            fillColor: fill,
            fillOpacity: 0.35,
            weight: 2,
            dashArray: "4 3",
          })
          const addr =
            (cust?.service_address && String(cust.service_address).trim()) ||
            (() => {
              const meta = ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata) ? (ev.metadata as Record<string, unknown>) : {}
              return typeof meta.job_site_address === "string" ? meta.job_site_address.trim() : ""
            })()
          const when = ev.start_at ? new Date(ev.start_at).toLocaleString() : "—"
          const assignee = labelById.get(ev.user_id ?? "") ?? "Technician"
          jm.bindPopup(
            `<div style="font-family:system-ui,sans-serif;font-size:13px"><strong>Next job</strong> · #${n} ${escapeHtml(assignee)}<br/>${escapeHtml(ev.title || "Job")}<br/>Starts: ${escapeHtml(when)}${
              addr ? `<br/><span style="color:#475569">${escapeHtml(addr)}</span>` : ""
            }</div>`,
          )
          jm.addTo(group)
        }
      }

      group.addTo(map)
      if (group.getLayers().length === 0) {
        map.setView([39.8283, -98.5795], 4)
      } else {
        map.fitBounds(group.getBounds().pad(0.22))
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [members.length, orderedIds.join(","), orgUserIdsForJobs.join(","), showNextJobs, viewUserId, activeLocationUserIds.join(",")])

  const embedded = variant === "embedded"
  const shellStyle: CSSProperties = embedded
    ? {
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        background: "#fff",
        borderRadius: 10,
        padding: 16,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        border: `1px solid ${theme.border}`,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(760px, 94vw)",
        maxHeight: "90vh",
        overflow: "hidden",
        background: "#fff",
        borderRadius: 10,
        padding: 16,
        zIndex: 10001,
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }

  const inner = (
    <div style={shellStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 17, color: theme.text }}>Team map</h3>
        {!embedded ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13, color: theme.text }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          Show
          <select
            value={viewUserId}
            onChange={(e) => setViewUserId(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, minWidth: 200 }}
          >
            <option value="all">Entire team</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showNextJobs} onChange={(e) => setShowNextJobs(e.target.checked)} />
          Next job pins
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Legend</span>
        {orderedIds.map((uid) => {
          const n = teamMemberDisplayIndex(uid, orderedIds)
          const { fill, stroke } = teamMarkerColors(n)
          return (
            <span
              key={uid}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 999, background: fill, border: `2px solid ${stroke}` }} />
              <strong>#{n}</strong> {labelById.get(uid) ?? uid.slice(0, 6)}
            </span>
          )
        })}
        <span style={{ fontSize: 11, color: "#64748b" }}>Solid = last GPS · dashed = next job (needs lat/lng on customer or job site)</span>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
        Last position from users who enabled GPS under Account → Mobile app. Numbers match the roster order above. Add{" "}
        <strong>service address + coordinates</strong> on customers (Leads / Quotes / Conversations) or <strong>job site</strong> on a
        calendar event so the next job can appear on the map.
      </p>
      {error && <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p>}
      {loading && <p style={{ margin: 0, fontSize: 13, color: theme.text }}>Loading map…</p>}
      <div
        ref={mapRef}
        style={{
          height: embedded ? "min(420px, 55vh)" : "min(52vh, 440px)",
          width: "100%",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
        }}
      />
    </div>
  )

  if (embedded) return inner

  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }} />
      {inner}
    </>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
