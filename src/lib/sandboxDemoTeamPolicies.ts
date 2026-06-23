import { mergeOmCalendarPolicy, parseOmCalendarPolicy, type OmCalendarPolicyV1 } from "./teamCalendarPolicy"

/** Demo persona permissions — stored on the signed-in account `profiles.metadata` (no profiles row for demo IDs). */
export const SANDBOX_DEMO_TEAM_POLICIES_META_KEY = "sandbox_demo_team_policies_v1"

export type SandboxDemoTeamPoliciesV1 = Record<string, Partial<OmCalendarPolicyV1>>

export function parseSandboxDemoTeamPolicies(raw: unknown): SandboxDemoTeamPoliciesV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: SandboxDemoTeamPoliciesV1 = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim() || !val || typeof val !== "object" || Array.isArray(val)) continue
    out[key] = val as Partial<OmCalendarPolicyV1>
  }
  return out
}

export function mergeSandboxDemoTeamPolicy(
  ownerMetadata: unknown,
  demoUserId: string,
  patch: Partial<OmCalendarPolicyV1>,
): Record<string, unknown> {
  const base =
    ownerMetadata && typeof ownerMetadata === "object" && !Array.isArray(ownerMetadata)
      ? { ...(ownerMetadata as Record<string, unknown>) }
      : {}
  const prev = parseSandboxDemoTeamPolicies(base[SANDBOX_DEMO_TEAM_POLICIES_META_KEY])
  const mergedPolicy = mergeOmCalendarPolicy({ om_calendar_policy: prev[demoUserId] ?? {} }, patch)
  const nextPolicies: SandboxDemoTeamPoliciesV1 = {
    ...prev,
    [demoUserId]: parseOmCalendarPolicy(mergedPolicy),
  }
  base[SANDBOX_DEMO_TEAM_POLICIES_META_KEY] = nextPolicies
  return base
}

export function metadataForDemoTeamPolicy(policy: Partial<OmCalendarPolicyV1>): Record<string, unknown> {
  return { om_calendar_policy: parseOmCalendarPolicy({ om_calendar_policy: policy }) }
}

export function resolveDemoTeamPolicyFromOwnerMetadata(
  ownerMetadata: unknown,
  demoUserId: string,
): OmCalendarPolicyV1 {
  const policies = parseSandboxDemoTeamPolicies(
    ownerMetadata && typeof ownerMetadata === "object" && !Array.isArray(ownerMetadata)
      ? (ownerMetadata as Record<string, unknown>)[SANDBOX_DEMO_TEAM_POLICIES_META_KEY]
      : null,
  )
  return parseOmCalendarPolicy(metadataForDemoTeamPolicy(policies[demoUserId] ?? {}))
}
