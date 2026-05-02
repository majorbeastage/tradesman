/**
 * Office-manager → managed-user calendar permissions stored on the **managed user's**
 * `profiles.metadata.om_calendar_policy` (JSON). OM edits in Team Management and saves per user.
 */
export type OmCalendarPolicyV1 = {
  /** When false or omitted for OM-managed users, the Estimate / Quotes tool stays locked until the office manager enables it. */
  allow_estimates_tool?: boolean
  allow_add_to_calendar?: boolean
  /** Legacy + current flag for advanced scheduling options. */
  scheduling_tools?: boolean
  advanced_scheduling_tools?: boolean
  job_types_access?: "off" | "read" | "edit"
  customer_map_access?: boolean
  allow_my_hours?: boolean
  backup_user_id?: string | null
  teammate_user_id?: string | null
  /**
   * Keyed by job type id when available, else job type name.
   * Example: { "install": "preferred" }
   */
  job_qualifications?: Record<string, "not_qualified" | "qualified" | "preferred" | "required">
  /** Future: nested scheduling / alerts flags */
  _v?: 1
}

const DEFAULT_POLICY: OmCalendarPolicyV1 = {
  allow_add_to_calendar: true,
  scheduling_tools: false,
  advanced_scheduling_tools: false,
  job_types_access: "edit",
  customer_map_access: false,
  allow_my_hours: false,
  backup_user_id: null,
  teammate_user_id: null,
  job_qualifications: {},
  _v: 1,
}

export function parseOmCalendarPolicy(metadata: unknown): OmCalendarPolicyV1 {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { ...DEFAULT_POLICY }
  const raw = (metadata as Record<string, unknown>).om_calendar_policy
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_POLICY }
  const o = raw as Record<string, unknown>
  const jobTypes = o.job_types_access
  const jt =
    jobTypes === "off" || jobTypes === "read" || jobTypes === "edit" ? jobTypes : DEFAULT_POLICY.job_types_access
  const legacyScheduling = o.scheduling_tools === true
  const advancedScheduling = o.advanced_scheduling_tools === true || legacyScheduling
  const backupUserId = typeof o.backup_user_id === "string" && o.backup_user_id.trim() ? o.backup_user_id.trim() : null
  const teammateUserId = typeof o.teammate_user_id === "string" && o.teammate_user_id.trim() ? o.teammate_user_id.trim() : null
  const qualificationsRaw = o.job_qualifications
  const quals: Record<string, "not_qualified" | "qualified" | "preferred" | "required"> = {}
  if (qualificationsRaw && typeof qualificationsRaw === "object" && !Array.isArray(qualificationsRaw)) {
    for (const [key, val] of Object.entries(qualificationsRaw as Record<string, unknown>)) {
      if (!key.trim()) continue
      if (val === "not_qualified" || val === "qualified" || val === "preferred" || val === "required") {
        quals[key] = val
      }
    }
  }
  return {
    allow_estimates_tool: o.allow_estimates_tool === true,
    allow_add_to_calendar: o.allow_add_to_calendar === false ? false : true,
    scheduling_tools: advancedScheduling,
    advanced_scheduling_tools: advancedScheduling,
    job_types_access: jt,
    customer_map_access: o.customer_map_access === true,
    allow_my_hours: o.allow_my_hours === true,
    backup_user_id: backupUserId,
    teammate_user_id: teammateUserId,
    job_qualifications: quals,
    _v: 1,
  }
}

export function mergeOmCalendarPolicy(metadata: unknown, patch: Partial<OmCalendarPolicyV1>): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const prev = parseOmCalendarPolicy(metadata)
  base.om_calendar_policy = { ...prev, ...patch, _v: 1 }
  return base
}

/** Stable default colors for team roster (OM can override per user in team_calendar_colors). */
export function defaultTeamRibbonColor(userId: string, index: number): string {
  const palette = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#6366f1"]
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return palette[(h + index) % palette.length]
}

export type TeamCalendarColorsV1 = Record<string, string>

export function parseTeamRibbonColors(metadata: unknown): TeamCalendarColorsV1 {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const raw = (metadata as Record<string, unknown>).team_calendar_colors
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: TeamCalendarColorsV1 = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v
  }
  return out
}

export function mergeTeamRibbonColors(metadata: unknown, userId: string, hex: string): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const colors = { ...parseTeamRibbonColors(metadata), [userId]: hex }
  base.team_calendar_colors = colors
  return base
}
