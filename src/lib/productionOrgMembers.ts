import type { PortalConfig } from "../types/portal-builder"
import { isSandboxDemoUserId } from "./sandboxDemoTeam"
import { isSandboxProfile } from "./sandboxEnvironment"

export type ProductionProfileRow = {
  id?: string
  role?: string | null
  metadata?: unknown
  portal_config?: unknown
  account_disabled?: boolean | null
}

function asPortalConfig(raw: unknown): PortalConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as PortalConfig
}

function asMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

/** True when the account owner is still in training sandbox mode (demo personas allowed). */
export function isSandboxTrainingOwner(
  portalConfig?: PortalConfig | null,
  metadata?: Record<string, unknown> | null,
  role?: string | null,
): boolean {
  return isSandboxProfile(portalConfig, metadata, role)
}

/**
 * Real profiles that may appear on a live customer's org chart, workflow assignees, and share lists.
 * Excludes demo_user accounts, sandbox/trial workspaces, and fictional sandbox-demo-* persona ids.
 */
export function isProductionLinkableProfile(row: ProductionProfileRow): boolean {
  if (!row.id?.trim()) return false
  if (row.account_disabled === true) return false
  if (isSandboxDemoUserId(row.id)) return false
  if (row.role === "demo_user") return false

  const portalConfig = asPortalConfig(row.portal_config)
  const metadata = asMetadata(row.metadata)
  if (isSandboxProfile(portalConfig, metadata, row.role)) return false
  if (portalConfig?.demo_account === true) return false
  if (metadata?.demo_account === true) return false
  if (metadata?.demo_communications_blocked === true) return false

  return true
}
