import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import type { ManagedClientRow } from "../../contexts/OfficeManagerScopeContext"
import {
  defaultTeamRibbonColor,
  mergeOmCalendarPolicy,
  mergeTeamRibbonColors,
  parseOmCalendarPolicy,
  parseTeamRibbonColors,
  type OmCalendarPolicyV1,
} from "../../lib/teamCalendarPolicy"
import { filterRealUserIds, isSandboxDemoUserId, parseSandboxDemoTeam } from "../../lib/sandboxDemoTeam"
import {
  mergeSandboxDemoTeamPolicy,
  metadataForDemoTeamPolicy,
  parseSandboxDemoTeamPolicies,
  SANDBOX_DEMO_TEAM_POLICIES_META_KEY,
} from "../../lib/sandboxDemoTeamPolicies"
import { loadOrganizationChartFromMetadata } from "../../lib/organizationChart"
import { orgDepartmentForLinkedUser } from "../../lib/orgChartDepartment"
import {
  buildDefaultSandboxDemoLocations,
  parseSandboxDemoLocations,
  SANDBOX_DEMO_LOCATIONS_META_KEY,
} from "../../lib/sandboxDemoLocations"
import TimeClockPortal from "../../components/TimeClockPortal"
import TeamLocationsMapModal from "../../components/TeamLocationsMapModal"

type ProfileLite = {
  id: string
  display_name: string | null
  email: string | null
  metadata: unknown
}

type PrefLite = {
  owner_user_id: string
  ribbon_color: string | null
  auto_assign_enabled: boolean | null
}

type UpcomingEventRow = {
  id: string
  user_id: string | null
  title: string
  start_at: string
  job_types?: { name: string | null } | { name: string | null }[] | null
}

type JobTypeNameRow = { user_id: string; name: string }
type JobQualificationLevel = "not_qualified" | "qualified" | "preferred" | "required"

type CardTab = "schedule" | "permissions"

type Props = {
  officeManagerUserId: string
  /** Signed-in user (for clock in/out and roster membership). */
  viewerUserId: string
  roster: ManagedClientRow[]
  managedOnly: ManagedClientRow[]
  /** Navigates to the dedicated Time clock workspace (full calendar page, not a modal). */
  onOpenTimeClockWorkspace?: () => void
  /** When true, hides the workspace entry control (already on that page). */
  timeClockWorkspacePage?: boolean
  /** `time_clock_only` shows punch clock + hours without team permission cards. */
  variant?: "default" | "time_clock_only"
}

function normalizeJobTypeName(raw: UpcomingEventRow["job_types"]): string | null {
  if (!raw) return null
  if (Array.isArray(raw)) {
    const n = raw[0]?.name
    return typeof n === "string" && n.trim() ? n.trim() : null
  }
  const n = raw.name
  return typeof n === "string" && n.trim() ? n.trim() : null
}

function TeamUserCard({
  member,
  ribbonOm,
  photo,
  displayName,
  clockedInAt,
  policy,
  pref,
  savingUserId,
  setOmMeta,
  persistOmColorForMember,
  updatePermissionDraft,
  savePermissionsForMember,
  permissionsDirty,
  departmentLabel,
  persistUserPref,
  upcoming,
  jobTypeNames,
  rosterOptions,
  removeJobQualification,
  cardTab,
  setCardTab,
}: {
  member: ManagedClientRow
  ribbonOm: string
  photo: string | null
  displayName: string
  clockedInAt: string | null
  policy: OmCalendarPolicyV1
  pref: PrefLite | undefined
  savingUserId: string | null
  setOmMeta: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  persistOmColorForMember: (memberUserId: string, hex: string) => Promise<void>
  updatePermissionDraft: (targetUserId: string, patch: Partial<OmCalendarPolicyV1>) => void
  savePermissionsForMember: (targetUserId: string) => Promise<void>
  permissionsDirty: boolean
  departmentLabel: string | null
  persistUserPref: (targetUserId: string, ribbon: string, autoAssign: boolean) => Promise<void>
  upcoming: UpcomingEventRow[]
  jobTypeNames: string[]
  rosterOptions: { id: string; label: string }[]
  removeJobQualification: (targetUserId: string, key: string) => void
  cardTab: CardTab
  setCardTab: (userId: string, tab: CardTab) => void
}) {
  const tab = cardTab
  const listBox: React.CSSProperties = {
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: "#f8fafc",
    padding: "8px 10px",
    minHeight: 88,
    fontSize: 12,
    color: "#334155",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    overflow: "hidden",
  }
  const listTitle: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.04, marginBottom: 2 }
  const [qualificationsOpen, setQualificationsOpen] = useState(false)
  const [jobQualificationDraft, setJobQualificationDraft] = useState("")
  const [jobQualificationLevel, setJobQualificationLevel] = useState<JobQualificationLevel>("qualified")
  const qualificationPairs = Object.entries(policy.job_qualifications ?? {})
  const [upcomingWindow, setUpcomingWindow] = useState<"day" | "week" | "month">("week")
  const filteredUpcoming = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    if (upcomingWindow === "day") end.setDate(end.getDate() + 1)
    else if (upcomingWindow === "week") end.setDate(end.getDate() + 7)
    else end.setMonth(end.getMonth() + 1)
    return upcoming.filter((ev) => {
      const start = new Date(ev.start_at)
      return start >= now && start < end
    })
  }, [upcoming, upcomingWindow])

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          minHeight: 68,
          background: ribbonOm,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "10px 72px 10px 14px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 15,
            color: "#fff",
            lineHeight: 1.25,
            textShadow: "0 1px 3px rgba(0,0,0,0.45)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {displayName}
        </div>
        {clockedInAt ? (
          <div
            title={`Clocked in at ${new Date(clockedInAt).toLocaleString()}`}
            style={{
              position: "absolute",
              top: 8,
              right: photo ? 78 : 12,
              fontSize: 10,
              fontWeight: 800,
              color: "#fff",
              background: "rgba(0,0,0,0.28)",
              padding: "4px 8px",
              borderRadius: 6,
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
              letterSpacing: 0.02,
            }}
          >
            In ·{" "}
            {new Date(clockedInAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        ) : null}
        {photo ? (
          <img
            src={photo}
            alt=""
            style={{
              position: "absolute",
              right: 14,
              bottom: -22,
              width: 56,
              height: 56,
              borderRadius: "50%",
              objectFit: "cover",
              border: "3px solid #fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          />
        ) : null}
      </div>

      <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${theme.border}`, background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setCardTab(member.userId, "schedule")}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: tab === "schedule" ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
              background: tab === "schedule" ? "#eff6ff" : "#fff",
              fontWeight: tab === "schedule" ? 800 : 600,
              fontSize: 12,
              color: theme.text,
              cursor: "pointer",
            }}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => setCardTab(member.userId, "permissions")}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: tab === "permissions" ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
              background: tab === "permissions" ? "#eff6ff" : "#fff",
              fontWeight: tab === "permissions" ? 800 : 600,
              fontSize: 12,
              color: theme.text,
              cursor: "pointer",
            }}
          >
            Edit permissions
          </button>
        </div>
      </div>

      {tab === "schedule" ? (
        <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {member.email ? <div style={{ fontSize: 11, color: "#94a3b8" }}>{member.email}</div> : null}
          {member.isSelf ? <div style={{ fontSize: 10, fontWeight: 700, color: theme.primary }}>Office manager</div> : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              alignItems: "stretch",
            }}
          >
            <div style={listBox}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={listTitle}>Upcoming jobs</div>
                <select
                  value={upcomingWindow}
                  onChange={(e) => setUpcomingWindow(e.target.value as "day" | "week" | "month")}
                  style={{ ...theme.formInput, fontSize: 11, padding: "2px 6px", minHeight: 0, height: 24, maxWidth: 90 }}
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              {filteredUpcoming.length === 0 ? (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No upcoming jobs on file.</span>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.45 }}>
                  {filteredUpcoming.slice(0, 6).map((ev) => {
                    const jt = normalizeJobTypeName(ev.job_types)
                    const when = ev.start_at ? new Date(ev.start_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"
                    return (
                      <li key={ev.id} style={{ marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{ev.title?.trim() || "Untitled"}</span>
                        {jt ? <span style={{ color: "#64748b" }}> · {jt}</span> : null}
                        <div style={{ fontSize: 11, color: "#64748b" }}>{when}</div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div style={listBox}>
              <div style={listTitle}>Job type assignments</div>
              {jobTypeNames.length === 0 ? (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No job types yet for this user.</span>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.45 }}>
                  {jobTypeNames.slice(0, 8).map((name) => (
                    <li key={name} style={{ marginBottom: 2 }}>
                      {name}
                    </li>
                  ))}
                  {jobTypeNames.length > 8 ? <li style={{ color: "#94a3b8" }}>+{jobTypeNames.length - 8} more…</li> : null}
                </ul>
              )}
              <p style={{ margin: "6px 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.35 }}>
                Per-type routing (qualified / assign-all) arrives in a later update.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={listBox}>
              <div style={listTitle}>Upcoming time off</div>
              <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No time off on the calendar yet.</span>
            </div>
            <div style={listBox}>
              <div style={listTitle}>Associates schedule</div>
              <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Teammate links and shared views coming soon.</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.06 }}>Controls</div>

          <label style={{ fontSize: 12, fontWeight: 600, color: theme.text, display: "flex", alignItems: "center", gap: 8 }}>
            Team color
            <input
              type="color"
              value={ribbonOm}
              disabled={savingUserId === "__om__" || savingUserId === member.userId}
              onChange={(e) => {
                const hex = e.target.value
                setOmMeta((prev) => mergeTeamRibbonColors(prev, member.userId, hex))
                void persistUserPref(member.userId, hex, pref?.auto_assign_enabled ?? true)
              }}
              onBlur={(e) => void persistOmColorForMember(member.userId, e.currentTarget.value)}
              style={{ width: 32, height: 22, padding: 0, border: `1px solid ${theme.border}`, borderRadius: 5, cursor: "pointer" }}
            />
          </label>

          {!member.isSelf ? (
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, display: "grid", gap: 8 }}>
              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.allow_add_to_calendar !== false}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { allow_add_to_calendar: e.target.checked })}
                />
                Allow User to add items to Calendar
              </label>

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.allow_estimates_tool === true}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { allow_estimates_tool: e.target.checked })}
                />
                Allow Estimate tool (Quotes tab)
              </label>

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.allow_variance_assignment === true}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { allow_variance_assignment: e.target.checked })}
                />
                Allow assigning variances/reports to this team member
              </label>

              <div style={{ fontSize: 12, color: theme.text }}>
                <span style={{ fontWeight: 600 }}>Department</span>
                <p style={{ margin: "4px 0 0", color: "#475569", lineHeight: 1.4 }}>
                  {departmentLabel?.trim() || "Not linked on organization chart — open Organization chart and link this person to a department node."}
                </p>
              </div>

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.workflow_only_customers === true}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { workflow_only_customers: e.target.checked })}
                />
                Only show customers active in this user&apos;s workflow
              </label>
              <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: 1.35 }}>
                When enabled, the Customers tab lists active-step matches plus an Upcoming folder for customers not at this department yet.
              </p>

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.allow_bypass_workflow_approval === true}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { allow_bypass_workflow_approval: e.target.checked })}
                />
                Allow bypassing workflow approval requirements
              </label>

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.allow_operations_tab === true}
                  disabled={savingUserId === member.userId}
                  onChange={(e) =>
                    updatePermissionDraft(member.userId, {
                      allow_operations_tab: e.target.checked,
                      ...(e.target.checked
                        ? {}
                        : {
                            allow_work_orders_tool: false,
                            allow_purchase_orders_tool: false,
                            allow_invoices_tool: false,
                            allow_inventory_tool: false,
                          }),
                    })
                  }
                />
                Allow Operations tab
              </label>

              {policy.allow_operations_tab ? (
                <div style={{ marginLeft: 16, display: "grid", gap: 8 }}>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={policy.allow_work_orders_tool === true}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { allow_work_orders_tool: e.target.checked })}
                    />
                    Work orders tool
                  </label>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={policy.allow_purchase_orders_tool === true}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { allow_purchase_orders_tool: e.target.checked })}
                    />
                    Purchase orders tool
                  </label>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={policy.allow_invoices_tool === true}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { allow_invoices_tool: e.target.checked })}
                    />
                    Invoices / billing tool
                  </label>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={policy.allow_inventory_tool === true}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { allow_inventory_tool: e.target.checked })}
                    />
                    Inventory tool
                  </label>
                </div>
              ) : null}

              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#f8fafc", padding: 8 }}>
                <button
                  type="button"
                  onClick={() => setQualificationsOpen((v) => !v)}
                  style={{ border: "none", background: "transparent", color: theme.text, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 700 }}
                >
                  {qualificationsOpen ? "Hide" : "Select"} Job Qualifications
                </button>
                {qualificationsOpen ? (
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                      <select value={jobQualificationDraft} onChange={(e) => setJobQualificationDraft(e.target.value)} style={{ ...theme.formInput, fontSize: 12 }}>
                        <option value="">Select job type</option>
                        {jobTypeNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <select value={jobQualificationLevel} onChange={(e) => setJobQualificationLevel(e.target.value as JobQualificationLevel)} style={{ ...theme.formInput, fontSize: 12 }}>
                        <option value="not_qualified">Not - Qualified</option>
                        <option value="qualified">Qualified</option>
                        <option value="preferred">Preferred</option>
                        <option value="required">Required</option>
                      </select>
                      <button
                        type="button"
                        disabled={!jobQualificationDraft || savingUserId === member.userId}
                        onClick={() => {
                          updatePermissionDraft(member.userId, {
                            job_qualifications: {
                              ...(policy.job_qualifications ?? {}),
                              [jobQualificationDraft]: jobQualificationLevel,
                            },
                          })
                          setJobQualificationDraft("")
                          setJobQualificationLevel("qualified")
                        }}
                        style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                      >
                        Add
                      </button>
                    </div>
                    {qualificationPairs.length ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        {qualificationPairs.map(([key, value]) => (
                          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${theme.border}`, borderRadius: 6, background: "#fff", padding: "6px 8px" }}>
                            <span style={{ fontSize: 11, color: "#334155" }}>{key} - {String(value).replace("_", " ")}</span>
                            <button
                              type="button"
                              onClick={() => void removeJobQualification(member.userId, key)}
                              style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>No job qualifications selected yet.</span>
                    )}
                  </div>
                ) : null}
              </div>

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={policy.advanced_scheduling_tools === true || policy.scheduling_tools === true}
                  disabled={savingUserId === member.userId}
                  onChange={(e) =>
                    updatePermissionDraft(member.userId, {
                      scheduling_tools: e.target.checked,
                      advanced_scheduling_tools: e.target.checked,
                      ...(e.target.checked ? {} : { job_types_access: "off", customer_map_access: false, allow_my_hours: false }),
                    })
                  }
                />
                Allow User advanced Scheduling Tools
              </label>

              {policy.advanced_scheduling_tools === true || policy.scheduling_tools === true ? (
                <div style={{ marginLeft: 16, display: "grid", gap: 8 }}>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    Allow User Access to Job Types settings
                    <select
                      value={policy.job_types_access ?? "read"}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { job_types_access: e.target.value as OmCalendarPolicyV1["job_types_access"] })}
                      style={{ ...theme.formInput, maxWidth: 160, fontSize: 12 }}
                    >
                      <option value="read">View only</option>
                      <option value="edit">Edit access</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={policy.customer_map_access === true}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { customer_map_access: e.target.checked })}
                    />
                    Allow upcoming Customer Map access
                  </label>
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={policy.allow_my_hours === true}
                      disabled={savingUserId === member.userId}
                      onChange={(e) => updatePermissionDraft(member.userId, { allow_my_hours: e.target.checked })}
                    />
                    Allow My Hours
                  </label>
                </div>
              ) : null}

              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                Select Backup
                <select
                  value={policy.backup_user_id ?? ""}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { backup_user_id: e.target.value || null })}
                  style={{ ...theme.formInput, maxWidth: 220, fontSize: 12 }}
                >
                  <option value="">None selected</option>
                  {rosterOptions.filter((u) => u.id !== member.userId).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                Select Teammate
                <select
                  value={policy.teammate_user_id ?? ""}
                  disabled={savingUserId === member.userId}
                  onChange={(e) => updatePermissionDraft(member.userId, { teammate_user_id: e.target.value || null })}
                  style={{ ...theme.formInput, maxWidth: 220, fontSize: 12 }}
                >
                  <option value="">None selected</option>
                  {rosterOptions.filter((u) => u.id !== member.userId).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
                <button
                  type="button"
                  disabled={savingUserId === member.userId || !permissionsDirty}
                  onClick={() => void savePermissionsForMember(member.userId)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: permissionsDirty ? theme.primary : "#cbd5e1",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: savingUserId === member.userId ? "wait" : permissionsDirty ? "pointer" : "default",
                  }}
                >
                  {savingUserId === member.userId ? "Saving…" : "Save permissions"}
                </button>
                {permissionsDirty ? (
                  <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>Unsaved changes</span>
                ) : (
                  <span style={{ fontSize: 11, color: "#64748b" }}>Permissions match saved settings</span>
                )}
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>Use this card to adjust your team color.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function CalendarTeamManagementPanel({
  officeManagerUserId,
  viewerUserId,
  roster,
  managedOnly,
  onOpenTimeClockWorkspace,
  timeClockWorkspacePage,
  variant = "default",
}: Props) {
  const [omMeta, setOmMeta] = useState<Record<string, unknown>>({})
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({})
  const [prefsByUser, setPrefsByUser] = useState<Record<string, PrefLite>>({})
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState<string>("")
  const [upcomingByUser, setUpcomingByUser] = useState<Record<string, UpcomingEventRow[]>>({})
  const [jobTypesByUser, setJobTypesByUser] = useState<Record<string, string[]>>({})
  const [cardTabByUser, setCardTabByUser] = useState<Record<string, CardTab>>({})
  const [openClockByUser, setOpenClockByUser] = useState<Record<string, string>>({})
  const [teamMapExpanded, setTeamMapExpanded] = useState(false)
  const [sandboxDemoLocations, setSandboxDemoLocations] = useState<ReturnType<typeof parseSandboxDemoLocations>>({})
  const [permissionDraftByUserId, setPermissionDraftByUserId] = useState<Record<string, OmCalendarPolicyV1>>({})

  const orgChart = useMemo(() => loadOrganizationChartFromMetadata(omMeta), [omMeta])

  const teamMapUserIds = useMemo(
    () => filterRealUserIds(Array.from(new Set(roster.map((r) => r.userId).filter(Boolean)))),
    [roster],
  )

  const teamMapMembers = useMemo(
    () =>
      roster.map((r) => ({
        userId: r.userId,
        label: profilesById[r.userId]?.display_name?.trim() || r.label || r.userId.slice(0, 8),
        isSelf: r.isSelf,
        isDemo: isSandboxDemoUserId(r.userId),
      })),
    [roster, profilesById],
  )

  useEffect(() => {
    if (!supabase || !officeManagerUserId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", officeManagerUserId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      let locs = parseSandboxDemoLocations(meta[SANDBOX_DEMO_LOCATIONS_META_KEY])
      if (Object.keys(locs).length === 0) {
        locs = buildDefaultSandboxDemoLocations(parseSandboxDemoTeam(meta.sandbox_demo_team))
      }
      setSandboxDemoLocations(locs)
    })()
    return () => {
      cancelled = true
    }
  }, [officeManagerUserId])

  useEffect(() => {
    const demoTeam = parseSandboxDemoTeam(omMeta.sandbox_demo_team)
    const demoPolicies = parseSandboxDemoTeamPolicies(omMeta[SANDBOX_DEMO_TEAM_POLICIES_META_KEY])
    if (demoTeam.length === 0) return
    setProfilesById((prev) => {
      const next = { ...prev }
      for (const m of demoTeam) {
        const pol = demoPolicies[m.id]
        next[m.id] = {
          id: m.id,
          display_name: m.label,
          email: m.email,
          metadata: pol ? metadataForDemoTeamPolicy(pol) : {},
        }
      }
      return next
    })
  }, [omMeta])

  const teamColors = useMemo(() => parseTeamRibbonColors(omMeta), [omMeta])

  const rosterDbUserIds = useMemo(
    () => filterRealUserIds(roster.map((r) => r.userId).filter(Boolean)),
    [roster],
  )

  const setCardTab = useCallback((userId: string, tab: CardTab) => {
    setCardTabByUser((prev) => ({ ...prev, [userId]: tab }))
  }, [])

  const rosterLabel = useCallback(
    (userId: string) => {
      const fromProfile = profilesById[userId]?.display_name?.trim()
      if (fromProfile) return fromProfile
      return roster.find((r) => r.userId === userId)?.label?.trim() || userId.slice(0, 8) + "…"
    },
    [profilesById, roster],
  )

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", officeManagerUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const m = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? (data.metadata as Record<string, unknown>) : {}
        setOmMeta(m)
      })
    return () => {
      cancelled = true
    }
  }, [officeManagerUserId])

  useEffect(() => {
    if (!supabase || rosterDbUserIds.length === 0) return
    const ids = rosterDbUserIds
    let cancelled = false
    void (async () => {
      const { data: profs, error: e1 } = await supabase.from("profiles").select("id, display_name, email, metadata").in("id", ids)
      if (cancelled || e1 || !profs) return
      const map: Record<string, ProfileLite> = {}
      for (const p of profs as ProfileLite[]) map[p.id] = p
      setProfilesById(map)
      const { data: prefs, error: e2 } = await supabase.from("user_calendar_preferences").select("owner_user_id, ribbon_color, auto_assign_enabled").in("owner_user_id", ids)
      if (cancelled || e2) return
      const pm: Record<string, PrefLite> = {}
      for (const row of (prefs ?? []) as PrefLite[]) pm[row.owner_user_id] = row
      setPrefsByUser(pm)
    })()
    return () => {
      cancelled = true
    }
  }, [rosterDbUserIds])

  useEffect(() => {
    if (!supabase || rosterDbUserIds.length === 0) return
    const ids = rosterDbUserIds
    let cancelled = false
    const nowIso = new Date().toISOString()
    void (async () => {
      const jobSelect = `
        id,
        user_id,
        title,
        start_at,
        job_types ( name )
      `
      const jobSelectFallback = `id, user_id, title, start_at, job_type_id`
      let rows: UpcomingEventRow[] = []
      const primary = await supabase
        .from("calendar_events")
        .select(jobSelect)
        .in("user_id", ids)
        .is("removed_at", null)
        .is("completed_at", null)
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true })
        .limit(180)
      if (!cancelled && !primary.error && primary.data) {
        rows = primary.data as UpcomingEventRow[]
      } else if (!cancelled) {
        const fb = await supabase
          .from("calendar_events")
          .select(jobSelectFallback)
          .in("user_id", ids)
          .is("removed_at", null)
          .is("completed_at", null)
          .gte("start_at", nowIso)
          .order("start_at", { ascending: true })
          .limit(180)
        if (!cancelled && !fb.error && fb.data) rows = fb.data as UpcomingEventRow[]
      }
      const byUser: Record<string, UpcomingEventRow[]> = {}
      for (const id of ids) byUser[id] = []
      for (const ev of rows) {
        const uid = ev.user_id ?? ""
        if (!uid || !byUser[uid]) continue
        if (byUser[uid].length >= 6) continue
        byUser[uid].push(ev)
      }
      if (!cancelled) setUpcomingByUser(byUser)

      const jtRes = await supabase.from("job_types").select("user_id, name").in("user_id", ids).order("name")
      if (cancelled || jtRes.error || !jtRes.data) {
        if (!cancelled) setJobTypesByUser({})
        return
      }
      const jtBy: Record<string, string[]> = {}
      for (const id of ids) jtBy[id] = []
      for (const row of jtRes.data as JobTypeNameRow[]) {
        const n = row.name?.trim()
        if (!n) continue
        if (!jtBy[row.user_id]) jtBy[row.user_id] = []
        jtBy[row.user_id].push(n)
      }
      if (!cancelled) setJobTypesByUser(jtBy)
    })()
    return () => {
      cancelled = true
    }
  }, [rosterDbUserIds, supabase])

  async function persistOmColorForMember(memberUserId: string, hex: string) {
    if (!supabase) return
    setSavingUserId("__om__")
    setMessage("")
    try {
      const { data: row, error: e1 } = await supabase.from("profiles").select("metadata").eq("id", officeManagerUserId).maybeSingle()
      if (e1) throw e1
      const merged = mergeTeamRibbonColors(row?.metadata, memberUserId, hex)
      const { error: e2 } = await supabase.from("profiles").update({ metadata: merged, updated_at: new Date().toISOString() }).eq("id", officeManagerUserId)
      if (e2) throw e2
      setOmMeta(merged)
      setMessage("Color saved.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUserId(null)
    }
  }

  function savedPolicyForMember(userId: string): OmCalendarPolicyV1 {
    return parseOmCalendarPolicy(profilesById[userId]?.metadata)
  }

  function updatePermissionDraft(targetUserId: string, patch: Partial<OmCalendarPolicyV1>) {
    setPermissionDraftByUserId((prev) => {
      const base = prev[targetUserId] ?? savedPolicyForMember(targetUserId)
      const merged = mergeOmCalendarPolicy({ om_calendar_policy: base }, patch)
      return { ...prev, [targetUserId]: parseOmCalendarPolicy(merged) }
    })
  }

  async function savePermissionsForMember(targetUserId: string) {
    if (!supabase) return
    const draft = permissionDraftByUserId[targetUserId] ?? savedPolicyForMember(targetUserId)
    const dept = orgDepartmentForLinkedUser(orgChart, targetUserId)
    const toSave = parseOmCalendarPolicy(
      mergeOmCalendarPolicy({ om_calendar_policy: draft }, { department_label: dept }),
    )
    setSavingUserId(targetUserId)
    setMessage("")
    try {
      if (isSandboxDemoUserId(targetUserId)) {
        const { data: row, error: e1 } = await supabase
          .from("profiles")
          .select("metadata")
          .eq("id", officeManagerUserId)
          .maybeSingle()
        if (e1) throw e1
        const merged = mergeSandboxDemoTeamPolicy(row?.metadata, targetUserId, toSave)
        const { error: e2 } = await supabase
          .from("profiles")
          .update({ metadata: merged, updated_at: new Date().toISOString() })
          .eq("id", officeManagerUserId)
        if (e2) throw e2
        setOmMeta(merged)
        setProfilesById((prev) => ({
          ...prev,
          [targetUserId]: {
            ...prev[targetUserId],
            id: targetUserId,
            metadata: metadataForDemoTeamPolicy(toSave),
          } as ProfileLite,
        }))
      } else {
        const { data: row, error: e1 } = await supabase.from("profiles").select("metadata").eq("id", targetUserId).maybeSingle()
        if (e1) throw e1
        const nextMeta = mergeOmCalendarPolicy(row?.metadata, toSave)
        const { error: e2 } = await supabase
          .from("profiles")
          .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
          .eq("id", targetUserId)
        if (e2) throw e2
        setProfilesById((prev) => ({
          ...prev,
          [targetUserId]: { ...prev[targetUserId], id: targetUserId, metadata: nextMeta } as ProfileLite,
        }))
      }
      setPermissionDraftByUserId((prev) => {
        const next = { ...prev }
        delete next[targetUserId]
        return next
      })
      setMessage("Permissions saved.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUserId(null)
    }
  }

  async function persistUserPref(targetUserId: string, ribbon: string, autoAssign: boolean) {
    if (!supabase) return
    if (isSandboxDemoUserId(targetUserId)) {
      setPrefsByUser((prev) => ({
        ...prev,
        [targetUserId]: { owner_user_id: targetUserId, ribbon_color: ribbon, auto_assign_enabled: autoAssign },
      }))
      setMessage("Demo calendar ribbon saved (training preview).")
      return
    }
    setSavingUserId(targetUserId)
    setMessage("")
    try {
      const payload = {
        owner_user_id: targetUserId,
        ribbon_color: ribbon,
        auto_assign_enabled: autoAssign,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("user_calendar_preferences").upsert(payload, { onConflict: "owner_user_id" })
      if (error) throw error
      setPrefsByUser((prev) => ({ ...prev, [targetUserId]: { owner_user_id: targetUserId, ribbon_color: ribbon, auto_assign_enabled: autoAssign } }))
      setMessage("Calendar ribbon saved.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUserId(null)
    }
  }

  function removeJobQualification(targetUserId: string, key: string) {
    const current = permissionDraftByUserId[targetUserId] ?? savedPolicyForMember(targetUserId)
    const next = { ...(current.job_qualifications ?? {}) }
    delete next[key]
    updatePermissionDraft(targetUserId, { job_qualifications: next })
  }

  const rosterOptions = useMemo(
    () =>
      roster.map((m) => ({
        id: m.userId,
        label: profilesById[m.userId]?.display_name?.trim() || m.label || m.userId.slice(0, 8),
      })),
    [roster, profilesById],
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TimeClockPortal
        viewerUserId={viewerUserId}
        roster={roster}
        rosterLabel={rosterLabel}
        upcomingByUser={upcomingByUser}
        variant={variant}
        onOpenTimeClockWorkspace={onOpenTimeClockWorkspace}
        timeClockWorkspacePage={timeClockWorkspacePage}
        canManageTeamEntries={managedOnly.length > 0}
        onOpenShiftSessionsChange={setOpenClockByUser}
      />

      {message ? (
        <p style={{ margin: 0, fontSize: 13, color: message.includes("saved") ? "#059669" : "#b91c1c" }}>{message}</p>
      ) : null}

      {variant !== "time_clock_only" && teamMapUserIds.length > 0 ? (
        <TeamLocationsMapModal
          variant={teamMapExpanded ? "embedded" : "thumbnail"}
          title="Team & jobs map"
          members={teamMapMembers}
          orgUserIdsForJobs={teamMapUserIds.length > 0 ? teamMapUserIds : [viewerUserId]}
          sandboxDemoLocations={sandboxDemoLocations}
          resolveJobUserId={(id) => (isSandboxDemoUserId(id) ? viewerUserId : id)}
          showTeamGps
          showJobPins
          onClose={() => setTeamMapExpanded(false)}
          onExpand={() => setTeamMapExpanded(true)}
        />
      ) : null}

      {variant === "time_clock_only" ? null : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
          gap: 14,
        }}
      >
        {roster.map((member, idx) => {
          const p = profilesById[member.userId]
          const meta = p?.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? (p.metadata as Record<string, unknown>) : {}
          const photo =
            typeof meta.profile_photo_url === "string" && meta.profile_photo_url.trim().startsWith("http")
              ? meta.profile_photo_url.trim()
              : null
          const ribbonOm = teamColors[member.userId] ?? defaultTeamRibbonColor(member.userId, idx)
          const pref = prefsByUser[member.userId]
          const policy = member.isSelf
            ? ({ allow_add_to_calendar: true, job_types_access: "edit" } as OmCalendarPolicyV1)
            : permissionDraftByUserId[member.userId] ?? parseOmCalendarPolicy(p?.metadata)
          const departmentLabel = orgDepartmentForLinkedUser(orgChart, member.userId)
          const permissionsDirty =
            !member.isSelf &&
            JSON.stringify(policy) !== JSON.stringify(savedPolicyForMember(member.userId))
          const displayName = (p?.display_name?.trim() || member.label || "User").trim()
          const tab: CardTab = cardTabByUser[member.userId] ?? "schedule"

          return (
            <TeamUserCard
              key={member.userId}
              member={member}
              ribbonOm={ribbonOm}
              photo={photo}
              displayName={displayName}
              clockedInAt={openClockByUser[member.userId] ?? null}
              policy={policy}
              pref={pref}
              savingUserId={savingUserId}
              setOmMeta={setOmMeta}
              persistOmColorForMember={persistOmColorForMember}
              updatePermissionDraft={updatePermissionDraft}
              savePermissionsForMember={savePermissionsForMember}
              permissionsDirty={permissionsDirty}
              departmentLabel={departmentLabel}
              persistUserPref={persistUserPref}
              upcoming={upcomingByUser[member.userId] ?? []}
              jobTypeNames={jobTypesByUser[member.userId] ?? []}
              rosterOptions={rosterOptions}
              removeJobQualification={removeJobQualification}
              cardTab={tab}
              setCardTab={setCardTab}
            />
          )
        })}
      </div>
      )}

      {variant === "time_clock_only" ? null : managedOnly.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No linked contractors yet. Add clients under your office manager account.</p>
      ) : null}
    </div>
  )
}
