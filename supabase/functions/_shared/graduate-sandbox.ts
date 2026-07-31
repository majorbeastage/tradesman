/** Shared logic: detect training sandbox profiles and graduate them to live production mode. */

export type GraduateSandboxRow = {
  role?: string | null
  metadata?: Record<string, unknown> | null
  portal_config?: Record<string, unknown> | null
}

export function isSandboxProfileRow(row: GraduateSandboxRow | null | undefined): boolean {
  if (!row) return false
  if (row.role === "sandbox_user") return true
  const pc = row.portal_config
  if (pc && typeof pc === "object" && pc.sandbox_account === true) return true
  const meta = row.metadata
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false
  if (meta.sandbox_account === true) return true
  if (typeof meta.sandbox_expires_at === "string" && meta.sandbox_expires_at.trim()) return true
  const workspace = meta.sandbox_workspace_v1
  if (workspace && typeof workspace === "object") return true
  return false
}

export type GraduateSandboxResult = {
  role: string
  portal_config: Record<string, unknown>
  metadata: Record<string, unknown>
}

/** Returns null when the profile is not in sandbox mode. */
export function buildGraduateSandboxUpdates(row: GraduateSandboxRow): GraduateSandboxResult | null {
  if (!isSandboxProfileRow(row)) return null

  const prevPc =
    row.portal_config && typeof row.portal_config === "object" && !Array.isArray(row.portal_config)
      ? { ...(row.portal_config as Record<string, unknown>) }
      : {}
  const prevMeta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}

  delete prevPc.sandbox_account
  prevPc.demo_account = false

  const tabsRaw = prevPc.tabs
  const tabs =
    tabsRaw && typeof tabsRaw === "object" && !Array.isArray(tabsRaw)
      ? { ...(tabsRaw as Record<string, unknown>) }
      : {}
  tabs.leads = true
  tabs.conversations = true
  prevPc.tabs = tabs

  delete prevMeta.sandbox_account
  delete prevMeta.sandbox_expires_at
  delete prevMeta.sandbox_workspace_v1
  delete prevMeta.demo_communications_blocked
  delete prevMeta.sandbox_demo_team
  delete prevMeta.sandbox_demo_locations_v1
  delete prevMeta.sandbox_demo_team_policies_v1
  prevMeta.graduated_from_sandbox_at = new Date().toISOString()

  let role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : "user"
  if (role === "sandbox_user") role = "user"

  return { role, portal_config: prevPc, metadata: prevMeta }
}
