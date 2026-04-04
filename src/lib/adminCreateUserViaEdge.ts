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
