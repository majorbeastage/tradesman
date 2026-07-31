import { isSandboxProfile } from "./sandboxEnvironment"
import type { PortalConfig } from "../types/portal-builder"

export type GraduateSandboxProfileInput = {
  role?: string | null
  portal_config?: PortalConfig | null
  metadata?: Record<string, unknown> | null
}

export type GraduateSandboxProfileResult = {
  role: string
  portal_config: PortalConfig
  metadata: Record<string, unknown>
}

export function isGraduateSandboxCandidate(
  portalConfig?: PortalConfig | null,
  metadata?: Record<string, unknown> | null,
  role?: string | null,
): boolean {
  return isSandboxProfile(portalConfig, metadata, role)
}

/** Returns null when the profile is not in sandbox mode. */
export function buildGraduateSandboxProfileUpdates(
  row: GraduateSandboxProfileInput,
): GraduateSandboxProfileResult | null {
  if (!isGraduateSandboxCandidate(row.portal_config, row.metadata, row.role)) return null

  const prevPc: PortalConfig =
    row.portal_config && typeof row.portal_config === "object" && !Array.isArray(row.portal_config)
      ? { ...row.portal_config }
      : {}
  const prevMeta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...row.metadata }
      : {}

  const { sandbox_account: _sa, ...portalWithoutSandboxFlag } = prevPc as PortalConfig & {
    sandbox_account?: boolean
  }
  void _sa

  const nextPortal: PortalConfig = {
    ...portalWithoutSandboxFlag,
    demo_account: false,
    tabs: {
      ...(portalWithoutSandboxFlag.tabs ?? {}),
      leads: true,
      conversations: true,
    },
  }

  const nextMeta = { ...prevMeta }
  delete nextMeta.sandbox_account
  delete nextMeta.sandbox_expires_at
  delete nextMeta.sandbox_workspace_v1
  delete nextMeta.demo_communications_blocked
  delete nextMeta.sandbox_demo_team
  delete nextMeta.sandbox_demo_locations_v1
  delete nextMeta.sandbox_demo_team_policies_v1
  nextMeta.graduated_from_sandbox_at = new Date().toISOString()

  let role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : "user"
  if (role === "sandbox_user") role = "user"

  return { role, portal_config: nextPortal, metadata: nextMeta }
}
