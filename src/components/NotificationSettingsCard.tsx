import { useEffect, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  CALENDAR_UPCOMING_LEAD_OPTIONS,
  NOTIFICATION_TRIGGER_IDS,
  NOTIFICATION_TRIGGER_LABELS,
  defaultNotificationPrefs,
  mergeNotificationPrefs,
  parseNotificationPrefs,
  type NotificationDelivery,
  type NotificationPrefsV1,
  type NotificationTriggerId,
} from "../lib/notificationPrefs"

type Props = {
  profileUserId: string
  hideTitle?: boolean
}

const ROW: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 74px 74px",
  alignItems: "center",
  gap: 8,
  padding: "8px 0",
  borderTop: `1px solid ${theme.border}`,
}

const COL_HEAD: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textAlign: "center",
  textTransform: "uppercase",
  letterSpacing: 0.3,
}

const CHECK_CELL: CSSProperties = { display: "flex", justifyContent: "center" }

const SMALL_BTN: CSSProperties = {
  width: "fit-content",
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 6,
  border: "none",
  background: theme.primary,
  color: "#fff",
  cursor: "pointer",
}

export default function NotificationSettingsCard({ profileUserId, hideTitle }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefsV1>(() => defaultNotificationPrefs())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!profileUserId || !supabase) return
    setLoading(true)
    void Promise.resolve(supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle())
      .then(({ data }) => {
        setPrefs(parseNotificationPrefs(data?.metadata))
      })
      .finally(() => setLoading(false))
  }, [profileUserId])

  function setDelivery(id: NotificationTriggerId, patch: Partial<NotificationDelivery>) {
    setPrefs((p) => ({ ...p, triggers: { ...p.triggers, [id]: { ...p.triggers[id], ...patch } } }))
    setMsg(null)
  }

  async function save() {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMsg(null)
    const { data, error } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    if (error) {
      setMsg(error.message)
      setSaving(false)
      return
    }
    const meta = mergeNotificationPrefs(data?.metadata, prefs)
    const { error: up } = await supabase.from("profiles").update({ metadata: meta }).eq("id", profileUserId)
    setSaving(false)
    setMsg(up ? up.message : "Saved.")
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!hideTitle ? <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>Notifications</h2> : null}
      {loading ? (
        <span style={{ color: theme.text }}>Loading…</span>
      ) : (
        <>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "4px 14px 10px", background: "#fff" }}>
            <div style={{ ...ROW, borderTop: "none", paddingBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Send a notification…</span>
              <span style={COL_HEAD}>Mobile app</span>
              <span style={COL_HEAD}>Desktop</span>
            </div>
            {NOTIFICATION_TRIGGER_IDS.map((id) => (
              <div key={id} style={ROW}>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: theme.text }}>{NOTIFICATION_TRIGGER_LABELS[id]}</span>
                  {id === "calendar_upcoming" && (prefs.triggers[id].mobile || prefs.triggers[id].desktop) ? (
                    <select
                      value={prefs.calendarUpcomingLeadMinutes}
                      onChange={(e) => {
                        setPrefs((p) => ({ ...p, calendarUpcomingLeadMinutes: Number(e.target.value) }))
                        setMsg(null)
                      }}
                      style={{ ...theme.formInput, width: 190, margin: 0, fontSize: 12, padding: "4px 8px" }}
                    >
                      {CALENDAR_UPCOMING_LEAD_OPTIONS.map((o) => (
                        <option key={o.minutes} value={o.minutes}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <label style={CHECK_CELL}>
                  <input
                    type="checkbox"
                    checked={prefs.triggers[id].mobile}
                    onChange={(e) => setDelivery(id, { mobile: e.target.checked })}
                  />
                </label>
                <label style={CHECK_CELL}>
                  <input
                    type="checkbox"
                    checked={prefs.triggers[id].desktop}
                    onChange={(e) => setDelivery(id, { desktop: e.target.checked })}
                  />
                </label>
              </div>
            ))}
          </div>

          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, background: "#f0f9ff", display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Customer notifications</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={prefs.customer.enRouteText}
                onChange={(e) => {
                  setPrefs((p) => ({ ...p, customer: { ...p.customer, enRouteText: e.target.checked } }))
                  setMsg(null)
                }}
              />
              Text customer when en route
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={prefs.customer.enRouteEmail}
                onChange={(e) => {
                  setPrefs((p) => ({ ...p, customer: { ...p.customer, enRouteEmail: e.target.checked } }))
                  setMsg(null)
                }}
              />
              Email customer when en route
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" disabled={saving} onClick={() => void save()} style={{ ...SMALL_BTN, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save notification settings"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg === "Saved." ? "#059669" : "#b91c1c" }}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  )
}
