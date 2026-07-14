import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import {
  loadActiveTeamMembers,
  loadTeamInvites,
  isTeamMemberRole,
  teamMemberRoleLabel,
  teamMembersApiFetch,
  teamSeatSummaryFromMetadata,
  type ActiveTeamMember,
  type TeamInviteRow,
  type TeamMemberRole,
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
  const [profileMetadata, setProfileMetadata] = useState<Record<string, unknown>>({})
  const [ownerDisplayName, setOwnerDisplayName] = useState("Your team admin")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<TeamMemberRole>("user")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!supabase) return
    const [inv, active, prof] = await Promise.all([
      loadTeamInvites(supabase, ownerUserId),
      loadActiveTeamMembers(supabase, ownerUserId),
      supabase.from("profiles").select("metadata, display_name").eq("id", ownerUserId).maybeSingle(),
    ])
    setInvites(inv)
    setActiveMembers(active)
    const meta =
      prof.data?.metadata && typeof prof.data.metadata === "object" && !Array.isArray(prof.data.metadata)
        ? (prof.data.metadata as Record<string, unknown>)
        : {}
    setProfileMetadata(meta)
    setOwnerDisplayName(prof.data?.display_name?.trim() || "Your team admin")
  }, [ownerUserId])

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  const seats = teamSeatSummaryFromMetadata(profileMetadata, invites, activeMembers)
  const pendingInvites = invites.filter((i) => i.status === "pending")
  const openSlots = invites.filter((i) => i.status === "shell")
  const foldStyle = category ? accountSettingsFoldButtonStyle(category) : undefined
  const shellStyle = category ? accountSettingsCategoryStyle(category) : undefined

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (!seats.teamInvitesAllowed) {
      setError("Your plan has no available team seats. Add seats in Billing or upgrade your package.")
      return
    }
    if (role === "office_manager" && !seats.canInviteOfficeManager) {
      setError("Office manager seat limit reached for your plan.")
      return
    }
    if (role !== "office_manager" && !seats.canInviteUser) {
      setError("User seat limit reached for your plan.")
      return
    }
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

  async function updateMemberRole(member: ActiveTeamMember, nextRole: TeamMemberRole) {
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

  return (
    <div style={{ padding: 0, gap: 0, overflow: "hidden", borderRadius: 10, ...shellStyle }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={foldStyle ?? { width: "100%", textAlign: "left", padding: "12px 14px", border: "none", borderRadius: 10, background: "#f1f5f9", cursor: "pointer", fontWeight: 700 }}>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", width: "100%" }}>
          <span style={{ minWidth: 0 }}>Team members</span>
          <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }} aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>
      {open ? (
        <div style={{ padding: 16, display: "grid", gap: 14, borderTop: category ? `1px solid ${category.color.border}` : `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
            <strong>{seats.packageLabel}</strong>
            {" · "}
            <span>{seats.seatSummaryLabel}</span>
            <br />
            <span style={{ marginTop: 4, display: "inline-block" }}>
              {seats.usedSeats} of {seats.totalSeats} team seat{seats.totalSeats === 1 ? "" : "s"} in use
              {seats.officeManagerLimit > 0
                ? ` · Office managers ${seats.officeManagersUsed}/${seats.officeManagerLimit}`
                : ""}
              {seats.userLimit > 0 ? ` · Users ${seats.usersUsed}/${seats.userLimit}` : ""}
            </span>
          </div>

          {seats.totalSeats <= 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Your current plan includes only the account owner sign-in. Upgrade to an Office Manager or Corporate package to invite team members.
            </p>
          ) : null}

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
                      onChange={(e) => {
                        const nextRole = e.target.value
                        if (isTeamMemberRole(nextRole)) void updateMemberRole(m, nextRole)
                      }}
                      style={{ ...theme.formInput, padding: "6px 8px", fontSize: 12, width: "auto" }}
                    >
                      <option value="user">User</option>
                      <option value="corporate_internal">Internal user</option>
                      <option value="corporate_external">External user</option>
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
                    {i.invite_email} · {teamMemberRoleLabel(i.invite_role)} ·{" "}
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
              onChange={(e) => {
                if (isTeamMemberRole(e.target.value)) setRole(e.target.value)
              }}
              style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}` }}
              disabled={seats.totalSeats <= 0}
            >
              <option value="user" disabled={!seats.canInviteUser && seats.availableSeats <= 0}>
                User
              </option>
              <option value="corporate_internal" disabled={!seats.canInviteUser && seats.availableSeats <= 0}>
                Internal user
              </option>
              <option value="corporate_external" disabled={!seats.canInviteUser && seats.availableSeats <= 0}>
                External user
              </option>
              <option value="office_manager" disabled={!seats.canInviteOfficeManager}>
                Office manager
              </option>
            </select>
            <button
              type="submit"
              disabled={busy || seats.availableSeats <= 0 || seats.totalSeats <= 0 || !seats.teamInvitesAllowed}
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
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              style={{
                padding: "8px 14px",
                background: "#fff",
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Preview invite email
            </button>
          </form>
          {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
          {message ? <p style={{ margin: 0, color: "#059669", fontSize: 13 }}>{message}</p> : null}
          {previewOpen ? (
            <InviteEmailPreview
              ownerName={ownerDisplayName}
              recipient={email.trim() || "new.user@example.com"}
              role={role}
              onClose={() => setPreviewOpen(false)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function InviteEmailPreview({
  ownerName,
  recipient,
  role,
  onClose,
}: {
  ownerName: string
  recipient: string
  role: TeamMemberRole
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Team invitation email preview"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(15,23,42,0.55)",
      }}
    >
      <div style={{ width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto", borderRadius: 14, background: "#fff", boxShadow: "0 24px 64px rgba(15,23,42,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${theme.border}` }}>
          <strong>Invite email preview</strong>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "#475569" }} aria-label="Close preview">
            ×
          </button>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gap: 4, fontSize: 13, color: "#475569", borderBottom: `1px solid ${theme.border}` }}>
          <span><strong>To:</strong> {recipient}</span>
          <span><strong>Subject:</strong> {ownerName} invited you to Tradesman</span>
        </div>
        <div style={{ padding: "28px 22px", background: "#f8fafc" }}>
          <div style={{ width: "min(520px, 100%)", margin: "0 auto", padding: 26, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: theme.primary, marginBottom: 18 }}>Tradesman Systems</div>
            <h2 style={{ margin: "0 0 12px", fontSize: 20, color: theme.text }}>You’re invited to join the team</h2>
            <p style={{ margin: "0 0 8px", color: "#475569", lineHeight: 1.55 }}>
              <strong>{ownerName}</strong> invited you to Tradesman as <strong>{teamMemberRoleLabel(role)}</strong>.
            </p>
            <p style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.55 }}>
              Set up your user information, create a password, and review the Terms, Privacy Policy, and SMS policy.
            </p>
            <span style={{ display: "inline-block", padding: "11px 20px", borderRadius: 8, background: theme.primary, color: "#fff", fontWeight: 800 }}>
              Accept invitation
            </span>
            <p style={{ margin: "20px 0 0", fontSize: 12, color: "#64748b" }}>
              This link expires in 7 days. After setup, Tradesman sends an email-verification link before sign-in.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
