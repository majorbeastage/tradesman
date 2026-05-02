import { parseOmCalendarPolicy } from "./teamCalendarPolicy"

/**
 * Standalone Estimates (Quotes) tab: non–office-manager users always have access.
 * When the user is managed by an office manager, the tool is available only if
 * `metadata.om_calendar_policy.allow_estimates_tool === true` (set from Scheduling → team card → Edit permissions).
 */
export function estimatesToolAllowedForUser(managedByOfficeManager: boolean, profileMetadata: unknown): boolean {
  if (!managedByOfficeManager) return true
  return parseOmCalendarPolicy(profileMetadata).allow_estimates_tool === true
}
