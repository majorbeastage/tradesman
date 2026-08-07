/** Shared logic: detect training sandbox profiles and graduate them to live production mode. */

const SANDBOX_DEMO_USER_ID_PREFIX = "sandbox-demo-"
const ORG_CHART_META_KEY = "organization_chart_v1"

function stripSandboxDemoLinksFromMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const raw = meta[ORG_CHART_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return meta
  const doc = raw as { nodes?: unknown[]; updated_at?: string; [k: string]: unknown }
  if (!Array.isArray(doc.nodes)) return meta
  let changed = false
  const nodes = doc.nodes.map((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node
    const row = node as { linkedUserId?: string | null; [k: string]: unknown }
    if (typeof row.linkedUserId === "string" && row.linkedUserId.startsWith(SANDBOX_DEMO_USER_ID_PREFIX)) {
      changed = true
      return { ...row, linkedUserId: null }
    }
    return node
  })
  if (!changed) return meta
  return {
    ...meta,
    [ORG_CHART_META_KEY]: { ...doc, nodes, updated_at: new Date().toISOString() },
  }
}

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
  const cleanedMeta = stripSandboxDemoLinksFromMetadata(prevMeta)

  let role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : "user"
  if (role === "sandbox_user") role = "user"

  return { role, portal_config: prevPc, metadata: cleanedMeta }
}

/** Remove leftover sandbox persona metadata from a live profile (org chart links, demo team keys). */
export function cleanupSandboxTrainingMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const next = { ...meta }
  delete next.sandbox_account
  delete next.sandbox_expires_at
  delete next.sandbox_workspace_v1
  delete next.demo_communications_blocked
  delete next.sandbox_demo_team
  delete next.sandbox_demo_locations_v1
  delete next.sandbox_demo_team_policies_v1
  return stripSandboxDemoLinksFromMetadata(next)
}
