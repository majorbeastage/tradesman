/** Training sandbox — full CRM with simulated comms and live-feeling inbound traffic. */

export const SANDBOX_META_KEY = "sandbox_workspace_v1"
export const SANDBOX_ZIP = "99901"
export const SANDBOX_CITY = "Tradesman Demo"
export const SANDBOX_STATE = "TX"

export type SandboxWorkspaceMeta = {
  v: 1
  companyName?: string
  seededAt?: string
  liveTrafficEnabled?: boolean
  liveTrafficIntervalMinutes?: number
  lastTrafficAt?: string
  embedLeadSlug?: string
  /** When true, org-chart / workflow demo personas auto-advance assigned steps. */
  dummyUsersAutopilotEnabled?: boolean
  dummyUsersAutopilotIntervalMinutes?: number
  dummyUsersAutopilotLastAt?: string
  /** Leadership-granted capabilities for demo personas (all default on when autopilot enabled). */
  dummyUsersAutopilotPermissions?: {
    approveEstimates?: boolean
    completeFieldJobs?: boolean
    customerReplies?: boolean
    invoicing?: boolean
  }
}

export function parseSandboxMeta(raw: unknown): SandboxWorkspaceMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  return {
    v: 1,
    companyName: typeof o.companyName === "string" ? o.companyName : undefined,
    seededAt: typeof o.seededAt === "string" ? o.seededAt : undefined,
    liveTrafficEnabled: o.liveTrafficEnabled !== false,
    liveTrafficIntervalMinutes:
      typeof o.liveTrafficIntervalMinutes === "number" ? o.liveTrafficIntervalMinutes : undefined,
    lastTrafficAt: typeof o.lastTrafficAt === "string" ? o.lastTrafficAt : undefined,
    embedLeadSlug: typeof o.embedLeadSlug === "string" ? o.embedLeadSlug : undefined,
    dummyUsersAutopilotEnabled: o.dummyUsersAutopilotEnabled === true,
    dummyUsersAutopilotIntervalMinutes:
      typeof o.dummyUsersAutopilotIntervalMinutes === "number" ? o.dummyUsersAutopilotIntervalMinutes : undefined,
    dummyUsersAutopilotLastAt: typeof o.dummyUsersAutopilotLastAt === "string" ? o.dummyUsersAutopilotLastAt : undefined,
    dummyUsersAutopilotPermissions:
      o.dummyUsersAutopilotPermissions && typeof o.dummyUsersAutopilotPermissions === "object"
        ? (o.dummyUsersAutopilotPermissions as SandboxWorkspaceMeta["dummyUsersAutopilotPermissions"])
        : undefined,
  }
}

export function isSandboxProfile(
  portalConfig?: { sandbox_account?: boolean; demo_account?: boolean } | null,
  metadata?: Record<string, unknown> | null,
  role?: string | null,
): boolean {
  if (portalConfig?.sandbox_account === true) return true
  if (metadata?.sandbox_account === true) return true
  if (typeof metadata?.sandbox_expires_at === "string" && metadata.sandbox_expires_at.trim()) return true
  if (role === "sandbox_user") return true
  if (parseSandboxMeta(metadata?.[SANDBOX_META_KEY]) != null) return true
  return false
}

export function mergeSandboxMeta(
  prevMeta: Record<string, unknown>,
  patch: Partial<SandboxWorkspaceMeta>,
): Record<string, unknown> {
  const prev = parseSandboxMeta(prevMeta[SANDBOX_META_KEY]) ?? { v: 1 as const }
  return {
    ...prevMeta,
    sandbox_account: true,
    [SANDBOX_META_KEY]: { ...prev, ...patch, v: 1 },
  }
}
