import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import type { Client } from "../../types/portal-builder"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""
const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001"

type UserRow = {
  id: string
  email: string | null
  created_at: string
  role: string
  display_name: string | null
  client_id: string | null
}

type Props = {
  clients: Client[]
}

export default function AdminUsersSection({ clients }: Props) {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("") // loading user list (don't overwrite create success)
  const [error, setError] = useState("") // create user / assign client only
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"user" | "office_manager" | "admin">("user")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [updatingClientId, setUpdatingClientId] = useState<string | null>(null)
  const [clientAssignMessage, setClientAssignMessage] = useState("")

  async function mergeClientIds(rows: UserRow[]): Promise<UserRow[]> {
    if (!supabase || rows.length === 0) return rows
    const ids = rows.map((r) => r.id)
    const { data: profs } = await supabase.from("profiles").select("id, client_id").in("id", ids)
    const byId = new Map((profs ?? []).map((p) => [p.id, (p as { client_id: string | null }).client_id]))
    return rows.map((r) => ({ ...r, client_id: byId.get(r.id) ?? r.client_id ?? null }))
  }

  async function loadUsers() {
    if (!session?.access_token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError("")
    try {
      if (supabaseUrl) {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (res.ok && Array.isArray(data.users)) {
          const rows = (data.users as UserRow[]).map((u) => ({ ...u, client_id: (u as UserRow).client_id ?? null }))
          setUsers(await mergeClientIds(rows))
          return
        }
      }
      if (!supabase) {
        setLoadError("Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env")
        setUsers([])
        setLoading(false)
        return
      }
      const { data: list, error: listError } = await supabase
        .from("admin_users_list")
        .select("id, email, created_at, role, display_name")
      if (!listError && list?.length) {
        const rows = (list as UserRow[]).map((u) => ({ ...u, client_id: null }))
        setUsers(await mergeClientIds(rows))
        return
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, role, display_name, created_at, client_id")
      if (profiles?.length) {
        setUsers(
          profiles.map((p) => ({
            id: (p as { id: string }).id,
            email: null,
            created_at: (p as { created_at?: string }).created_at ?? "",
            role: (p as { role: string }).role,
            display_name: (p as { display_name: string | null }).display_name ?? null,
            client_id: (p as { client_id?: string | null }).client_id ?? null,
          }))
        )
        return
      }
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!email.trim() || !password) {
      setError("Email and password are required.")
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
    let userCreatedId: string | null = null

    try {
      if (!supabase) {
        setError("Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env")
        return
      }
      // Create user via Supabase Auth signUp (no Edge Function)
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: {} },
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      const newUserId = authData.user?.id
      if (!newUserId) {
        setError("User was created but could not get user id.")
        return
      }
      userCreatedId = newUserId

      // Helper: clear error, show success, add new user to list so they appear even if refetch fails
      const showSuccessAndAddUser = (msg: string) => {
        setError("")
        setMessage(msg)
        setEmail("")
        setPassword("")
        setRole("user")
        setUsers((prev) => {
          if (prev.some((u) => u.id === newUserId)) return prev
          return [
            { id: newUserId, email: trimmedEmail, created_at: new Date().toISOString(), role, display_name: null, client_id: null },
            ...prev,
          ]
        })
      }

      // Set role in profiles (trigger may have already created row with 'user')
      try {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: newUserId,
              role,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          )
        if (profileError) {
          showSuccessAndAddUser(`User ${trimmedEmail} created. Role may not have saved — set it in the table below.`)
          return
        }
      } catch (_) {
        // Profile upsert failed (e.g. failed to fetch) — user still exists
        showSuccessAndAddUser(`User ${trimmedEmail} created. Set their role and client in the table below.`)
        return
      }

      showSuccessAndAddUser(`User ${trimmedEmail} created with role "${role}". Assign a client in the table below if needed.`)
    } catch (e) {
      // Only show error if we didn't already create the user
      if (userCreatedId) {
        setError("")
        setMessage(`User ${trimmedEmail} created. Set their role and client in the table below.`)
        setEmail("")
        setPassword("")
        setRole("user")
        setUsers((prev) => {
          if (prev.some((u) => u.id === userCreatedId)) return prev
          return [
            {
              id: userCreatedId,
              email: trimmedEmail,
              created_at: new Date().toISOString(),
              role,
              display_name: null,
              client_id: null,
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

  async function handleUpdateClient(userId: string, clientId: string | null) {
    if (!supabase) return
    setError("")
    setClientAssignMessage("")
    setUpdatingClientId(userId)
    try {
      const { error: err } = await supabase.from("profiles").update({ client_id: clientId || null }).eq("id", userId)
      if (err) throw err
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, client_id: clientId || null } : u)))
      const name = clients.find((c) => c.id === (clientId || ""))?.name ?? (clientId === DEFAULT_CLIENT_ID ? "Default" : "—")
      setClientAssignMessage(`Client set to ${name}.`)
      setTimeout(() => setClientAssignMessage(""), 3000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        msg.includes("client_id") || msg.includes("column")
          ? "profiles table needs client_id column. Run supabase-admin-portal-builder.sql in Supabase SQL Editor."
          : msg
      )
    } finally {
      setUpdatingClientId(null)
    }
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
      <h2 style={{ color: theme.text, fontSize: 18, marginBottom: 16 }}>Add user</h2>
      <p style={{ color: theme.text, opacity: 0.8, marginBottom: 4 }}>
        All profiles are created here. Choose role: User, Office Manager, or Admin.
      </p>
      <p style={{ fontSize: 12, marginBottom: 16, color: supabase ? "#059669" : "#b91c1c" }}>
        Supabase: {supabase ? "configured" : "not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and restart dev server"}
      </p>
      <form onSubmit={handleCreate} style={{ marginBottom: 32 }}>
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="user@example.com"
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
            minLength={6}
          />
        </label>
        <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: theme.text }}>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "user" | "office_manager" | "admin")}
            style={inputStyle}
          >
            <option value="user">User</option>
            <option value="office_manager">Office Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {error && <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 8 }}>{error}</p>}
        {message && <p style={{ color: "#059669", fontSize: 14, marginBottom: 8 }}>{message}</p>}
        {clientAssignMessage && <p style={{ color: "#059669", fontSize: 14, marginBottom: 8 }}>{clientAssignMessage}</p>}
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
      </form>

      <h2 style={{ color: theme.text, fontSize: 18, marginBottom: 16 }}>Users</h2>
      {loadError && (
        <p style={{ color: "#b45309", fontSize: 13, marginBottom: 8 }}>
          {loadError}
          <button type="button" onClick={() => loadUsers()} style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}>Retry</button>
        </p>
      )}
      {loading ? (
        <p style={{ color: theme.text }}>Loading…</p>
      ) : users.length === 0 && !loadError ? (
        <p style={{ color: theme.text, opacity: 0.8 }}>No users yet. Create one above.</p>
      ) : (
        <table style={{ width: "100%", maxWidth: 720, borderCollapse: "collapse", background: "white", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <thead>
            <tr style={{ background: theme.charcoalSmoke, color: "white" }}>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Email</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Role</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Client</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 16, color: theme.text, opacity: 0.8 }}>No users in list. Create one above — they will appear here.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: "12px", color: theme.text }}>{u.email ?? "—"}</td>
                <td style={{ padding: "12px", color: theme.text }}>{u.role}</td>
                <td style={{ padding: "12px", color: theme.text }}>
                  <select
                    value={u.client_id ?? ""}
                    onChange={(e) => handleUpdateClient(u.id, e.target.value || null)}
                    disabled={updatingClientId === u.id}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      fontSize: 13,
                      minWidth: 140,
                      background: "white",
                      color: theme.text,
                    }}
                  >
                    <option value="">—</option>
                    {clients.length === 0 && (
                      <option value={DEFAULT_CLIENT_ID}>Default</option>
                    )}
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {updatingClientId === u.id && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>Saving…</span>}
                </td>
                <td style={{ padding: "12px", color: theme.text, fontSize: 12 }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            )) }
          </tbody>
        </table>
      )}
      <p style={{ marginTop: 24, fontSize: 12, color: theme.text, opacity: 0.7 }}>
        Setup: run <code>supabase-profiles-roles.sql</code> and <code>supabase-admin-portal-builder.sql</code> in Supabase; set .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY); enable Sign Up in Auth. See ADMIN-SETUP.md.
      </p>
    </div>
  )
}
