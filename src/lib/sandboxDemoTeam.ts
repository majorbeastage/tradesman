import type { UserRole } from "../contexts/AuthContext"
import type { ManageableUserRow } from "./portalViewRules"

export const SANDBOX_DEMO_USER_ID_PREFIX = "sandbox-demo-"

export type SandboxDemoTeamMember = {
  id: string
  label: string
  role: UserRole
  email: string
  title?: string
}

export const DEFAULT_SANDBOX_DEMO_TEAM: SandboxDemoTeamMember[] = [
  {
    id: "sandbox-demo-office-maria",
    label: "Maria Ortiz",
    title: "Office manager",
    role: "office_manager",
    email: "maria.demo@example.invalid",
  },
  {
    id: "sandbox-demo-field-jake",
    label: "Jake Miller",
    title: "Field technician",
    role: "user",
    email: "jake.demo@example.invalid",
  },
  {
    id: "sandbox-demo-field-sam",
    label: "Sam Rivera",
    title: "External contractor",
    role: "corporate_external",
    email: "sam.demo@example.invalid",
  },
  {
    id: "sandbox-demo-internal-lee",
    label: "Lee Chen",
    title: "Internal staff",
    role: "corporate_internal",
    email: "lee.demo@example.invalid",
  },
]

export function isSandboxDemoUserId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(SANDBOX_DEMO_USER_ID_PREFIX))
}

/** Real Supabase auth user IDs only — excludes sandbox demo persona IDs. */
export function filterRealUserIds(ids: string[]): string[] {
  return ids.filter((id) => id && !isSandboxDemoUserId(id))
}

/** Map sandbox demo preview IDs to the signed-in user for DB reads/writes. */
export function resolveSandboxDataUserId(scopedId: string | null | undefined, authUserId: string): string {
  if (!scopedId || isSandboxDemoUserId(scopedId)) return authUserId
  return scopedId
}

export function parseSandboxDemoTeam(raw: unknown): SandboxDemoTeamMember[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SANDBOX_DEMO_TEAM
  const out: SandboxDemoTeamMember[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue
    const o = row as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : ""
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const role = typeof o.role === "string" ? (o.role as UserRole) : "user"
    const email = typeof o.email === "string" ? o.email : ""
    if (!id.startsWith(SANDBOX_DEMO_USER_ID_PREFIX) || !label) continue
    out.push({
      id,
      label,
      role,
      email,
      title: typeof o.title === "string" ? o.title : undefined,
    })
  }
  return out.length > 0 ? out : DEFAULT_SANDBOX_DEMO_TEAM
}

export function sandboxDemoTeamToManageableRows(team: SandboxDemoTeamMember[]): ManageableUserRow[] {
  return team.map((m) => ({
    userId: m.id,
    label: `${m.label} (demo)`,
    email: m.email,
    role: m.role,
    clientId: null,
    isSelf: false,
  }))
}

export function sandboxDemoMemberById(
  team: SandboxDemoTeamMember[],
  id: string | null | undefined,
): SandboxDemoTeamMember | null {
  if (!id) return null
  return team.find((m) => m.id === id) ?? null
}
