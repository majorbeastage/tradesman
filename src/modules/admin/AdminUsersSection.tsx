import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""

type UserRow = {
  id: string
  email: string | null
  created_at: string
  role: string
  display_name: string | null
}

export default function AdminUsersSection() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"user" | "office_manager" | "admin">("user")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  async function loadUsers() {
    if (!session?.access_token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      if (supabaseUrl) {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        const data = await res.json()
        if (res.ok && Array.isArray(data.users)) {
          setUsers(data.users)
          return
        }
      }
      if (!supabase) {
        setError("Supabase not configured")
        setLoading(false)
        return
      }
      const { data: list, error: listError } = await supabase
        .from("admin_users_list")
        .select("id, email, created_at, role, display_name")
      if (!listError && list?.length) {
        setUsers(list as UserRow[])
        return
      }
      const { data: profiles } = await supabase.from("profiles").select("id, role, display_name, created_at")
      if (profiles?.length) {
        setUsers(
          profiles.map((p) => ({
            id: p.id,
            email: null,
            created_at: (p as { created_at?: string }).created_at ?? "",
            role: (p as { role: string }).role,
            display_name: (p as { display_name: string | null }).display_name ?? null,
          }))
        )
        setError("Users from profiles (no email). Deploy admin-users Edge Function for full list.")
        return
      }
      setUsers([])
      if (!supabaseUrl) setError("Set VITE_SUPABASE_URL. Or run supabase-admin-users-view.sql and supabase-profiles-roles.sql.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users")
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
    if (!session?.access_token || !supabaseUrl) {
      setError("Not signed in or Supabase not configured.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: email.trim(), password, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || res.statusText)
        return
      }
      setMessage(`User ${data.user?.email ?? email} created with role "${role}".`)
      setEmail("")
      setPassword("")
      setRole("user")
      loadUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user")
    } finally {
      setSubmitting(false)
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
      <p style={{ color: theme.text, opacity: 0.8, marginBottom: 16 }}>
        All profiles are created here. Choose role: User, Office Manager, or Admin.
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
      {loading ? (
        <p style={{ color: theme.text }}>Loading…</p>
      ) : users.length === 0 ? (
        <p style={{ color: theme.text, opacity: 0.8 }}>No users yet. Create one above or deploy the admin-users Edge Function.</p>
      ) : (
        <table style={{ width: "100%", maxWidth: 640, borderCollapse: "collapse", background: "white", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <thead>
            <tr style={{ background: theme.charcoalSmoke, color: "white" }}>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Email</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Role</th>
              <th style={{ padding: "12px", textAlign: "left", fontSize: 12 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: "12px", color: theme.text }}>{u.email ?? "—"}</td>
                <td style={{ padding: "12px", color: theme.text }}>{u.role}</td>
                <td style={{ padding: "12px", color: theme.text, fontSize: 12 }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: 24, fontSize: 12, color: theme.text, opacity: 0.7 }}>
        Deploy the Edge Function <code>admin-users</code> (see supabase/functions/admin-users) and ensure the first admin is set in Supabase (e.g. sign up once, then set profiles.role = &apos;admin&apos; in SQL).
      </p>
    </div>
  )
}
