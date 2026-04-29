/**
 * Office-manager → managed-user calendar permissions stored on the **managed user's**
 * `profiles.metadata.om_calendar_policy` (JSON). OM edits in Team Management and saves per user.
 */
export type OmCalendarPolicyV1 = {
  allow_add_to_calendar?: boolean
  scheduling_tools?: boolean
  job_types_access?: "off" | "read" | "edit"
  /** Future: nested scheduling / alerts flags */
  _v?: 1
}

const DEFAULT_POLICY: OmCalendarPolicyV1 = {
  allow_add_to_calendar: true,
  scheduling_tools: false,
  job_types_access: "edit",
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
  return {
    allow_add_to_calendar: o.allow_add_to_calendar === false ? false : true,
    scheduling_tools: o.scheduling_tools === true,
    job_types_access: jt,
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
