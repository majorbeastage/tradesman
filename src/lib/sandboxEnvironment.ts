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
}

export function parseSandboxMeta(raw: unknown): SandboxWorkspaceMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  return {
    v: 1,
    companyName: typeof o.companyName === "string" ? o.companyName : undefined,
    seededAt: typeof o.seededAt === "string" ? o.seededAt : undefined,
    liveTrafficEnabled: o.liveTrafficEnabled === true,
    liveTrafficIntervalMinutes:
      typeof o.liveTrafficIntervalMinutes === "number" ? o.liveTrafficIntervalMinutes : undefined,
    lastTrafficAt: typeof o.lastTrafficAt === "string" ? o.lastTrafficAt : undefined,
    embedLeadSlug: typeof o.embedLeadSlug === "string" ? o.embedLeadSlug : undefined,
  }
}

export function isSandboxProfile(
  portalConfig?: { sandbox_account?: boolean; demo_account?: boolean } | null,
  metadata?: Record<string, unknown> | null,
  role?: string | null,
): boolean {
  if (portalConfig?.sandbox_account === true) return true
  if (metadata?.sandbox_account === true) return true
  if (role === "sandbox_user") return true
  return parseSandboxMeta(metadata?.[SANDBOX_META_KEY]) != null && metadata?.sandbox_account !== false
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
