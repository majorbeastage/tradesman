import type { UserRole } from "../contexts/AuthContext"

/** Roles that use the office-manager portal shell (team oversight, Operations, etc.). */
export const OFFICE_MANAGER_LIKE_ROLES: UserRole[] = [
  "office_manager",
  "admin",
  "corporate_management",
]

/** Managed users that can be assigned to an office manager / corporate management account. */
export const MANAGED_USER_ROLES: UserRole[] = [
  "user",
  "new_user",
  "demo_user",
  "corporate_external",
  "corporate_internal",
]

/** Accounts selectable in the Office manager column on Users & office managers. */
export const OFFICE_MANAGER_ASSIGNMENT_ROLES: UserRole[] = [
  "office_manager",
  "admin",
  "corporate_management",
]

export const PROFILE_ROLE_LABELS: Record<UserRole, string> = {
  user: "User",
  new_user: "New User",
  demo_user: "Demo user",
  office_manager: "Office Manager",
  admin: "Admin",
  corporate_management: "Corporate Management",
  corporate_external: "Corporate External",
  corporate_internal: "Corporate Internal",
}

export function isOfficeManagerLikeRole(role: string | null | undefined): boolean {
  if (!role) return false
  return (OFFICE_MANAGER_LIKE_ROLES as readonly string[]).includes(role)
}

export function isManagedUserRole(role: string | null | undefined): boolean {
  if (!role) return false
  return (MANAGED_USER_ROLES as readonly string[]).includes(role)
}

export function isOfficeManagerAssignmentRole(role: string | null | undefined): boolean {
  if (!role) return false
  return (OFFICE_MANAGER_ASSIGNMENT_ROLES as readonly string[]).includes(role)
}

export function labelForProfileRole(role: string | null | undefined): string {
  if (!role) return "—"
  if (role in PROFILE_ROLE_LABELS) return PROFILE_ROLE_LABELS[role as UserRole]
  return role
}

/** True only for the dedicated admin portal shell (not office manager / corporate). */
export function isAdminPortalRole(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin"
}

/** Route signed-in users to the office-manager app shell when appropriate. */
export function shouldUseOfficeManagerPortal(role: string | null | undefined): boolean {
  return role === "office_manager" || role === "corporate_management"
}
