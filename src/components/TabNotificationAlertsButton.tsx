import { useEffect, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import type { NotificationTabId, TabNotificationPrefs } from "../types/notificationPreferences"
import { NOTIFICATION_METADATA_KEY } from "../types/notificationPreferences"
import { statusOptionsForTab } from "../constants/tabNotificationStatuses"
import {
  defaultTabNotificationPrefs,
  getPrefsForTab,
  parseTabNotificationsMap,
  setPrefsForTab,
} from "../lib/tabNotificationPrefs"

const BTN: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
  color: theme.text,
  fontWeight: 600,
}

const CALENDAR_ALERT_OPTION_LABEL: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
  cursor: "pointer",
  fontSize: 13,
  color: theme.text,
  fontWeight: 500,
}

type Props = {
  tab: NotificationTabId
  profileUserId: string
}

function ChannelBlock(props: {
  label: string
  channel: "push" | "email" | "sms"
  statuses: readonly string[]
  prefs: TabNotificationPrefs
  setPrefs: (p: TabNotificationPrefs) => void
}) {
  const { label, channel, statuses, prefs, setPrefs } = props
  const ch = prefs[channel]
  const toggleStatus = (st: string) => {
    const has = ch.statuses.includes(st)
    const next = { ...prefs, [channel]: { ...ch, statuses: has ? ch.statuses.filter((x) => x !== st) : [...ch.statuses, st] } }
    setPrefs(next)
  }
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, background: "#fafafa" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: theme.text, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={ch.onStatusChange}
          onChange={(e) =>
            setPrefs({
              ...prefs,
              [channel]: { ...ch, onStatusChange: e.target.checked, statuses: e.target.checked ? ch.statuses : [] },
            })
          }
        />
        {label}
      </label>
      {ch.onStatusChange && (
        <div style={{ marginTop: 10, display: "grid", gap: 6, paddingLeft: 4 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Notify when status becomes:</span>
          {statuses.map((st) => (
            <label key={st} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: theme.text }}>
              <input type="checkbox" checked={ch.statuses.includes(st)} onChange={() => toggleStatus(st)} />
              {st}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TabNotificationAlertsButton({ tab, profileUserId }: Props) {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<TabNotificationPrefs>(() => defaultTabNotificationPrefs())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const statuses = statusOptionsForTab(tab)

  useEffect(() => {
    if (!open || !profileUserId || !supabase) return
    setLoading(true)
    setMsg(null)
    void Promise.resolve(
      supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle(),
    )
      .then(({ data, error }) => {
        if (error) {
          setMsg(error.message)
          return
        }
        const meta = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>
        const map = parseTabNotificationsMap(meta)
        setPrefs(getPrefsForTab(map, tab))
      })
      .finally(() => setLoading(false))
  }, [open, profileUserId, tab])

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
    const meta = { ...((data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>) }
    const prevMap = parseTabNotificationsMap(meta)
    const nextMap = setPrefsForTab(prevMap, tab, prefs)
    meta[NOTIFICATION_METADATA_KEY] = nextMap
    const { error: upErr } = await supabase.from("profiles").update({ metadata: meta }).eq("id", profileUserId)
    setSaving(false)
    if (upErr) setMsg(upErr.message)
    else {
      setMsg("Saved.")
      setTimeout(() => setOpen(false), 600)
    }
  }

  const tabLabel =
    tab === "leads" ? "Leads" : tab === "conversations" ? "Conversations" : tab === "quotes" ? "Quotes" : "Calendar"

  return (
    <>
      <button type="button" style={BTN} onClick={() => setOpen(true)}>
        Alerts
      </button>
      {open && (
        <>
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(520px, 92vw)",
              maxHeight: "88vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 10,
              padding: 20,
              zIndex: 9999,
              boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: theme.text }}>{tabLabel} — notifications</h3>
              <button type="button" onClick={() => setOpen(false)} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>
                ✕
              </button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
              Choose when to receive <strong>mobile push</strong>, <strong>email</strong>, and <strong>SMS</strong> when a {tabLabel.toLowerCase()} record&apos;s status
              changes. Delivery requires backend automation (being wired to these preferences).
            </p>
            {loading ? (
              <p style={{ color: theme.text }}>Loading…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <ChannelBlock label="Send mobile push when job / record status changes" channel="push" statuses={statuses} prefs={prefs} setPrefs={setPrefs} />
                <ChannelBlock label="Send email when job / record status changes" channel="email" statuses={statuses} prefs={prefs} setPrefs={setPrefs} />
                <ChannelBlock label="Send text (SMS) when job / record status changes" channel="sms" statuses={statuses} prefs={prefs} setPrefs={setPrefs} />
                {tab === "calendar" && (
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, background: "#f0f9ff" }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: theme.text }}>Calendar — customer &amp; schedule assists</div>
                    <p style={{ fontSize: 12, color: "#4b5563", margin: "0 0 10px", lineHeight: 1.45 }}>
                      Used when en-route and completion flows are enabled server-side.
                    </p>
                    <label style={CALENDAR_ALERT_OPTION_LABEL}>
                      <input
                        type="checkbox"
                        checked={!!prefs.calendarCustomerEnRouteEmail}
                        onChange={(e) => setPrefs({ ...prefs, calendarCustomerEnRouteEmail: e.target.checked })}
                      />
                      Email customer when we are en route
                    </label>
                    <label style={CALENDAR_ALERT_OPTION_LABEL}>
                      <input
                        type="checkbox"
                        checked={!!prefs.calendarCustomerEnRouteSms}
                        onChange={(e) => setPrefs({ ...prefs, calendarCustomerEnRouteSms: e.target.checked })}
                      />
                      Text customer when we are en route
                    </label>
                    <label style={CALENDAR_ALERT_OPTION_LABEL}>
                      <input
                        type="checkbox"
                        checked={!!prefs.calendarJobEndReminder}
                        onChange={(e) => setPrefs({ ...prefs, calendarJobEndReminder: e.target.checked })}
                      />
                      Remind me before a job is scheduled to end (complete on calendar)
                    </label>
                    <label style={{ ...CALENDAR_ALERT_OPTION_LABEL, marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={!!prefs.calendarNextJobReminder}
                        onChange={(e) => setPrefs({ ...prefs, calendarNextJobReminder: e.target.checked })}
                      />
                      Notify me when the next scheduled job is coming up
                    </label>
                  </div>
                )}
              </div>
            )}
            {msg && <p style={{ marginTop: 12, fontSize: 13, color: msg === "Saved." ? "#059669" : "#b91c1c" }}>{msg}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" style={{ ...BTN, background: "#f3f4f6" }} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" style={{ ...BTN, background: theme.primary, color: "#fff", borderColor: theme.primary }} disabled={saving || loading} onClick={() => void save()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
