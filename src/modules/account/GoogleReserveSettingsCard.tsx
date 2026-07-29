/**
 * My T — Google Reserve / Actions Center booking calendar settings + setup guide.
 * Full Reserve partner API integration is phased; this captures which calendar to share
 * (typically Office Manager) and documents the ops steps for early clients.
 */
import { useEffect, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import {
  EMPTY_GOOGLE_RESERVE_SETTINGS,
  mergeGoogleReserveSettings,
  parseGoogleReserveSettings,
  type GoogleReserveSettings,
} from "../../lib/googleReserve"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"

const SETUP_README = `Google Reserve (Reserve with Google) — setup for Tradesman clients
================================================================

What it is
----------
Google Reserve lets customers book appointments from Google Search / Maps
(Business Profile). Google needs a feed of available slots from a calendar
you control, plus merchant / service metadata.

How Tradesman will use it
-------------------------
1. Pick ONE booking calendar in My T (usually the Office Manager calendar —
   not every tech's personal calendar).
2. That calendar's free/busy (or explicit open slots) is what Google shows.
3. When a customer books, create a Tradesman calendar event + lead/conversation
   so the office can confirm and assign a tech.

Phases
------
Phase A (now — ops / hand-hold):
  - Enable this setting and name the calendar owner.
  - Claim / verify Google Business Profile.
  - Apply to Reserve with Google / Actions Center (partner or sandbox).
  - Manually keep availability accurate on the shared calendar.

Phase B (product):
  - OAuth or service account sync from the chosen Tradesman calendar.
  - Real-time inventory feed + booking webhook → Tradesman event.

What to tell the client
-----------------------
- Bookings land on the Office Manager (or named) calendar first.
- Techs are assigned after confirmation — Reserve is the front door,
  Tradesman is the shop floor.

Links
-----
- Google Business Profile: https://business.google.com/
- Reserve with Google overview: https://developers.google.com/actions-center
`

type Props = {
  profileUserId: string
  canEdit: boolean
}

export default function GoogleReserveSettingsCard({ profileUserId, canEdit }: Props) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<GoogleReserveSettings>(EMPTY_GOOGLE_RESERVE_SETTINGS)
  const [team, setTeam] = useState<{ id: string; label: string }[]>([])
  const [showReadme, setShowReadme] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!supabase || !profileUserId) return
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      setSettings(parseGoogleReserveSettings(data?.metadata))
    })()
  }, [profileUserId])

  useEffect(() => {
    if (!supabase || !profileUserId) return
    void (async () => {
      // Best-effort: same-org peers via profiles sharing org — fall back to self only.
      const { data: self } = await supabase
        .from("profiles")
        .select("id, display_name, role, metadata")
        .eq("id", profileUserId)
        .maybeSingle()
      const rows: { id: string; label: string }[] = []
      if (self) {
        rows.push({
          id: self.id,
          label: `${self.display_name || "You"}${self.role ? ` (${String(self.role).replace(/_/g, " ")})` : ""}`,
        })
      }
      const orgKey =
        self?.metadata && typeof self.metadata === "object" && !Array.isArray(self.metadata)
          ? String((self.metadata as Record<string, unknown>).org_group_key ?? "").trim()
          : ""
      if (orgKey) {
        const { data: peers } = await supabase
          .from("profiles")
          .select("id, display_name, role, metadata")
          .neq("id", profileUserId)
          .limit(80)
        for (const p of peers ?? []) {
          const m =
            p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
              ? (p.metadata as Record<string, unknown>)
              : {}
          if (String(m.org_group_key ?? "").trim() !== orgKey) continue
          rows.push({
            id: p.id,
            label: `${p.display_name || "Teammate"}${p.role ? ` (${String(p.role).replace(/_/g, " ")})` : ""}`,
          })
        }
      }
      setTeam(rows)
    })()
  }, [profileUserId])

  async function save() {
    if (!supabase || !canEdit) return
    setSaving(true)
    setMsg("")
    setErr("")
    try {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      const latest = parseGoogleReserveSettings(data?.metadata)
      const nextSettings: GoogleReserveSettings = {
        ...latest,
        enabled: settings.enabled,
        calendarOwnerUserId: settings.calendarOwnerUserId,
        calendarLabel: settings.calendarLabel,
        gbpPlaceId: settings.gbpPlaceId,
        notes: settings.notes,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id ?? profileUserId,
      }
      const metadata = mergeGoogleReserveSettings(data?.metadata, nextSettings)
      const { error } = await supabase.from("profiles").update({ metadata }).eq("id", profileUserId)
      if (error) throw error
      setSettings(nextSettings)
      setMsg("Google Reserve settings saved.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
        Choose which Tradesman calendar Google Reserve should use for booking availability. Prefer a shared{" "}
        <strong>Office Manager</strong> calendar so tech schedules stay flexible.
      </p>
      <p style={{ margin: 0, padding: 10, borderRadius: 8, background: "#eff6ff", color: "#1e3a8a", fontSize: 12, lineHeight: 1.45 }}>
        Reserve setup is separate from granting Tradesman access to manage your Google Business Profile. Each booking
        calendar maps to one Business Profile location / Place ID. Tradesman admin manages partner and feed setup.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: theme.text }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={!canEdit}
          onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
        />
        Enable Google Reserve for this account
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Booking calendar owner</span>
        <select
          value={settings.calendarOwnerUserId}
          disabled={!canEdit}
          onChange={(e) => setSettings((s) => ({ ...s, calendarOwnerUserId: e.target.value }))}
          style={theme.formInput}
        >
          <option value="">Select…</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Calendar label (internal)</span>
        <input
          value={settings.calendarLabel}
          disabled={!canEdit}
          onChange={(e) => setSettings((s) => ({ ...s, calendarLabel: e.target.value }))}
          style={theme.formInput}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Google Place ID (optional)</span>
        <input
          value={settings.gbpPlaceId}
          disabled={!canEdit}
          onChange={(e) => setSettings((s) => ({ ...s, gbpPlaceId: e.target.value }))}
          placeholder="ChIJ…"
          style={theme.formInput}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Ops notes</span>
        <textarea
          value={settings.notes}
          disabled={!canEdit}
          onChange={(e) => setSettings((s) => ({ ...s, notes: e.target.value }))}
          rows={3}
          placeholder="e.g. Reserve sandbox approved; sync Mon–Fri 8–5 only"
          style={{ ...theme.formInput, resize: "vertical" }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{ border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowReadme((v) => !v)}
          style={{ border: `1px solid ${theme.border}`, background: "#fff", color: theme.text, borderRadius: 8, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
        >
          {showReadme ? "Hide setup README" : "Setup README"}
        </button>
      </div>

      {msg ? <p style={{ margin: 0, fontSize: 13, color: "#059669", fontWeight: 700 }}>{msg}</p> : null}
      {err ? <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>{err}</p> : null}

      {showReadme ? (
        <pre
          style={{
            margin: 0,
            padding: 14,
            borderRadius: 10,
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            overflow: "auto",
            maxHeight: 360,
          }}
        >
          {SETUP_README}
        </pre>
      ) : null}
    </div>
  )
}
