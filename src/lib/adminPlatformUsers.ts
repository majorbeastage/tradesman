import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "../contexts/AuthContext"
import { resolveInternalMemberLabel } from "./profileContactMeta"
import type { OrganizationPeer } from "./organizationPeers"

const CACHE_MS = 5 * 60 * 1000
let cache: { at: number; excludeId: string; rows: OrganizationPeer[] } | null = null

export function invalidateAdminPlatformUsersCache(): void {
  cache = null
}

function mapRow(u: {
  id: string
  email?: string | null
  display_name?: string | null
  role?: string | null
  account_disabled?: boolean | null
}): OrganizationPeer | null {
  if (!u.id || u.account_disabled === true) return null
  return {
    id: u.id,
    displayName: resolveInternalMemberLabel({
      display_name: u.display_name,
      email: u.email,
      metadata: null,
    }),
    email: u.email ?? null,
    role: (typeof u.role === "string" ? u.role : "user") as UserRole,
  }
}

/**
 * Platform admins: every Tradesman user (for messenger + calendar video/conference invites).
 */
export async function loadAdminPlatformUsers(
  supabase: SupabaseClient,
  accessToken: string,
  excludeUserId?: string | null,
): Promise<OrganizationPeer[]> {
  const excludeId = excludeUserId?.trim() ?? ""
  const now = Date.now()
  if (cache && cache.excludeId === excludeId && now - cache.at < CACHE_MS) {
    return cache.rows
  }

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ?? ""
  let rows: OrganizationPeer[] = []

  if (supabaseUrl && accessToken.trim()) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = (await res.json().catch(() => ({}))) as {
        users?: Array<{
          id: string
          email?: string | null
          display_name?: string | null
          role?: string | null
          account_disabled?: boolean
        }>
      }
      if (res.ok && Array.isArray(data.users)) {
        rows = data.users.map(mapRow).filter((r): r is OrganizationPeer => r != null)
      }
    } catch {
      /* fall through */
    }
  }

  if (rows.length === 0) {
    try {
      const { data } = await supabase
        .from("admin_users_list")
        .select("id, email, display_name, role, account_disabled")
        .eq("account_disabled", false)
        .order("email")
        .limit(500)
      rows = (data ?? []).map(mapRow).filter((r): r is OrganizationPeer => r != null)
    } catch {
      rows = []
    }
  }

  if (excludeId) rows = rows.filter((r) => r.id !== excludeId)
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName))
  cache = { at: now, excludeId, rows }
  return rows
}
