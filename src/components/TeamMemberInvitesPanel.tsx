import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import { labelForProductPackageId } from "../lib/productPackages"
import {
  loadActiveTeamMembers,
  loadTeamInvites,
  resolveProductPackageId,
  teamMembersApiFetch,
  teamSeatSummary,
  type ActiveTeamMember,
  type TeamInviteRow,
} from "../lib/teamMembers"
import type { AccountSettingsCategory } from "../modules/account/accountSettingsLayout"
import { accountSettingsCategoryStyle, accountSettingsFoldButtonStyle } from "../modules/account/accountSettingsLayout"

type Props = {
  ownerUserId: string
  category?: AccountSettingsCategory
  defaultCollapsed?: boolean
}

function statusLabel(status: string, acceptedAt: string | null): string {
  if (status === "accepted" || acceptedAt) return "Active"
  if (status === "pending") return "Invite sent"
  if (status === "shell") return "Open slot"
  if (status === "cancelled") return "Cancelled"
  if (status === "revoked") return "Removed"
  return status
}

export function TeamMemberInvitesPanel({ ownerUserId, category, defaultCollapsed = true }: Props) {
  const { session } = useAuth()
  const [open, setOpen] = useState(!defaultCollapsed)
  const [invites, setInvites] = useState<TeamInviteRow[]>([])
  const [activeMembers, setActiveMembers] = useState<ActiveTeamMember[]>([])
  const [packageId, setPackageId] = useState<ReturnType<typeof resolveProductPackageId>>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"user" | "office_manager">("user")
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!supabase) return
    const [inv, active, prof] = await Promise.all([
      loadTeamInvites(supabase, ownerUserId),
      loadActiveTeamMembers(supabase, ownerUserId),
      supabase.from("profiles").select("metadata").eq("id", ownerUserId).maybeSingle(),
    ])
    setInvites(inv)
    setActiveMembers(active)
    const meta =
      prof.data?.metadata && typeof prof.data.metadata === "object" && !Array.isArray(prof.data.metadata)
        ? (prof.data.metadata as Record<string, unknown>)
        : {}
    setPackageId(resolveProductPackageId(meta))
  }, [ownerUserId])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  const seats = teamSeatSummary(packageId, invites, activeMembers)
  const pendingInvites = invites.filter((i) => i.status === "pending")
  const openSlots = invites.filter((i) => i.status === "shell")
  const foldStyle = category ? accountSettingsFoldButtonStyle(category) : undefined
  const shellStyle = category ? accountSettingsCategoryStyle(category) : undefined

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage("")
    setError("")
    const token = session?.access_token
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
    setMessage("Invitation sent.")
    void load()
  }

  async function removeMember(member: ActiveTeamMember) {
    if (!window.confirm(`Remove ${member.displayName} from your team? They will lose access to this account.`)) return
    setRowBusy(member.profileId)
    setError("")
    try {
      await teamMembersApiFetch(
        "remove",
        { userId: ownerUserId, memberProfileId: member.profileId },
        session?.access_token ?? null,
      )
      setMessage(`${member.displayName} removed.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRowBusy(null)
    }
  }

  async function updateMemberRole(member: ActiveTeamMember, nextRole: "user" | "office_manager") {
    setRowBusy(member.profileId)
    setError("")
    try {
      await teamMembersApiFetch(
        "update-role",
        { userId: ownerUserId, memberProfileId: member.profileId, inviteRole: nextRole },
        session?.access_token ?? null,
      )
      setMessage("Role updated.")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRowBusy(null)
    }
  }

  async function cancelInvite(invite: TeamInviteRow) {
    setRowBusy(invite.id)
    setError("")
    try {
      await teamMembersApiFetch("cancel-invite", { userId: ownerUserId, inviteId: invite.id }, session?.access_token ?? null)
      setMessage("Invite cancelled.")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRowBusy(null)
    }
  }

  const subtitle = `${activeMembers.length} active · ${pendingInvites.length} pending · ${seats.availableSeats} slot(s) available`

  return (
    <div style={{ padding: 0, gap: 0, overflow: "hidden", borderRadius: 10, ...shellStyle }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={foldStyle ?? { width: "100%", textAlign: "left", padding: "12px 14px", border: "none", borderRadius: 10, background: "#f1f5f9", cursor: "pointer", fontWeight: 700 }}>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", width: "100%" }}>
          <span style={{ minWidth: 0 }}>
            Team members
            {!open ? (
              <span style={{ display: "block", marginTop: 3, fontWeight: 400, fontSize: 11, color: "#64748b", lineHeight: 1.35 }}>{subtitle}</span>
            ) : null}
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }} aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>
      {open ? (
        <div style={{ padding: 16, display: "grid", gap: 14, borderTop: category ? `1px solid ${category.color.border}` : `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
            {packageId ? (
              <strong>{labelForProductPackageId(packageId)}</strong>
            ) : (
              <span>Your subscription</span>
            )}
            {" · "}
            <span>
              {seats.usedSeats} of {seats.totalSeats} seat(s) in use
              {seats.officeManagerLimit > 0
                ? ` · Office managers ${seats.officeManagersUsed}/${seats.officeManagerLimit}`
                : ""}
              {seats.userLimit > 0 ? ` · Users ${seats.usersUsed}/${seats.userLimit}` : ""}
            </span>
          </div>

          {activeMembers.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Active team</div>
              {activeMembers.map((m) => (
                <div
                  key={m.profileId}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{m.displayName}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{m.email ?? "No email"} · Active</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <select
                      value={m.role}
                      disabled={rowBusy === m.profileId}
                      onChange={(e) => void updateMemberRole(m, e.target.value === "office_manager" ? "office_manager" : "user")}
                      style={{ ...theme.formInput, padding: "6px 8px", fontSize: 12, width: "auto" }}
                    >
                      <option value="user">User</option>
                      <option value="office_manager">Office manager</option>
                    </select>
                    <button
                      type="button"
                      disabled={rowBusy === m.profileId}
                      onClick={() => void removeMember(m)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#b91c1c",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {pendingInvites.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Invites sent</div>
              {pendingInvites.map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px dashed ${theme.border}`,
                    background: "#fafafa",
                    fontSize: 13,
                  }}
                >
                  <span>
                    {i.invite_email} · {i.invite_role === "office_manager" ? "Office manager" : "User"} ·{" "}
                    {statusLabel(i.status, i.accepted_at)}
                  </span>
                  <button
                    type="button"
                    disabled={rowBusy === i.id}
                    onClick={() => void cancelInvite(i)}
                    style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {openSlots.length > 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              {openSlots.length} unused seat slot{openSlots.length === 1 ? "" : "s"} on your plan.
            </p>
          ) : null}

          <form onSubmit={(e) => void sendInvite(e)} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
              disabled={busy || seats.availableSeats <= 0}
              style={{
                padding: "8px 14px",
                background: theme.primary,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: busy ? "wait" : "pointer",
                opacity: seats.availableSeats <= 0 ? 0.6 : 1,
              }}
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </form>
          {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
          {message ? <p style={{ margin: 0, color: "#059669", fontSize: 13 }}>{message}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
