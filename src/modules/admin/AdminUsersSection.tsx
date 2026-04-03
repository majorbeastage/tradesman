import { useState, useEffect, useMemo } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { createUserViaAdminUsersEdge } from "../../lib/adminCreateUserViaEdge"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""

type UserRow = {
  id: string
  email: string | null
  created_at: string
  role: string
  display_name: string | null
}

/** `profiles.display_name` is stored as "First Last" from admin create; split for table columns. */
function splitDisplayName(displayName: string | null | undefined): { first: string; last: string } {
  const t = displayName?.trim() ?? ""
  if (!t) return { first: "—", last: "—" }
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: "—" }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

function userRowSearchText(u: UserRow): string {
  const dn = u.display_name?.trim() ?? ""
  const parts = dn ? dn.split(/\s+/) : []
  const first = parts[0] ?? ""
  const last = parts.length > 1 ? parts.slice(1).join(" ") : ""
  return [dn, first, last, u.email ?? "", u.role, u.id].join(" ").toLowerCase()
}

export default function AdminUsersSection() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("") // loading user list (don't overwrite create success)
  const [error, setError] = useState("") // create user / office manager assignment
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"user" | "new_user" | "office_manager" | "admin">("user")
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  /** user_id (managed user) → office_manager_id */
  const [omByUserId, setOmByUserId] = useState<Record<string, string>>({})
  const [updatingOmUserId, setUpdatingOmUserId] = useState<string | null>(null)
  const [userTableSearch, setUserTableSearch] = useState("")

  async function loadUsers() {
    if (!session?.access_token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError("")
    try {
      if (supabaseUrl) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
            method: "GET",
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const data = (await res.json().catch(() => ({}))) as { users?: Partial<UserRow>[] }
          if (res.ok && Array.isArray(data.users) && data.users.length > 0) {
            const rows: UserRow[] = data.users.map((u) => ({
              id: u.id as string,
              email: u.email ?? null,
              created_at: u.created_at ?? "",
              role: (u.role as string) ?? "user",
              display_name: u.display_name ?? null,
            }))
            setUsers(rows)
            return
          }
        } catch {
          // Fall through to DB queries below.
        }
      }
      if (!supabase) {
        setLoadError("Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env")
        setUsers([])
        setLoading(false)
        return
      }
      const { data: list } = await supabase
        .from("admin_users_list")
        .select("id, email, created_at, role, display_name")
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, role, display_name, created_at")

      const merged = new Map<string, UserRow>()
      for (const row of (list ?? []) as UserRow[]) {
        merged.set(row.id, { ...row })
      }
      for (const p of (profiles ?? []) as Array<{ id: string; email?: string | null; role: string; display_name: string | null; created_at?: string }>) {
        const prev = merged.get(p.id)
        merged.set(p.id, {
          id: p.id,
          email: prev?.email ?? p.email ?? null,
          created_at: p.created_at ?? prev?.created_at ?? "",
          role: p.role ?? prev?.role ?? "user",
          display_name: p.display_name ?? prev?.display_name ?? null,
        })
      }

      const rows = Array.from(merged.values())
      if (rows.length > 0) {
        setUsers(rows)
        return
      }
      if (profilesError) setLoadError(profilesError.message)
      setUsers([])
    } catch (e) {
      setLoadError("Could not load user list. New users you create will still appear below.")
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [session?.access_token])

  const userIdsKey = users
    .map((u) => u.id)
    .sort()
    .join(",")

  useEffect(() => {
    if (!supabase || users.length === 0) {
      setOmByUserId({})
      return
    }
    const ids = users.map((u) => u.id)
    void supabase
      .from("office_manager_clients")
      .select("user_id, office_manager_id")
      .in("user_id", ids)
      .then(({ data, error }) => {
        if (error || !data) return
        const m: Record<string, string> = {}
        for (const r of data as { user_id: string; office_manager_id: string }[]) m[r.user_id] = r.office_manager_id
        setOmByUserId(m)
      })
  }, [userIdsKey])

  const officeManagerCandidates = users.filter((u) => u.role === "office_manager" || u.role === "admin")

  async function handleTableRoleChange(userId: string, nextRole: string) {
    if (!supabase) return
    const row = users.find((u) => u.id === userId)
    const prevRole = row?.role ?? "user"
    const involvesAdmin = nextRole === "admin" || prevRole === "admin"
    if (involvesAdmin) {
      const ok = window.confirm(
        "Admin access changes must be approved by joe@tradesman-us.com before they are considered final. Email notifications are not wired yet—only proceed if you have explicit approval.\n\nApply this role change in the database now?"
      )
      if (!ok) return
    }
    setRoleSavingUserId(userId)
    setError("")
    try {
      const { error: err } = await supabase.from("profiles").update({ role: nextRole, updated_at: new Date().toISOString() }).eq("id", userId)
      if (err) {
        setError(err.message)
        return
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)))
    } finally {
      setRoleSavingUserId(null)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = userTableSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => userRowSearchText(u).includes(q))
  }, [users, userTableSearch])

  async function handleSetOfficeManager(managedUserId: string, officeManagerId: string | null) {
    if (!supabase) return
    setError("")
    setUpdatingOmUserId(managedUserId)
    const { error: delErr } = await supabase.from("office_manager_clients").delete().eq("user_id", managedUserId)
    if (delErr) {
      setError(delErr.message)
      setUpdatingOmUserId(null)
      return
    }
    if (officeManagerId) {
      const { error: insErr } = await supabase
        .from("office_manager_clients")
        .insert({ office_manager_id: officeManagerId, user_id: managedUserId })
      if (insErr) {
        setError(insErr.message)
        setUpdatingOmUserId(null)
        return
      }
    }
    setOmByUserId((prev) => {
      const next = { ...prev }
      if (officeManagerId) next[managedUserId] = officeManagerId
      else delete next[managedUserId]
      return next
    })
    setUpdatingOmUserId(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    const first = firstName.trim()
    const last = lastName.trim()
    if (!first || !last || !email.trim() || !password) {
      setError("First name, last name, email, and password are required.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (!session?.access_token) {
      setError("Not signed in.")
      return
    }
    setSubmitting(true)
    const trimmedEmail = email.trim()
    const displayName = `${first} ${last}`.trim()
    let userCreatedId: string | null = null
    const priorSession =
      session?.access_token && session?.refresh_token && session.user?.id
        ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            userId: session.user.id,
          }
        : null

    try {
      if (!supabase) {
        setError("Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env")
        return
      }

      let newUserId: string | null = null
      let skipProfileUpsert = false
      if (session.access_token && supabaseUrl) {
        const edge = await createUserViaAdminUsersEdge(supabaseUrl, session.access_token, {
          email: trimmedEmail,
          password,
          role,
          display_name: displayName,
        })
        if (edge.ok) {
          newUserId = edge.user.id
          userCreatedId = newUserId
          skipProfileUpsert = true
        } else if (!edge.fallbackToSignUp) {
          setError(edge.error)
          return
        }
      }

      if (!newUserId) {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { data: {} },
        })
        if (signUpError) {
          setError(signUpError.message)
          return
        }
        if (priorSession?.userId && authData.user?.id && priorSession.userId !== authData.user.id) {
          await supabase.auth.setSession({
            access_token: priorSession.access_token,
            refresh_token: priorSession.refresh_token,
          })
        }
        newUserId = authData.user?.id ?? null
        if (!newUserId) {
          setError(
            "User may exist in Auth but no profile was created (common when email confirmation is on). Deploy admin-users Edge Function (`supabase functions deploy admin-users`) or disable Confirm email for dev; then add a profiles row for their UUID if needed."
          )
          return
        }
        userCreatedId = newUserId
      }

      // Helper: clear error, show success, add new user to list so they appear even if refetch fails
      const showSuccessAndAddUser = (msg: string) => {
        setError("")
        setMessage(msg)
        setEmail("")
        setFirstName("")
        setLastName("")
        setPassword("")
        setRole("user")
        setUsers((prev) => {
          if (prev.some((u) => u.id === newUserId)) return prev
          return [
            { id: newUserId, email: trimmedEmail, created_at: new Date().toISOString(), role, display_name: displayName },
            ...prev,
          ]
        })
      }

      // Edge Function already upserted profiles; signUp path still needs role upsert (trigger may have inserted 'user' only)
      if (!skipProfileUpsert) {
        try {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert(
              {
                id: newUserId,
                email: trimmedEmail,
                role,
                display_name: displayName,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            )
          if (profileError) {
            showSuccessAndAddUser(`User ${trimmedEmail} created. Role may not have saved — set it in the table below.`)
            return
          }
        } catch (_) {
          showSuccessAndAddUser(`User ${trimmedEmail} created. Set their role in the table below if needed.`)
          return
        }
      }

      showSuccessAndAddUser(`User ${trimmedEmail} created with role "${role}".`)
    } catch (e) {
      // Only show error if we didn't already create the user
      if (userCreatedId) {
        setError("")
        setMessage(`User ${trimmedEmail} created. Set their role in the table below if needed.`)
        setFirstName("")
        setLastName("")
        setEmail("")
        setPassword("")
        setRole("user")
        const newId = userCreatedId
        setUsers((prev) => {
          if (prev.some((u) => u.id === newId)) return prev
          return [
            {
              id: newId,
              email: trimmedEmail,
              created_at: new Date().toISOString(),
              role,
              display_name: displayName,
            },
            ...prev,
          ]
        })
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      const isNetworkError =
        e instanceof TypeError ||
        msg === "Failed to fetch" ||
        /fetch|network|load failed|cors|connection/i.test(msg)
      if (isNetworkError) {
        setError(
          "Could not reach Supabase (network/CORS). Check: (1) .env has VITE_SUPABASE_URL (https://xxx.supabase.co) and VITE_SUPABASE_ANON_KEY, (2) restart dev server after changing .env, (3) Supabase project is not paused (Dashboard → Project Settings), (4) Authentication → Providers → Email → Enable Sign Up, (5) add this app URL in Authentication → URL Configuration."
        )
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const searchInputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 480,
    padding: "10px 12px",
    marginTop: 4,
    marginBottom: 4,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
    color: theme.text,
    background: "white",
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 320,
    padding: "8px 12px",
    marginTop: 4,
    marginBottom: 12,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
  }

  return (
    <div>
      <AdminSettingBlock id="admin:users:add_user_heading">
      <h2 style={{ color: theme.text, fontSize: 18, marginBottom: 16 }}>Add user</h2>
      <p style={{ color: theme.text, opacity: 0.8, marginBottom: 4 }}>
        All profiles are created here. Choose role: User, New User (onboarding), Office Manager, or Admin.
      </p>
      <p style={{ color: theme.text, opacity: 0.85, marginBottom: 12, fontSize: 13, lineHeight: 1.5, padding: 12, borderRadius: 8, border: "1px solid #fbbf24", background: "rgba(251, 191, 36, 0.12)" }}>
        <strong>Admin role policy (email workflow pending):</strong> Any change that <strong>grants or removes</strong> admin access must be approved by{" "}
        <strong>joe@tradesman-us.com</strong>. The app will ask for confirmation when you change a row to or from Admin; automated approval email is planned with the outgoing mail integration.
      </p>
      </AdminSettingBlock>
      <AdminSettingBlock id="admin:users:supabase_status">
      <p style={{ fontSize: 12, marginBottom: 16, color: supabase ? "#059669" : "#b91c1c" }}>
        Supabase: {supabase ? "configured" : "not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and restart dev server"}
      </p>
      </AdminSettingBlock>
      <form onSubmit={handleCreate} style={{ marginBottom: 32 }}>
        <AdminSettingBlock id="admin:users:field:first_name">
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          First name
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={inputStyle}
            placeholder="Jane"
            required
          />
        </label>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:users:field:last_name">
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Last name
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={inputStyle}
            placeholder="Doe"
            required
          />
        </label>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:users:field:email">
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="user@example.com"
            required
          />
        </label>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:users:field:password">
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
            minLength={6}
            required
          />
        </label>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:users:field:role">
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "user" | "new_user" | "office_manager" | "admin")}
            style={inputStyle}
          >
            <option value="user">User</option>
            <option value="new_user">New User</option>
            <option value="office_manager">Office Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:users:create_feedback">
        {error && <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 8 }}>{error}</p>}
        {message && <p style={{ color: "#059669", fontSize: 14, marginBottom: 8 }}>{message}</p>}
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:users:create_submit">
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 20px",
            background: theme.primary,
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Creating…" : "Create user"}
        </button>
        </AdminSettingBlock>
      </form>

      <AdminSettingBlock id="admin:users:list_heading">
      <h2 style={{ color: theme.text, fontSize: 18, marginBottom: 8 }}>Users</h2>
      <p style={{ color: theme.text, opacity: 0.8, fontSize: 13, marginBottom: 12 }}>
        Search by name, email, role, or id — same idea as the portal builder profile picker.
      </p>
      </AdminSettingBlock>
      <AdminSettingBlock id="admin:users:search">
      <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: theme.text, marginBottom: 12, maxWidth: 480 }}>
        Search users
        <input
          type="search"
          value={userTableSearch}
          onChange={(e) => setUserTableSearch(e.target.value)}
          placeholder="Type to filter the table…"
          style={searchInputStyle}
          autoComplete="off"
        />
      </label>
      </AdminSettingBlock>
      {loadError && (
        <AdminSettingBlock id="admin:users:load_error">
        <p style={{ color: "#b45309", fontSize: 13, marginBottom: 8 }}>
          {loadError}
          <button type="button" onClick={() => loadUsers()} style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}>Retry</button>
        </p>
        </AdminSettingBlock>
      )}
      {loading ? (
        <AdminSettingBlock id="admin:users:loading">
        <p style={{ color: theme.text }}>Loading…</p>
        </AdminSettingBlock>
      ) : users.length === 0 && !loadError ? (
        <AdminSettingBlock id="admin:users:empty_state">
        <p style={{ color: theme.text, opacity: 0.8 }}>No users yet. Create one above.</p>
        </AdminSettingBlock>
      ) : (
        <>
          {users.length > 0 && (
            <AdminSettingBlock id="admin:users:table_count">
            <p style={{ fontSize: 12, color: theme.text, opacity: 0.75, marginBottom: 8 }}>
              Showing {filteredUsers.length} of {users.length}
              {userTableSearch.trim() ? ` matching “${userTableSearch.trim()}”` : ""}
            </p>
            </AdminSettingBlock>
          )}
          <AdminSettingBlock id="admin:users:user_table">
          <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", background: "white", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <thead>
            <tr style={{ background: theme.charcoalSmoke, color: "white" }}>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>First name</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Last name</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Email</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Role</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Office manager</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Customer</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 16, color: theme.text, opacity: 0.8 }}>No users in list. Create one above — they will appear here.</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 16, color: theme.text, opacity: 0.8 }}>
                  No users match your search. Clear the search box to see everyone.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const { first, last } = splitDisplayName(u.display_name)
                return (
              <tr key={u.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: "12px", color: theme.text }}>{first}</td>
                <td style={{ padding: "12px", color: theme.text }}>{last}</td>
                <td style={{ padding: "12px", color: theme.text }}>{u.email ?? "—"}</td>
                <td style={{ padding: "12px", color: theme.text, minWidth: 160 }}>
                  <select
                    value={u.role}
                    disabled={roleSavingUserId === u.id}
                    onChange={(e) => void handleTableRoleChange(u.id, e.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      fontSize: 13,
                      width: "100%",
                      maxWidth: 200,
                      background: "white",
                      color: theme.text,
                    }}
                  >
                    <option value="user">user</option>
                    <option value="new_user">new_user</option>
                    <option value="office_manager">office_manager</option>
                    <option value="admin">admin</option>
                  </select>
                  {roleSavingUserId === u.id && <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.8 }}>Saving…</span>}
                </td>
                <td style={{ padding: "12px", color: theme.text }}>
                  {u.role === "user" || u.role === "new_user" ? (
                    <select
                      value={omByUserId[u.id] ?? ""}
                      onChange={(e) => void handleSetOfficeManager(u.id, e.target.value || null)}
                      disabled={updatingOmUserId === u.id}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        fontSize: 13,
                        minWidth: 160,
                        maxWidth: 220,
                        background: "white",
                        color: theme.text,
                      }}
                    >
                      <option value="">— None —</option>
                      {officeManagerCandidates
                        .filter((om) => om.id !== u.id)
                        .map((om) => (
                          <option key={om.id} value={om.id}>
                            {(() => {
                              const n = splitDisplayName(om.display_name)
                              const label =
                                n.first !== "—" && n.last !== "—"
                                  ? `${n.first} ${n.last}`
                                  : n.first !== "—"
                                    ? n.first
                                    : om.email ?? om.id.slice(0, 8) + "…"
                              return `${label} (${om.role})`
                            })()}
                          </option>
                        ))}
                    </select>
                  ) : (
                    "—"
                  )}
                  {updatingOmUserId === u.id && (
                    <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>Saving…</span>
                  )}
                </td>
                <td style={{ padding: "12px", color: theme.text, fontSize: 13 }}>—</td>
                <td style={{ padding: "12px", color: theme.text, fontSize: 12 }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
                )
              })
            )}
          </tbody>
        </table>
          </div>
          </AdminSettingBlock>
        </>
      )}
      <AdminSettingBlock id="admin:users:setup_help">
      <p style={{ marginTop: 24, fontSize: 12, color: theme.text, opacity: 0.7 }}>
        Setup: run <code>supabase-profiles-roles.sql</code>, <code>supabase-auth-rls.sql</code>, <code>supabase-office-manager-rls.sql</code>, <code>supabase-user-calendar-preferences.sql</code>, and <code>supabase-admin-portal-builder.sql</code> in Supabase; set .env; see ADMIN-SETUP.md and OFFICE-MANAGER.md.
      </p>
      </AdminSettingBlock>
    </div>
  )
}
