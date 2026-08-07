/**
 * Create a user via the admin-users Edge Function (service role + confirmed email + profiles upsert).
 * Falls back to client signUp when the function is not deployed (404) or unreachable.
 */
export type EdgeCreateUserOk = { ok: true; user: { id: string; email?: string; role: string } }
export type EdgeCreateUserErr = { ok: false; fallbackToSignUp: boolean; error: string }

export async function createUserViaAdminUsersEdge(
  supabaseUrl: string,
  accessToken: string,
  payload: { email: string; password: string; role: string; display_name?: string | null }
): Promise<EdgeCreateUserOk | EdgeCreateUserErr> {
  if (!supabaseUrl.trim()) {
    return { ok: false, fallbackToSignUp: true, error: "" }
  }
  try {
    const body: Record<string, string> = {
      email: payload.email,
      password: payload.password,
      role: payload.role,
    }
    const dn = payload.display_name?.trim()
    if (dn) body.display_name = dn

    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      user?: { id: string; email?: string; role: string }
    }
    if (res.ok && data.user?.id) {
      return { ok: true, user: data.user }
    }
    const errMsg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`
    if (res.status === 404) {
      return { ok: false, fallbackToSignUp: true, error: errMsg }
    }
    return { ok: false, fallbackToSignUp: false, error: errMsg }
  } catch {
    return { ok: false, fallbackToSignUp: true, error: "Network error" }
  }
}

export type GraduateSandboxEdgeOk = {
  ok: true
  role: string
  portal_config: Record<string, unknown>
}

/** Assign office manager (Admin Users ↔ MyT Team members stay in sync). */
export async function assignOfficeManagerViaAdminUsersEdge(
  supabaseUrl: string,
  accessToken: string,
  managedUserId: string,
  officeManagerId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = supabaseUrl.replace(/\/$/, "")
  if (!base) return { ok: false, error: "Missing Supabase URL" }
  try {
    const res = await fetch(`${base}/functions/v1/admin-users`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: managedUserId,
        action: "assign_office_manager",
        office_manager_id: officeManagerId,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (res.ok && data.ok === true) return { ok: true }
    return { ok: false, error: typeof data.error === "string" ? data.error : `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

/** @deprecated Use assignOfficeManagerViaAdminUsersEdge */
export async function syncTeamMemberViaAdminUsersEdge(
  supabaseUrl: string,
  accessToken: string,
  managedUserId: string,
  officeManagerId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return assignOfficeManagerViaAdminUsersEdge(supabaseUrl, accessToken, managedUserId, officeManagerId)
}

/** Graduate a training sandbox account to live production mode via admin-users Edge. */
export async function graduateSandboxToLiveViaAdminUsersEdge(
  supabaseUrl: string,
  accessToken: string,
  userId: string,
): Promise<GraduateSandboxEdgeOk | { ok: false; error: string; tryDirectDb: boolean }> {
  const base = supabaseUrl.replace(/\/$/, "")
  if (!base) return { ok: false, error: "Missing Supabase URL", tryDirectDb: true }
  try {
    const res = await fetch(`${base}/functions/v1/admin-users`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, action: "graduate_sandbox_to_live" }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      role?: string
      portal_config?: Record<string, unknown>
    }
    if (res.ok && data.ok === true && typeof data.role === "string") {
      return {
        ok: true,
        role: data.role,
        portal_config: data.portal_config && typeof data.portal_config === "object" ? data.portal_config : {},
      }
    }
    const errMsg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`
    if (res.status === 404) return { ok: false, error: errMsg, tryDirectDb: true }
    return { ok: false, error: errMsg, tryDirectDb: false }
  } catch {
    return { ok: false, error: "Network error", tryDirectDb: true }
  }
}

export type PurgeSandboxSampleDataOk = {
  ok: true
  customers_removed: number
  metadata_cleaned?: boolean
}

/** Remove leftover sandbox sample customers/users for an account that already graduated to live. */
export async function purgeSandboxSampleDataViaAdminUsersEdge(
  supabaseUrl: string,
  accessToken: string,
  userId: string,
): Promise<PurgeSandboxSampleDataOk | { ok: false; error: string }> {
  const base = supabaseUrl.replace(/\/$/, "")
  if (!base) return { ok: false, error: "Missing Supabase URL" }
  try {
    const res = await fetch(`${base}/functions/v1/admin-users`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, action: "purge_sandbox_sample_data" }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      customers_removed?: number
      metadata_cleaned?: boolean
    }
    if (res.ok && data.ok === true) {
      return {
        ok: true,
        customers_removed: typeof data.customers_removed === "number" ? data.customers_removed : 0,
        metadata_cleaned: data.metadata_cleaned === true,
      }
    }
    return { ok: false, error: typeof data.error === "string" ? data.error : `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: "Network error" }
  }
}

/** Set profiles.account_disabled via admin-users Edge (service role; bypasses RLS). */
export async function patchAccountDisabledViaAdminUsersEdge(
  supabaseUrl: string,
  accessToken: string,
  userId: string,
  accountDisabled: boolean
): Promise<{ ok: true } | { ok: false; error: string; tryDirectDb: boolean }> {
  const base = supabaseUrl.replace(/\/$/, "")
  if (!base) return { ok: false, error: "Missing Supabase URL", tryDirectDb: true }
  try {
    const res = await fetch(`${base}/functions/v1/admin-users`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, account_disabled: accountDisabled }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    if (res.ok && data.ok === true) return { ok: true }
    const errMsg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`
    if (res.status === 404) return { ok: false, error: errMsg, tryDirectDb: true }
    return { ok: false, error: errMsg, tryDirectDb: false }
  } catch {
    return { ok: false, error: "Network error", tryDirectDb: true }
  }
}
