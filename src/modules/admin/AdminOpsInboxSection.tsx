import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { adminSecondaryButtonCompactStyle, adminSecondaryButtonStyle } from "../../components/admin/adminButtonStyles"
import { adminTicketTypeLabel, loadAdminOpsSnapshot, type AdminOpsSnapshot } from "../../lib/adminOpsInbox"

type Props = {
  onOpenTickets?: () => void
  onOpenUsers?: () => void
}

const ADMIN_MUTED = "#475569"
const ADMIN_SUBTLE = "#334155"

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function AdminOpsInboxSection({ onOpenTickets, onOpenUsers }: Props) {
  const { role } = useAuth()
  const allowed = role === "admin"
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [snap, setSnap] = useState<AdminOpsSnapshot | null>(null)

  const load = useCallback(async () => {
    if (!allowed || !supabase) return
    setLoading(true)
    setErr("")
    try {
      const data = await loadAdminOpsSnapshot(supabase)
      setSnap(data)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [allowed])

  useEffect(() => {
    void load()
  }, [load])

  if (!allowed) {
    return (
      <AdminSettingBlock id="admin:ops:denied">
        <p style={{ color: theme.text }}>Admin access required.</p>
      </AdminSettingBlock>
    )
  }

  const todoCount = (snap?.openTickets.length ?? 0) + (snap?.pendingNewUsers.length ?? 0)

  return (
    <div>
      <AdminSettingBlock id="admin:ops:intro">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Ops inbox &amp; reporting</h1>
            <p style={{ color: theme.text, opacity: 0.85, margin: 0, fontSize: 14, lineHeight: 1.55, maxWidth: 720 }}>
              Action items from new signups, demo requests, and trouble tickets. Email alerts fire when tickets are submitted and when users verify email.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{ ...adminSecondaryButtonStyle, cursor: loading ? "wait" : "pointer" }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </AdminSettingBlock>

      {err ? (
        <p style={{ color: "#b91c1c", marginTop: 12 }}>{err}</p>
      ) : loading && !snap ? (
        <p style={{ color: ADMIN_MUTED, marginTop: 12 }}>Loading ops inbox…</p>
      ) : snap ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <StatCard label="Open to-do items" value={todoCount} accent="#dc2626" />
            <StatCard label="Open tickets" value={snap.openTickets.length} accent="#f97316" />
            <StatCard label="Pending new users" value={snap.pendingNewUsers.length} accent="#6366f1" />
            <StatCard label="Demo requests (open)" value={snap.openTicketsByType.demo ?? 0} accent="#0ea5e9" />
            <StatCard label="Support tickets (open)" value={(snap.openTicketsByType.web ?? 0) + (snap.openTicketsByType.tech ?? 0)} accent="#059669" />
          </div>

          <section style={{ marginTop: 24 }}>
            <SectionHeader title="To-do — open trouble tickets" actionLabel="Open trouble tickets" onAction={onOpenTickets} />
            {snap.openTickets.length === 0 ? (
              <EmptyState text="No open tickets." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {snap.openTickets.slice(0, 24).map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ color: theme.text }}>{t.ticket_number}</strong>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6366f1" }}>{adminTicketTypeLabel(t.type)}</span>
                      <span style={{ fontSize: 12, color: ADMIN_MUTED }}>{formatWhen(t.created_at)}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: theme.text }}>{t.title?.trim() || "(No title)"}</div>
                    <div style={{ marginTop: 2, fontSize: 12, color: ADMIN_MUTED }}>
                      {[t.name, t.email].filter(Boolean).join(" · ") || "No contact on file"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginTop: 28 }}>
            <SectionHeader title="To-do — new signups pending review" actionLabel="Users & office managers" onAction={onOpenUsers} />
            {snap.pendingNewUsers.length === 0 ? (
              <EmptyState text="No accounts with role new_user." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 10, overflow: "hidden", color: theme.text }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", color: theme.text }}>
                    <th style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.text }}>Email</th>
                    <th style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.text }}>Name</th>
                    <th style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.text }}>Signed up</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.pendingNewUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.text }}>{u.email ?? u.id.slice(0, 8)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.text }}>{u.display_name?.trim() || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.text }}>{formatWhen(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ marginTop: 28 }}>
            <SectionHeader title="Reporting — platform activity snapshot" />
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff" }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: ADMIN_MUTED, lineHeight: 1.5 }}>
                Open tickets by channel and recent account creations (last 200 accounts loaded).
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {Object.entries(snap.openTicketsByType).map(([type, count]) => (
                  <div key={type} style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: `1px solid ${theme.border}`, minWidth: 120 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{count}</div>
                    <div style={{ fontSize: 11, color: ADMIN_SUBTLE, fontWeight: 600 }}>{adminTicketTypeLabel(type)}</div>
                  </div>
                ))}
              </div>
              <p style={{ margin: "14px 0 0", fontSize: 12, color: ADMIN_MUTED }}>
                Recent accounts tracked: {snap.recentSignups.length}. Promote <code>new_user</code> → <code>user</code> under Users when onboarding is complete.
              </p>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff", minWidth: 130 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent }}>{value}</div>
      <div style={{ fontSize: 11, color: ADMIN_SUBTLE, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>{title}</h2>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={adminSecondaryButtonCompactStyle}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p style={{ margin: 0, fontSize: 13, color: ADMIN_MUTED }}>{text}</p>
}
