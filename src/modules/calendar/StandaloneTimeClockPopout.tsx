import { useMemo } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useOfficeManagerScopeOptional } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import CalendarTeamManagementPanel from "./CalendarTeamManagementPanel"

type Props = {
  onClose: () => void
}

export default function StandaloneTimeClockPopout({ onClose }: Props) {
  const { user } = useAuth()
  const scopeCtx = useOfficeManagerScopeOptional()
  const authUserId = user?.id ?? ""

  const roster = useMemo(() => {
    if (scopeCtx?.clients?.length) return scopeCtx.clients
    return [{ userId: authUserId, label: "My account", email: user?.email ?? null, clientId: null, isSelf: true }]
  }, [scopeCtx?.clients, authUserId, user?.email])

  const managedOnly = useMemo(() => (scopeCtx?.clients ?? []).filter((c) => !c.isSelf), [scopeCtx?.clients])

  if (!authUserId) {
    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui", background: "#f8fafc", color: "#334155" }}>
        <p style={{ margin: 0 }}>Sign in from the main app, then open Time clock again.</p>
        <button type="button" onClick={onClose} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box", background: "#f1f5f9", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: theme.text }}>Team &amp; time clock</h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>Pop-out window — keep this open on a second monitor if you like.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              window.close()
            } catch {
              /* ignore */
            }
            onClose()
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            color: theme.text,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Close window
        </button>
      </div>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#fff",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <CalendarTeamManagementPanel officeManagerUserId={authUserId} viewerUserId={authUserId} roster={roster} managedOnly={managedOnly} />
      </div>
    </div>
  )
}
