import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"

type ProfileOption = { id: string; display_name: string | null; email?: string | null }

type Props = {
  profiles: ProfileOption[]
  /** Default user id when opening (e.g. portal config target) */
  defaultUserId: string | null
}

/**
 * Admin: edit per-user calendar ribbon color and auto-assign (user_calendar_preferences).
 * Same data the office manager "Customize user" modal uses on the Calendar tab.
 */
export default function CalendarUserPreferencesEditor({ profiles, defaultUserId }: Props) {
  const realProfiles = profiles.filter((p) => p.id)
  const [targetUserId, setTargetUserId] = useState<string>("")
  const [ribbonColor, setRibbonColor] = useState("#0ea5e9")
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const first = defaultUserId && realProfiles.some((p) => p.id === defaultUserId) ? defaultUserId : realProfiles[0]?.id ?? ""
    setTargetUserId((prev) => (prev && realProfiles.some((p) => p.id === prev) ? prev : first))
  }, [defaultUserId, profiles])

  useEffect(() => {
    if (!targetUserId || !supabase) return
    setLoading(true)
    setMessage("")
    void supabase
      .from("user_calendar_preferences")
      .select("ribbon_color, auto_assign_enabled")
      .eq("owner_user_id", targetUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          setMessage(error.message)
          return
        }
        const row = data as { ribbon_color?: string | null; auto_assign_enabled?: boolean | null } | null
        setRibbonColor(row?.ribbon_color?.trim() || "#0ea5e9")
        setAutoAssignEnabled(row?.auto_assign_enabled !== false)
      })
  }, [targetUserId])

  async function save() {
    if (!targetUserId || !supabase) return
    setSaving(true)
    setMessage("")
    const payload = {
      owner_user_id: targetUserId,
      ribbon_color: ribbonColor,
      auto_assign_enabled: autoAssignEnabled,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from("user_calendar_preferences").upsert(payload, { onConflict: "owner_user_id" })
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage("Saved calendar preferences for this user.")
  }

  if (realProfiles.length === 0) {
    return <p style={{ fontSize: 13, color: theme.text }}>No profiles loaded. Create users first.</p>
  }

  return (
    <div style={{ fontSize: 13, color: theme.text }}>
      <p style={{ margin: "0 0 12px", fontSize: 12, opacity: 0.85, lineHeight: 1.45 }}>
        These settings apply to the selected user&apos;s calendar in the app (ribbon color on events, default for assigning new items). Office managers can still change them from the Calendar tab when managing that user.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>User</span>
        <select
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13, maxWidth: 360 }}
        >
          {realProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name?.trim() || p.email || `${p.id.slice(0, 8)}…`}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>Ribbon color</span>
        <input type="color" value={ribbonColor} onChange={(e) => setRibbonColor(e.target.value)} disabled={loading} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>{ribbonColor}</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input type="checkbox" checked={autoAssignEnabled} onChange={(e) => setAutoAssignEnabled(e.target.checked)} disabled={loading} />
        <span>Auto-assign new calendar items to selected user (when adding from office manager)</span>
      </label>
      <button
        type="button"
        disabled={saving || loading || !targetUserId}
        onClick={() => void save()}
        style={{
          padding: "8px 16px",
          background: theme.primary,
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: saving ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        {saving ? "Saving…" : "Save calendar preferences"}
      </button>
      {message && (
        <p style={{ marginTop: 10, fontSize: 12, color: message.startsWith("Saved") ? "#059669" : "#b91c1c" }}>{message}</p>
      )}
    </div>
  )
}
