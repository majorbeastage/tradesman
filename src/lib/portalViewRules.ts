import type { UserRole } from "../contexts/AuthContext"
import { getDefaultPortalConfigForViewRole, type PortalConfig } from "../types/portal-builder"
import { isOfficeManagerAssignmentRole, labelForProfileRole, PROFILE_ROLE_LABELS } from "./profileRoles"

/** Session value: preview the default portal layout for the selected role (no specific profile). */
export const PORTAL_VIEW_DEFAULT_USER = "__role_default__"

export function isPortalViewDefaultTarget(id: string | null | undefined): boolean {
  return !id || id === PORTAL_VIEW_DEFAULT_USER
}

export function defaultPortalConfigForViewRole(viewRole: UserRole): PortalConfig {
  return getDefaultPortalConfigForViewRole(viewRole)
}

/** Contractor portal shell — user vs office-manager layout. */
export type PortalShell = "user" | "office"

export type ManageableUserRow = {
  userId: string
  label: string
  email?: string | null
  role: UserRole
  clientId: string | null
  isSelf?: boolean
}

/** Roles the signed-in user may preview in the view-as bar. */
export function viewRoleOptionsForAuthRole(authRole: UserRole | null | undefined): UserRole[] {
  switch (authRole) {
    case "admin":
      return [
        "admin",
        "corporate_management",
        "office_manager",
        "corporate_external",
        "corporate_internal",
        "user",
        "new_user",
        "demo_user",
      ]
    case "corporate_management":
      return ["corporate_management", "office_manager", "corporate_external", "corporate_internal"]
    case "office_manager":
      return ["office_manager", "corporate_external", "corporate_internal", "user"]
    default:
      return []
  }
}

export function canUsePortalViewBar(authRole: UserRole | null | undefined): boolean {
  return viewRoleOptionsForAuthRole(authRole).length > 0
}

/** Which portal shell to render for a preview role. */
export function portalShellForViewRole(viewRole: UserRole): PortalShell {
  if (viewRole === "office_manager" || viewRole === "corporate_management") return "office"
  return "user"
}

/** Default preview role when opening the portal. */
export function defaultViewRoleForAuthRole(authRole: UserRole | null | undefined): UserRole {
  if (!authRole) return "user"
  if (authRole === "admin") return "admin"
  if (authRole === "corporate_management") return "corporate_management"
  if (authRole === "office_manager") return "office_manager"
  return authRole
}

/** User-facing label for the view-as role dropdown (distinct from DB role labels where helpful). */
export function labelForViewRoleOption(role: UserRole, isSelf: boolean): string {
  const base = VIEW_ROLE_OPTION_LABELS[role] ?? labelForProfileRole(role)
  return isSelf ? `${base} (you)` : base
}

const VIEW_ROLE_OPTION_LABELS: Partial<Record<UserRole, string>> = {
  admin: "Platform Admin",
  corporate_management: "Corporate Manager",
  office_manager: "Office Manager",
  corporate_external: "External User",
  corporate_internal: "Internal User",
  user: "User",
  new_user: "New User",
  demo_user: "Demo User",
}

/** Profiles visible in the user picker for the selected preview role. */
export function filterUsersForViewRole(users: ManageableUserRow[], viewRole: UserRole): ManageableUserRow[] {
  switch (viewRole) {
    case "admin":
      return users.filter((u) => u.role === "admin")
    case "corporate_management":
      return users.filter((u) => u.role === "corporate_management")
    case "office_manager":
      return users.filter((u) => u.role === "office_manager" || u.role === "corporate_management")
    case "corporate_external":
      return users.filter((u) => u.role === "corporate_external" || u.role === "user")
    case "corporate_internal":
      return users.filter((u) => u.role === "corporate_internal")
    case "new_user":
      return users.filter((u) => u.role === "new_user")
    case "demo_user":
      return users.filter((u) => u.role === "demo_user")
    case "user":
      return users.filter(
        (u) =>
          u.role === "user" ||
          u.role === "corporate_external" ||
          u.role === "corporate_internal" ||
          u.role === "new_user",
      )
    default:
      return users
  }
}

/**
 * Org-scoped view-as filter — team members are often stored as role `user` but invited as internal.
 * Excludes the account owner when previewing internal/external personas.
 */
export function filterUsersForViewRoleInOrg(
  users: ManageableUserRow[],
  viewRole: UserRole,
  orgOwnerId?: string | null,
): ManageableUserRow[] {
  const ownerId = orgOwnerId?.trim() || null
  const withoutOwner = ownerId ? users.filter((u) => u.userId !== ownerId) : users
  switch (viewRole) {
    case "corporate_internal":
      return withoutOwner.filter(
        (u) =>
          u.role === "corporate_internal" ||
          u.role === "user" ||
          u.role === "new_user",
      )
    case "corporate_external":
      return withoutOwner.filter((u) => u.role === "corporate_external" || u.role === "user")
    case "user":
      return withoutOwner.filter(
        (u) =>
          u.role === "user" ||
          u.role === "corporate_external" ||
          u.role === "corporate_internal" ||
          u.role === "new_user",
      )
    case "office_manager":
      return users.filter((u) => u.role === "office_manager" || u.role === "corporate_management")
    default:
      return filterUsersForViewRole(users, viewRole)
  }
}

/** Whether authRole may preview targetUserId (subscription / assignment rules). */
export function canPreviewUser(
  authRole: UserRole | null | undefined,
  authUserId: string,
  target: ManageableUserRow,
  allUsers: ManageableUserRow[],
): boolean {
  if (!authRole || !authUserId) return false
  if (target.userId === authUserId) return true
  if (authRole === "admin") return true
  if (authRole === "corporate_management" || authRole === "office_manager") {
    return allUsers.some((u) => u.userId === target.userId)
  }
  return false
}

export function roleFromProfileRow(raw: string | null | undefined): UserRole {
  const r = (raw ?? "user").trim()
  if (r in PROFILE_ROLE_LABELS) return r as UserRole
  return "user"
}

/** Account owner / OM at the top of an org roster (for org-scoped view-as filters). */
export function resolveOrgOwnerFromRoster(users: ManageableUserRow[]): string | null {
  const owner = users.find(
    (u) => u.role === "office_manager" || u.role === "corporate_management" || u.role === "user",
  )
  return owner?.userId ?? users[0]?.userId ?? null
}

/**
 * Platform admin: internal / field users are often role `user` but linked in office_manager_clients.
 * teamMemberIds = all user_id values from that table (managed team members, not OMs).
 */
export function filterAdminPlatformUsersForViewRole(
  users: ManageableUserRow[],
  viewRole: UserRole,
  teamMemberIds: ReadonlySet<string>,
): ManageableUserRow[] {
  const isTeamMember = (u: ManageableUserRow) =>
    teamMemberIds.has(u.userId) && !isOfficeManagerAssignmentRole(u.role) && u.role !== "admin"

  switch (viewRole) {
    case "corporate_internal":
      return users.filter((u) => u.role === "corporate_internal" || isTeamMember(u))
    case "corporate_external":
      return users.filter((u) => u.role === "corporate_external" || (isTeamMember(u) && u.role === "user"))
    case "user":
      return users.filter(
        (u) =>
          u.role === "user" ||
          u.role === "corporate_external" ||
          u.role === "corporate_internal" ||
          u.role === "new_user" ||
          isTeamMember(u),
      )
    case "new_user":
      return users.filter((u) => u.role === "new_user")
    case "demo_user":
      return users.filter((u) => u.role === "demo_user")
    default:
      return filterUsersForViewRole(users, viewRole)
  }
}
