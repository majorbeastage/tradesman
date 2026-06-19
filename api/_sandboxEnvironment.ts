import type { SupabaseClient } from "@supabase/supabase-js"

export type SandboxProfileRow = {
  role?: string
  metadata?: Record<string, unknown> | null
  portal_config?: { sandbox_account?: boolean; demo_account?: boolean } | null
}

export function isSandboxProfileRow(row: SandboxProfileRow | null | undefined): boolean {
  if (!row) return false
  if (row.role === "sandbox_user") return true
  if (row.portal_config?.sandbox_account === true) return true
  if (row.metadata?.sandbox_account === true) return true
  if (typeof row.metadata?.sandbox_expires_at === "string" && row.metadata.sandbox_expires_at.trim()) return true
  const meta = row.metadata?.sandbox_workspace_v1
  if (meta && typeof meta === "object") return true
  return false
}

export async function isSandboxUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId.trim()) return false
  const { data } = await supabase
    .from("profiles")
    .select("role, metadata, portal_config")
    .eq("id", userId.trim())
    .maybeSingle()
  return isSandboxProfileRow(data as SandboxProfileRow | null)
}

/** Demo blocks comms; sandbox uses simulated comms instead. */
export async function isDemoOnlyRestrictedUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId.trim()) return false
  const { data } = await supabase
    .from("profiles")
    .select("role, metadata, portal_config")
    .eq("id", userId.trim())
    .maybeSingle()
  const row = data as SandboxProfileRow | null
  if (isSandboxProfileRow(row)) return false
  if (row?.role === "demo_user") return true
  if (row?.portal_config?.demo_account === true) return true
  if (row?.metadata?.demo_account === true) return true
  if (row?.metadata?.demo_communications_blocked === true) return true
  return false
}
