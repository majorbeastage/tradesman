import type { PortalConfig } from "../../types/portal-builder"

/** Every profile (all roles). Replaces the old ambiguous "all users" scope. */
export const ALL_PROFILES_ID = "__all_profiles__"
/** Profiles with role `user` only (contractors), not office_manager / admin / new_user / demo_user. */
export const ALL_USERS_ID = "__all__"
export const ALL_OFFICE_MANAGERS_ID = "__all_office_managers__"
export const ALL_NEW_USERS_ID = "__all_new_users__"
export const ALL_ADMINS_ID = "__all_admins__"

export type ProfileRowLike = { id: string; role: string; portal_config?: PortalConfig | null }

export function isBulkPortalAudienceId(id: string): boolean {
  return (
    id === ALL_PROFILES_ID ||
    id === ALL_USERS_ID ||
    id === ALL_OFFICE_MANAGERS_ID ||
    id === ALL_NEW_USERS_ID ||
    id === ALL_ADMINS_ID
  )
}

/** True when the sidebar selection is a real auth profile UUID */
export function isProfileUserId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export function profilesMatchingPortalAudience(rows: ProfileRowLike[], audienceId: string): ProfileRowLike[] {
  if (audienceId === ALL_PROFILES_ID) return rows
  if (audienceId === ALL_USERS_ID) return rows.filter((p) => p.role === "user")
  if (audienceId === ALL_OFFICE_MANAGERS_ID) return rows.filter((p) => p.role === "office_manager")
  if (audienceId === ALL_NEW_USERS_ID) return rows.filter((p) => p.role === "new_user")
  if (audienceId === ALL_ADMINS_ID) return rows.filter((p) => p.role === "admin")
  return []
}

export function labelForPortalAudience(audienceId: string): string {
  if (audienceId === ALL_PROFILES_ID) return "All profiles — every account (all roles)"
  if (audienceId === ALL_USERS_ID) return "All users — profiles with role user only"
  if (audienceId === ALL_OFFICE_MANAGERS_ID) return "All office managers — portal defaults for every office_manager role"
  if (audienceId === ALL_NEW_USERS_ID) return "All new users — everyone with role new_user"
  if (audienceId === ALL_ADMINS_ID) return "All admins — every profile with role admin"
  return audienceId
}
