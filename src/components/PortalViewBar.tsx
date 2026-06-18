import { theme } from "../styles/theme"
import { usePortalViewOptional } from "../contexts/PortalViewContext"
import {
  isPortalViewDefaultTarget,
  labelForViewRoleOption,
  PORTAL_VIEW_DEFAULT_USER,
} from "../lib/portalViewRules"
import type { UserRole } from "../contexts/AuthContext"

/** Top-of-portal bar: preview role type + specific user within org (admin / corp mgr / OM). */
export default function PortalViewBar() {
  const pv = usePortalViewOptional()
  if (!pv?.showViewBar) return null

  const {
    authRole,
    authUserId,
    viewRole,
    setViewRole,
    targetUserId,
    setTargetUserId,
    viewRoleOptions,
    usersForCurrentViewRole,
    loadingUsers,
    loadingPortalConfig,
    error,
  } = pv

  const usingDefault = isPortalViewDefaultTarget(targetUserId)
  const selectedUser = usingDefault ? null : usersForCurrentViewRole.find((u) => u.userId === targetUserId)
  const profileSelectValue = usingDefault ? PORTAL_VIEW_DEFAULT_USER : (targetUserId ?? PORTAL_VIEW_DEFAULT_USER)

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        padding: "10px 14px",
        background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)",
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        fontSize: 13,
        color: theme.text,
      }}
    >
      <span style={{ fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>Viewing as</span>
      <select
        value={viewRole}
        onChange={(e) => setViewRole(e.target.value as UserRole)}
        aria-label="Preview role type"
        style={{
          padding: "7px 10px",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          fontSize: 13,
          fontWeight: 600,
          minWidth: 168,
          background: "#fff",
          color: theme.text,
        }}
      >
        {viewRoleOptions.map((r) => (
          <option key={r} value={r}>
            {labelForViewRoleOption(r, r === authRole)}
          </option>
        ))}
      </select>
      <select
        value={profileSelectValue}
        onChange={(e) => setTargetUserId(e.target.value)}
        disabled={loadingUsers}
        aria-label="Preview profile"
        style={{
          padding: "7px 10px",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          fontSize: 13,
          minWidth: 200,
          maxWidth: 320,
          background: "#fff",
          color: theme.text,
        }}
      >
        {viewRole !== authRole ? (
          <option value={PORTAL_VIEW_DEFAULT_USER}>
            Default — {labelForViewRoleOption(viewRole, false)}
          </option>
        ) : null}
        {usersForCurrentViewRole.length === 0 && viewRole === authRole ? (
          <option value={authUserId ?? ""}>No users for this role</option>
        ) : (
          usersForCurrentViewRole.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.label}
              {u.email ? ` · ${u.email}` : ""}
              {u.userId === authUserId ? " (you)" : ""}
            </option>
          ))
        )}
      </select>
      {loadingUsers ? (
        <span style={{ fontSize: 12, opacity: 0.75 }}>Loading users…</span>
      ) : null}
      {loadingPortalConfig ? (
        <span style={{ fontSize: 12, opacity: 0.75 }}>Loading profile…</span>
      ) : null}
      {error ? <span style={{ fontSize: 12, color: "#b91c1c" }}>{error}</span> : null}
      {!loadingPortalConfig && usingDefault && viewRole !== authRole ? (
        <span style={{ fontSize: 12, opacity: 0.8, flex: "1 1 200px" }}>
          Default <strong>{labelForViewRoleOption(viewRole, false)}</strong> layout — tabs match a fresh account of this type.
        </span>
      ) : null}
      {!loadingPortalConfig && selectedUser && selectedUser.userId !== authUserId ? (
        <span style={{ fontSize: 12, opacity: 0.8, flex: "1 1 200px" }}>
          Previewing <strong>{selectedUser.label}</strong>&apos;s portal — tabs and permissions match their profile.
        </span>
      ) : null}
    </div>
  )
}
