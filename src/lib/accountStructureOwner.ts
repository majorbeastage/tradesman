import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "../contexts/AuthContext"
import { parseOmCalendarPolicy } from "./teamCalendarPolicy"
import { isAdminPortalRole, isOfficeManagerLikeRole } from "./profileRoles"

/** Platform ops accounts that may edit the Tradesman admin org chart / workflow by default. */
export const PLATFORM_OPS_ADMIN_EMAILS = ["justin@tradesman-us.com", "joe@tradesman-us.com"] as const

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

export function isPlatformOpsAdminEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email)
  return (PLATFORM_OPS_ADMIN_EMAILS as readonly string[]).includes(e)
}

/**
 * Profile that stores the account-wide organization chart + business workflow.
 * Office / corporate owners store on themselves; managed users resolve to their account owner.
 * Platform admins without an owner link share Justin's (else Joe's) profile when present.
 */
export async function resolveAccountStructureOwnerId(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await client.from("profiles").select("role, email").eq("id", userId).maybeSingle()
  if (error) throw error
  const role = typeof data?.role === "string" ? data.role : null

  // Customer-side owners store the chart on their own profile.
  if (role === "office_manager" || role === "corporate_management") return userId

  const { data: link, error: linkErr } = await client
    .from("office_manager_clients")
    .select("office_manager_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()
  if (linkErr) throw linkErr
  if (typeof link?.office_manager_id === "string" && link.office_manager_id.trim()) {
    return link.office_manager_id.trim()
  }

  // Team invite shell profile → account owner
  const { data: invite, error: inviteErr } = await client
    .from("team_member_invites")
    .select("account_owner_id")
    .eq("shell_profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!inviteErr && typeof invite?.account_owner_id === "string" && invite.account_owner_id.trim()) {
    return invite.account_owner_id.trim()
  }

  // Tradesman platform admins share one ops structure doc (Justin, else Joe).
  if (isAdminPortalRole(role)) {
    const { data: opsRows } = await client
      .from("profiles")
      .select("id, email")
      .eq("role", "admin")
      .in("email", [...PLATFORM_OPS_ADMIN_EMAILS])
    const rows = opsRows ?? []
    const justin = rows.find((r) => normalizeEmail(r.email) === "justin@tradesman-us.com")
    if (justin?.id) return justin.id
    const joe = rows.find((r) => normalizeEmail(r.email) === "joe@tradesman-us.com")
    if (joe?.id) return joe.id
  }

  return userId
}

/** @deprecated Prefer resolveAccountStructureOwnerId — kept for existing imports. */
export async function resolveWorkflowMetadataUserId(client: SupabaseClient, userId: string): Promise<string> {
  return resolveAccountStructureOwnerId(client, userId)
}

export type StructureEditKind = "organization_chart" | "business_workflow"

/**
 * Whether the signed-in user may save organization chart / business workflow for the account.
 * Defaults: account owners (OM / corporate_management) and platform ops emails.
 * Delegates: Team Management flags on the requester's om_calendar_policy.
 */
export async function canEditAccountStructure(
  client: SupabaseClient,
  opts: {
    actorUserId: string
    actorRole: UserRole | string | null | undefined
    actorEmail: string | null | undefined
    kind: StructureEditKind
  },
): Promise<boolean> {
  const { actorUserId, actorRole, actorEmail, kind } = opts
  const role = typeof actorRole === "string" ? actorRole : null

  if (role === "office_manager" || role === "corporate_management") return true

  if (isAdminPortalRole(role)) {
    if (isPlatformOpsAdminEmail(actorEmail)) return true
    // Optional SQL-backed grant table (ignore if missing).
    try {
      const { data } = await client
        .from("platform_admin_delegations")
        .select("id")
        .eq("grantee_user_id", actorUserId)
        .eq("scope", kind === "organization_chart" ? "organization_chart" : "business_workflow")
        .limit(1)
        .maybeSingle()
      if (data?.id) return true
    } catch {
      /* table may not exist yet */
    }
    // Also allow a broader "structure" scope.
    try {
      const { data } = await client
        .from("platform_admin_delegations")
        .select("id")
        .eq("grantee_user_id", actorUserId)
        .eq("scope", "structure")
        .limit(1)
        .maybeSingle()
      if (data?.id) return true
    } catch {
      /* ignore */
    }
    return false
  }

  // Managed / team user: require Team Management grant on their own policy.
  const { data: selfRow, error } = await client.from("profiles").select("metadata").eq("id", actorUserId).maybeSingle()
  if (error) throw error
  const policy = parseOmCalendarPolicy(selfRow?.metadata)
  if (kind === "organization_chart") return policy.allow_edit_organization_chart === true
  return policy.allow_edit_business_workflow === true
}

export function isOfficeManagerLikeStructureOwner(role: string | null | undefined): boolean {
  return role === "office_manager" || role === "corporate_management" || isOfficeManagerLikeRole(role)
}
