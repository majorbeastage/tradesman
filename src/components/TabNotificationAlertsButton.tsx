import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
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
import type { SetupMiniWizardId } from "../lib/setupGuideWizards"
import SetupWizardLaunchButton from "./SetupWizardLaunchButton"
import { useAuth } from "../contexts/AuthContext"
import {
  loadAlertEditableTeamMembers,
  resolveWorkflowMetadataUserId,
  type AlertTeamMember,
} from "../lib/alertTeamMembers"
import { sanitizeTabNotificationPrefsForStatuses } from "../lib/workflowAlertStatuses"
import { PROFILE_METADATA_APPLIED_EVENT, type ProfileMetadataAppliedDetail } from "../lib/profileMetadataEvents"

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
  guideWizardId?: SetupMiniWizardId
}

function ChannelBlock(props: {
  label: string
  channel: "push" | "email" | "sms"
  statuses: readonly string[]
  prefs: TabNotificationPrefs
  setPrefs: (p: TabNotificationPrefs) => void
  statusLabel?: string
}) {
  const { label, channel, statuses, prefs, setPrefs, statusLabel = "status" } = props
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
          <span style={{ fontSize: 12, color: "#6b7280" }}>Notify when {statusLabel} becomes:</span>
          {statuses.length === 0 ? (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>No workflow steps configured yet. Add steps in Business workflow.</span>
          ) : (
            statuses.map((st) => (
              <label key={st} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: theme.text }}>
                <input type="checkbox" checked={ch.statuses.includes(st)} onChange={() => toggleStatus(st)} />
                {st}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function TabNotificationAlertsButton({ tab, profileUserId, guideWizardId }: Props) {
  const { user, role: authRole } = useAuth()
  const authUserId = user?.id ?? null

  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<TabNotificationPrefs>(() => defaultTabNotificationPrefs())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [urgencyEscalationEnabled, setUrgencyEscalationEnabled] = useState(false)
  const [urgencyEscalationUnit, setUrgencyEscalationUnit] = useState<"hours" | "days">("days")
  const [urgencyEscalationAmount, setUrgencyEscalationAmount] = useState("")
  const [workflowMetadata, setWorkflowMetadata] = useState<Record<string, unknown> | null>(null)
  const [teamMembers, setTeamMembers] = useState<AlertTeamMember[]>([])
  const [selectedAlertUserId, setSelectedAlertUserId] = useState(profileUserId)

  const showTeamPicker = (tab === "customers" || tab === "calendar") && teamMembers.length > 1

  const statuses = useMemo(
    () => statusOptionsForTab(tab, tab === "customers" ? { workflowMetadata } : undefined),
    [tab, workflowMetadata],
  )

  /** Stable loader — pass workflow meta in; do not close over workflowMetadata state (that caused a load loop / Loading flash). */
  const loadPrefsForUser = useCallback(async (targetUserId: string, workflowMeta: Record<string, unknown> | null) => {
    if (!supabase || !targetUserId) return
    const { data, error } = await supabase.from("profiles").select("metadata").eq("id", targetUserId).maybeSingle()
    if (error) throw error
    const meta = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>
    const map = parseTabNotificationsMap(meta)
    let nextPrefs = getPrefsForTab(map, tab)
    if (tab === "customers") {
      const valid = statusOptionsForTab("customers", { workflowMetadata: workflowMeta })
      nextPrefs = sanitizeTabNotificationPrefsForStatuses(nextPrefs, valid)
    }
    setPrefs(nextPrefs)
    if (tab === "customers") {
      const ua = meta.customers_urgency_automation
      if (ua && typeof ua === "object" && !Array.isArray(ua)) {
        const o = ua as Record<string, unknown>
        setUrgencyEscalationEnabled(o.enabled === true)
        setUrgencyEscalationUnit(o.unit === "hours" ? "hours" : "days")
        const amt = typeof o.amount === "number" ? o.amount : Number.parseFloat(String(o.amount ?? ""))
        setUrgencyEscalationAmount(Number.isFinite(amt) && amt > 0 ? String(amt) : "")
      } else {
        setUrgencyEscalationEnabled(false)
        setUrgencyEscalationUnit("days")
        setUrgencyEscalationAmount("")
      }
    }
  }, [tab])

  const handleTeamUserChange = useCallback(
    (nextUserId: string) => {
      setSelectedAlertUserId(nextUserId)
      setLoading(true)
      setMsg(null)
      void loadPrefsForUser(nextUserId, workflowMetadata)
        .catch((e) => setMsg(e instanceof Error ? e.message : "Could not load team member alerts."))
        .finally(() => setLoading(false))
    },
    [loadPrefsForUser, workflowMetadata],
  )

  useEffect(() => {
    if (!open || !authUserId || !supabase) return
    let cancelled = false
    setLoading(true)
    setMsg(null)
    setSelectedAlertUserId(profileUserId)
    void (async () => {
      try {
        let workflowMeta: Record<string, unknown> | null = null
        if (tab === "customers") {
          const ownerId = await resolveWorkflowMetadataUserId(supabase, authUserId)
          if (cancelled) return
          const { data: ownerData, error: ownerErr } = await supabase
            .from("profiles")
            .select("metadata")
            .eq("id", ownerId)
            .maybeSingle()
          if (ownerErr) throw ownerErr
          workflowMeta =
            ownerData?.metadata && typeof ownerData.metadata === "object" && !Array.isArray(ownerData.metadata)
              ? (ownerData.metadata as Record<string, unknown>)
              : {}
          if (!cancelled) setWorkflowMetadata(workflowMeta)
        }
        const members = await loadAlertEditableTeamMembers(supabase, authUserId, authRole)
        if (cancelled) return
        setTeamMembers(members)
        const allowed = new Set(members.map((m) => m.userId))
        const target = allowed.has(profileUserId) ? profileUserId : authUserId
        setSelectedAlertUserId(target)
        await loadPrefsForUser(target, workflowMeta)
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Could not load alert settings.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, authUserId, authRole, profileUserId, tab, loadPrefsForUser])

  useEffect(() => {
    if (!open || tab !== "customers" || !workflowMetadata) return
    setPrefs((prev) => sanitizeTabNotificationPrefsForStatuses(prev, statuses))
  }, [open, tab, statuses, workflowMetadata])

  useEffect(() => {
    if (!open || !authUserId) return
    const onMeta = (ev: Event) => {
      const detail = (ev as CustomEvent<ProfileMetadataAppliedDetail>).detail
      if (!detail) return
      void resolveWorkflowMetadataUserId(supabase!, authUserId).then((ownerId) => {
        if (detail.userId !== ownerId) return
        setWorkflowMetadata(detail.metadata)
      })
    }
    window.addEventListener(PROFILE_METADATA_APPLIED_EVENT, onMeta)
    return () => window.removeEventListener(PROFILE_METADATA_APPLIED_EVENT, onMeta)
  }, [open, authUserId])

  async function save() {
    if (!supabase || !selectedAlertUserId || !authUserId) return
    const allowed = new Set(teamMembers.map((m) => m.userId))
    if (!allowed.has(selectedAlertUserId)) {
      setMsg("You can only save alerts for yourself or team members who report to you.")
      return
    }

    setSaving(true)
    setMsg(null)
    const { data, error } = await supabase.from("profiles").select("metadata").eq("id", selectedAlertUserId).maybeSingle()
    if (error) {
      setMsg(error.message)
      setSaving(false)
      return
    }
    const meta = { ...((data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>) }
    const prevMap = parseTabNotificationsMap(meta)
    let nextPrefs = prefs
    if (tab === "customers") {
      nextPrefs = sanitizeTabNotificationPrefsForStatuses(prefs, statuses)
    }
    const nextMap = setPrefsForTab(prevMap, tab, nextPrefs)
    meta[NOTIFICATION_METADATA_KEY] = nextMap
    if (tab === "customers") {
      const amtN = Number.parseFloat(String(urgencyEscalationAmount).replace(/[^0-9.]/g, ""))
      meta.customers_urgency_automation = {
        v: 1,
        enabled: urgencyEscalationEnabled,
        unit: urgencyEscalationUnit,
        amount: Number.isFinite(amtN) && amtN > 0 ? amtN : 0,
      }
    }
    const { error: upErr } = await supabase.from("profiles").update({ metadata: meta }).eq("id", selectedAlertUserId)
    setSaving(false)
    if (upErr) setMsg(upErr.message)
    else {
      setMsg("Saved.")
      setTimeout(() => setOpen(false), 600)
    }
  }

  const tabLabel =
    tab === "leads"
      ? "Leads"
      : tab === "conversations"
        ? "Conversations"
        : tab === "quotes"
          ? "Quotes"
          : tab === "customers"
            ? "Customers"
            : "Calendar"

  const statusHint =
    tab === "customers"
      ? "workflow step"
      : tab === "calendar"
        ? "calendar event status"
        : "status"

  const selectedMemberLabel = teamMembers.find((m) => m.userId === selectedAlertUserId)?.label ?? "Team member"

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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {guideWizardId ? <SetupWizardLaunchButton wizardId={guideWizardId} compact /> : null}
                <button type="button" onClick={() => setOpen(false)} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            </div>

            {showTeamPicker ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#4b5563", fontWeight: 700 }}>
                  Alerts for
                  <select
                    value={selectedAlertUserId}
                    onChange={(e) => handleTeamUserChange(e.target.value)}
                    style={{ ...theme.formInput, margin: 0 }}
                  >
                    {teamMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.isSelf ? `${m.label} (you)` : m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedAlertUserId !== authUserId ? (
                  <p style={{ margin: "8px 0 0", fontSize: 11, color: "#6b7280", lineHeight: 1.45 }}>
                    Editing notification settings for <strong>{selectedMemberLabel}</strong>. Changes are saved to their profile.
                  </p>
                ) : null}
              </div>
            ) : null}

            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
              Choose when to receive <strong>mobile push</strong>, <strong>email</strong>, and <strong>SMS</strong> when a {tabLabel.toLowerCase()}{" "}
              {tab === "customers" ? " job reaches a workflow step" : " record's status changes"}.
              {tab === "customers" ? (
                <>
                  {" "}
                  Workflow step names come from your Business workflow chart and update automatically when you rename steps.
                </>
              ) : null}{" "}
              Calendar and quotes use the Tradesman backend (Edge Functions) when you save; push also needs <strong>Allow push</strong> on Account → Mobile app (MyT) and permission on the device.
            </p>
            {loading ? (
              <p style={{ color: theme.text }}>Loading…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <ChannelBlock
                  label="Send mobile push when job / record status changes"
                  channel="push"
                  statuses={statuses}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  statusLabel={statusHint}
                />
                <ChannelBlock
                  label="Send email when job / record status changes"
                  channel="email"
                  statuses={statuses}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  statusLabel={statusHint}
                />
                <ChannelBlock
                  label="Send text (SMS) when job / record status changes"
                  channel="sms"
                  statuses={statuses}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  statusLabel={statusHint}
                />
                {tab === "customers" && (
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, background: "#fffbeb" }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: theme.text }}>Customers — urgency automation</div>
                    <p style={{ fontSize: 12, color: "#4b5563", margin: "0 0 10px", lineHeight: 1.45 }}>
                      When enabled, the Customers list periodically raises workflow urgency one step (In Process → Needs Attention → Critical) if there has been no
                      communication activity for the time you set. <strong>Complete</strong> and <strong>Lost</strong> are not changed. Uses each row&apos;s last update time.
                    </p>
                    <label style={{ ...CALENDAR_ALERT_OPTION_LABEL, marginBottom: 10 }}>
                      <input
                        type="checkbox"
                        checked={urgencyEscalationEnabled}
                        onChange={(e) => setUrgencyEscalationEnabled(e.target.checked)}
                      />
                      Auto-raise urgency after no communication for…
                    </label>
                    {urgencyEscalationEnabled ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 8 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={urgencyEscalationUnit === "hours" ? "e.g. 48" : "e.g. 3"}
                          value={urgencyEscalationAmount}
                          onChange={(e) => setUrgencyEscalationAmount(e.target.value)}
                          style={{ ...theme.formInput, width: 100, margin: 0 }}
                        />
                        <select
                          value={urgencyEscalationUnit}
                          onChange={(e) => setUrgencyEscalationUnit(e.target.value === "hours" ? "hours" : "days")}
                          style={{ ...theme.formInput, width: 120 }}
                        >
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                )}
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
