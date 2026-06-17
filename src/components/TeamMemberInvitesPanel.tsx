import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"

type InviteRow = {
  id: string
  invite_email: string | null
  invite_role: string
  status: string
  expires_at: string
}

export function TeamMemberInvitesPanel({ ownerUserId }: { ownerUserId: string }) {
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"user" | "office_manager">("user")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from("team_member_invites")
      .select("id, invite_email, invite_role, status, expires_at")
      .eq("account_owner_id", ownerUserId)
      .order("created_at", { ascending: false })
    setInvites((data ?? []) as InviteRow[])
  }, [ownerUserId])

  useEffect(() => {
    void load()
  }, [load])

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage("")
    setError("")
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) {
      setError("Sign in again to send invitations.")
      setBusy(false)
      return
    }
    const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "")
    const res = await fetch(`${base}/functions/v1/send-team-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ invite_email: email.trim(), invite_role: role }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (!res.ok) {
      setError(json.error ?? "Could not send invitation.")
      return
    }
    setEmail("")
    setMessage("Invitation sent. They will receive an email to set their password.")
    void load()
  }

  const shells = invites.filter((i) => i.status === "shell")
  const pending = invites.filter((i) => i.status === "pending")

  return (
    <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Team members</h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        Your plan includes additional user slots. Send email invitations for teammates to create their login.
      </p>
      {shells.length > 0 ? (
        <p style={{ margin: "0 0 12px", fontSize: 13 }}>
          Available slots: <strong>{shells.length}</strong>
        </p>
      ) : null}
      <form onSubmit={(e) => void sendInvite(e)} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
          required
          style={{ flex: "1 1 200px", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}` }}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value === "office_manager" ? "office_manager" : "user")}
          style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}` }}
        >
          <option value="user">User</option>
          <option value="office_manager">Office manager</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "8px 14px",
            background: theme.primary,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </form>
      {error ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
      {message ? <p style={{ color: "#059669", fontSize: 13 }}>{message}</p> : null}
      {pending.length > 0 ? (
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13 }}>
          {pending.map((i) => (
            <li key={i.id}>
              {i.invite_email} · {i.invite_role} · pending
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
