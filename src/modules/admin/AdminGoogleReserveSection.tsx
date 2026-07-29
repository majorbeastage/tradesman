import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import {
  EMPTY_GOOGLE_RESERVE_SETTINGS,
  GOOGLE_RESERVE_FEED_STATUS_OPTIONS,
  mergeGoogleReserveSettings,
  parseGoogleReserveSettings,
  type GoogleReserveFeedStatus,
  type GoogleReserveSettings,
} from "../../lib/googleReserve"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"

type ProfileRow = {
  id: string
  display_name: string | null
  email: string | null
  role: string | null
  client_id: string | null
  account_disabled: boolean | null
  metadata: unknown
}

type AssignmentRow = {
  user_id: string
  office_manager_id: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function profileLabel(profile: ProfileRow): string {
  const name = profile.display_name?.trim() || profile.email?.trim() || "Unnamed profile"
  const role = profile.role ? ` (${profile.role.replace(/_/g, " ")})` : ""
  const email = profile.email && profile.email !== name ? ` · ${profile.email}` : ""
  return `${name}${role}${email}`
}

function orgGroupKey(profile: ProfileRow): string {
  return String(record(profile.metadata).org_group_key ?? "").trim()
}

function toDateTimeLocal(iso: string): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

export default function AdminGoogleReserveSection() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [settings, setSettings] = useState<GoogleReserveSettings>(EMPTY_GOOGLE_RESERVE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  )

  const clientProfiles = useMemo(
    () => profiles.filter((profile) => profile.account_disabled !== true && profile.role !== "admin"),
    [profiles],
  )

  const calendarOwners = useMemo(() => {
    if (!selectedProfile) return []
    const selectedClientId = selectedProfile.client_id?.trim() || ""
    const selectedOrgKey = orgGroupKey(selectedProfile)
    const relatedIds = new Set<string>([selectedProfile.id])
    for (const assignment of assignments) {
      if (assignment.user_id === selectedProfile.id) relatedIds.add(assignment.office_manager_id)
      if (assignment.office_manager_id === selectedProfile.id) relatedIds.add(assignment.user_id)
    }
    return profiles
      .filter((profile) => {
        if (relatedIds.has(profile.id)) return true
        if (selectedClientId && profile.client_id === selectedClientId) return true
        return Boolean(selectedOrgKey && orgGroupKey(profile) === selectedOrgKey)
      })
      .sort((a, b) => profileLabel(a).localeCompare(profileLabel(b)))
  }, [assignments, profiles, selectedProfile])

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.")
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const [{ data: profileData, error: profileError }, { data: authRows }, { data: assignmentData }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, display_name, email, role, client_id, account_disabled, metadata")
            .order("display_name", { ascending: true }),
          supabase.from("admin_users_list").select("id, email"),
          supabase.from("office_manager_clients").select("user_id, office_manager_id"),
        ])
      if (profileError) throw profileError
      const emailById = new Map(
        (authRows ?? []).map((row: { id: string; email?: string | null }) => [row.id, row.email ?? null]),
      )
      const rows = ((profileData ?? []) as ProfileRow[]).map((profile) => ({
        ...profile,
        email: profile.email ?? emailById.get(profile.id) ?? null,
      }))
      setProfiles(rows)
      setAssignments((assignmentData ?? []) as AssignmentRow[])
      setSelectedId((current) => {
        if (current && rows.some((profile) => profile.id === current)) return current
        return rows.find((profile) => profile.account_disabled !== true && profile.role !== "admin")?.id ?? ""
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Google Reserve clients.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedProfile) {
      setSettings(EMPTY_GOOGLE_RESERVE_SETTINGS)
      return
    }
    setSettings(parseGoogleReserveSettings(selectedProfile.metadata))
    setMessage("")
    setError("")
  }, [selectedProfile])

  async function save() {
    if (!supabase || !selectedProfile) return
    if (settings.enabled && !settings.calendarOwnerUserId) {
      setError("Select the booking calendar owner before enabling Google Reserve.")
      return
    }
    if (settings.enabled && !settings.gbpPlaceId.trim()) {
      setError("Enter the GBP Place ID. Phase A uses one Place ID for each enabled booking calendar.")
      return
    }
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const { data, error: readError } = await supabase
        .from("profiles")
        .select("metadata")
        .eq("id", selectedProfile.id)
        .maybeSingle()
      if (readError) throw readError
      const nextSettings: GoogleReserveSettings = {
        ...settings,
        calendarLabel: settings.calendarLabel.trim(),
        gbpPlaceId: settings.gbpPlaceId.trim(),
        partnerMerchantId: settings.partnerMerchantId.trim(),
        notes: settings.notes.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id ?? "",
      }
      const metadata = mergeGoogleReserveSettings(data?.metadata, nextSettings)
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ metadata })
        .eq("id", selectedProfile.id)
      if (updateError) throw updateError
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === selectedProfile.id ? { ...profile, metadata } : profile,
        ),
      )
      setSettings(nextSettings)
      setMessage("Google Reserve merchant setup saved in the client profile metadata.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save Google Reserve setup.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p style={{ color: "#64748b" }}>Loading Google Reserve clients…</p>

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 980 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: theme.text }}>Google Reserve merchant setup</h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "#64748b" }}>
          Phase A stores operational setup in <code>profiles.metadata.google_reserve</code>. It does not call Google,
          publish feeds, or receive bookings.
        </p>
      </div>

      <div style={{ ...noticeStyle, background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }}>
        <strong>Partner approval is required.</strong> Tradesman must be accepted as a Google Actions Center partner
        before merchant, service, or availability feeds can work. Selecting “enabled” here only records readiness; it
        does not activate Reserve with Google.
      </div>

      <div style={{ ...noticeStyle, background: "#eff6ff", borderColor: "#93c5fd", color: "#1e3a8a" }}>
        <strong>Keep access separate.</strong> Google Business Profile Manager access controls who can edit the
        listing. Actions Center partner/feed access controls Reserve inventory and bookings. This panel records Place
        ID and partner setup only—it does not grant or verify Business Profile Manager access.
      </div>

      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
      {message ? <p style={{ margin: 0, color: "#047857", fontSize: 13, fontWeight: 700 }}>{message}</p> : null}

      <label style={fieldStyle}>
        <span style={labelStyle}>Client account</span>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={theme.formInput}>
          <option value="">Select a client…</option>
          {clientProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profileLabel(profile)}
            </option>
          ))}
        </select>
      </label>

      {selectedProfile ? (
        <div style={{ display: "grid", gap: 14, padding: 16, border: `1px solid ${theme.border}`, borderRadius: 12, background: "#fff" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            />
            Enabled for this client (configuration flag only)
          </label>

          <div style={{ ...noticeStyle, padding: 10, background: "#f8fafc", borderColor: theme.border, color: "#475569" }}>
            <strong>One calendar → one GBP location.</strong> The selected Tradesman calendar supplies availability
            for exactly one Google Business Profile Place ID. Use a separate merchant/calendar configuration for
            another location.
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Booking calendar owner</span>
            <select
              value={settings.calendarOwnerUserId}
              onChange={(event) =>
                setSettings((current) => ({ ...current, calendarOwnerUserId: event.target.value }))
              }
              style={theme.formInput}
            >
              <option value="">Select account or teammate…</option>
              {calendarOwners.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileLabel(profile)}
                </option>
              ))}
            </select>
            <span style={helpStyle}>Uses existing client, office-manager assignment, and organization metadata.</span>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Calendar label (internal)</span>
            <input
              value={settings.calendarLabel}
              onChange={(event) => setSettings((current) => ({ ...current, calendarLabel: event.target.value }))}
              style={theme.formInput}
            />
          </label>

          <div style={twoColumnStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>GBP Place ID</span>
              <input
                value={settings.gbpPlaceId}
                onChange={(event) => setSettings((current) => ({ ...current, gbpPlaceId: event.target.value }))}
                placeholder="ChIJ…"
                style={theme.formInput}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Partner merchant ID</span>
              <input
                value={settings.partnerMerchantId}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, partnerMerchantId: event.target.value }))
                }
                placeholder="Assigned for future Actions Center feeds"
                style={theme.formInput}
              />
            </label>
          </div>

          <div style={twoColumnStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Feed status (manual Phase A tracking)</span>
              <select
                value={settings.feedStatus}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    feedStatus: event.target.value as GoogleReserveFeedStatus,
                  }))
                }
                style={theme.formInput}
              >
                {GOOGLE_RESERVE_FEED_STATUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Last successful feed sync (manual)</span>
              <input
                type="datetime-local"
                value={toDateTimeLocal(settings.lastSyncAt)}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    lastSyncAt: fromDateTimeLocal(event.target.value),
                  }))
                }
                style={theme.formInput}
              />
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Partner / feed notes</span>
            <textarea
              value={settings.notes}
              onChange={(event) => setSettings((current) => ({ ...current, notes: event.target.value }))}
              rows={5}
              placeholder="Approval case, sandbox state, merchant validation issues, operating hours, handoff notes…"
              style={{ ...theme.formInput, resize: "vertical" }}
            />
          </label>

          {settings.updatedAt ? (
            <p style={helpStyle}>
              Last metadata update: {new Date(settings.updatedAt).toLocaleString()}
              {settings.updatedBy ? ` · by ${settings.updatedBy}` : ""}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void save()} disabled={busy} style={primaryButtonStyle}>
              {busy ? "Saving…" : "Save merchant setup"}
            </button>
            <button type="button" onClick={() => void load()} disabled={busy} style={secondaryButtonStyle}>
              Refresh
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const fieldStyle: CSSProperties = { display: "grid", gap: 5 }
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: theme.text }
const helpStyle: CSSProperties = { margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }
const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
}
const noticeStyle: CSSProperties = {
  padding: 12,
  border: "1px solid",
  borderRadius: 10,
  fontSize: 13,
  lineHeight: 1.5,
}
const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: theme.primary,
  color: "#fff",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
}
const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
}
