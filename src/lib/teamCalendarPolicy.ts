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
  /** When true, this user can be selected for variance/report assignments by office managers. */
  allow_variance_assignment?: boolean
  /** Operations tab + sub-tools (work orders, POs, invoicing, inventory). */
  allow_operations_tab?: boolean
  allow_work_orders_tool?: boolean
  allow_purchase_orders_tool?: boolean
  allow_invoices_tool?: boolean
  allow_inventory_tool?: boolean
  /** When true, Customers tab only lists customers whose active workflow step matches this user/department. */
  workflow_only_customers?: boolean
  /** Department label for workflow routing display (e.g. Parts, Accounting). */
  department_label?: string | null
  /** When true, user may bypass workflow approval steps from the customer profile. */
  allow_bypass_workflow_approval?: boolean
  /** When true, user may edit the account Organization Chart (shared owner document). */
  allow_edit_organization_chart?: boolean
  /** When true, user may edit the account Business Workflow (shared owner document). */
  allow_edit_business_workflow?: boolean
  backup_user_id?: string | null
  teammate_user_id?: string | null
  /**
   * Keyed by job type id when available, else job type name.
   * Example: { "install": "preferred" }
   */
  job_qualifications?: Record<string, "not_qualified" | "qualified" | "preferred" | "required">
  /** When true, user may access the Email Client and granted org inboxes. */
  allow_email_client?: boolean
  /** Org email route ids this user may read/send from (subset configured by leadership). */
  email_inbox_route_ids?: string[]
  /** When true, late punch alerts fire for this user per workforce schedule. */
  late_punch_alerts_enabled?: boolean
  /** User ids notified when this employee punches in late. */
  late_punch_notify_user_ids?: string[]
  _v?: 1
}

const DEFAULT_POLICY: OmCalendarPolicyV1 = {
  allow_add_to_calendar: true,
  scheduling_tools: false,
  advanced_scheduling_tools: false,
  job_types_access: "edit",
  customer_map_access: false,
  allow_my_hours: false,
  allow_variance_assignment: false,
  allow_operations_tab: false,
  allow_work_orders_tool: false,
  allow_purchase_orders_tool: false,
  allow_invoices_tool: false,
  allow_inventory_tool: false,
  workflow_only_customers: false,
  department_label: null,
  allow_bypass_workflow_approval: false,
  allow_edit_organization_chart: false,
  allow_edit_business_workflow: false,
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
    allow_variance_assignment: o.allow_variance_assignment === true,
    allow_operations_tab: o.allow_operations_tab === true,
    allow_work_orders_tool: o.allow_work_orders_tool === true,
    allow_purchase_orders_tool: o.allow_purchase_orders_tool === true,
    allow_invoices_tool: o.allow_invoices_tool === true,
    allow_inventory_tool: o.allow_inventory_tool === true,
    workflow_only_customers: o.workflow_only_customers === true,
    department_label:
      typeof o.department_label === "string" && o.department_label.trim() ? o.department_label.trim() : null,
    allow_bypass_workflow_approval: o.allow_bypass_workflow_approval === true,
    allow_edit_organization_chart: o.allow_edit_organization_chart === true,
    allow_edit_business_workflow: o.allow_edit_business_workflow === true,
    backup_user_id: backupUserId,
    teammate_user_id: teammateUserId,
    job_qualifications: quals,
    allow_email_client: o.allow_email_client === true,
    email_inbox_route_ids: Array.isArray(o.email_inbox_route_ids)
      ? o.email_inbox_route_ids.filter((x): x is string => typeof x === "string")
      : [],
    late_punch_alerts_enabled: o.late_punch_alerts_enabled === true,
    late_punch_notify_user_ids: Array.isArray(o.late_punch_notify_user_ids)
      ? o.late_punch_notify_user_ids.filter((x): x is string => typeof x === "string")
      : [],
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

export const OM_CALENDAR_POLICY_UPDATED_EVENT = "om-calendar-policy-updated"

export function dispatchOmCalendarPolicyUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(OM_CALENDAR_POLICY_UPDATED_EVENT))
}

/** When team-management view-as or managed-user restrictions apply to sidebar navigation. */
export type OmCalendarPolicyNavContext = "view_as_demo" | "managed_user" | "none"

export function omCalendarPolicyNavContext(
  viewAsDemoUserId: string | null | undefined,
  managedByOfficeManager: boolean,
): OmCalendarPolicyNavContext {
  if (viewAsDemoUserId?.trim()) return "view_as_demo"
  if (managedByOfficeManager) return "managed_user"
  return "none"
}

export type PortalNavTabLite = { tab_id: string; label: string | null }

const OPERATIONS_TAB_IDS = new Set(["operations", "work_orders", "purchase_orders", "parts_inventory"])

/**
 * Apply per-user team permissions to sidebar tabs (view-as demo persona or managed contractor).
 * Account owners testing without view-as are unchanged (`context === "none"`).
 */
export function filterPortalTabsForOmCalendarPolicy(
  tabs: PortalNavTabLite[],
  policy: OmCalendarPolicyV1,
  context: OmCalendarPolicyNavContext,
): PortalNavTabLite[] {
  if (context === "none") return tabs
  let out = tabs.filter((t) => {
    const id = t.tab_id
    if (OPERATIONS_TAB_IDS.has(id)) return policy.allow_operations_tab === true
    if (id === "quotes") return policy.allow_estimates_tool === true
    if (id === "payments") return policy.allow_invoices_tool === true
    return true
  })
  if (policy.allow_operations_tab && !out.some((t) => OPERATIONS_TAB_IDS.has(t.tab_id))) {
    out = [...out, { tab_id: "operations", label: "Operations" }]
  }
  if (policy.allow_estimates_tool && !out.some((t) => t.tab_id === "quotes")) {
    out = [...out, { tab_id: "quotes", label: "Estimates" }]
  }
  if (policy.allow_invoices_tool && !out.some((t) => t.tab_id === "payments")) {
    out = [...out, { tab_id: "payments", label: "Payments" }]
  }
  return out
}

/** Whether an Operations sub-tool is enabled for the current team-permission context. */
export function operationsSubModuleAllowedByPolicy(
  sub: "work_orders" | "purchase_orders" | "invoicing" | "inventory" | "team_management",
  policy: OmCalendarPolicyV1,
  context: OmCalendarPolicyNavContext,
): boolean {
  if (context === "none") return true
  if (sub === "team_management") return true
  if (!policy.allow_operations_tab) return false
  if (sub === "work_orders") return policy.allow_work_orders_tool === true
  if (sub === "purchase_orders") return policy.allow_purchase_orders_tool === true
  if (sub === "invoicing") return policy.allow_invoices_tool === true
  if (sub === "inventory") return policy.allow_inventory_tool === true
  return false
}
