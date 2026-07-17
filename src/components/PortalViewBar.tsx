import { useState } from "react"
import { theme } from "../styles/theme"
import { usePortalViewOptional } from "../contexts/PortalViewContext"
import {
  isPortalViewDefaultTarget,
  labelForViewRoleOption,
  PORTAL_VIEW_DEFAULT_USER,
} from "../lib/portalViewRules"
import type { UserRole } from "../contexts/AuthContext"

const MIN_KEY = "pv_bar_minimized"

/** Top-of-portal bar: preview role type + specific user within org (admin / corp mgr / OM). */
export default function PortalViewBar() {
  const pv = usePortalViewOptional()
  const [minimized, setMinimized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(MIN_KEY) === "1"
    } catch {
      return false
    }
  })
  const setMin = (v: boolean) => {
    setMinimized(v)
    try {
      sessionStorage.setItem(MIN_KEY, v ? "1" : "0")
    } catch {
      /* ignore */
    }
  }
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
    viewingOtherProfile,
    editMode,
    setEditMode,
  } = pv

  const usingDefault = isPortalViewDefaultTarget(targetUserId)
  const selectedUser = usingDefault ? null : usersForCurrentViewRole.find((u) => u.userId === targetUserId)
  const profileSelectValue = usingDefault ? PORTAL_VIEW_DEFAULT_USER : (targetUserId ?? PORTAL_VIEW_DEFAULT_USER)

  const shortLabel = viewingOtherProfile
    ? selectedUser?.label || labelForViewRoleOption(viewRole, false)
    : "You"

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        title="Expand the Viewing as bar"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          padding: "6px 12px",
          background: viewingOtherProfile ? "#fffbeb" : "#f8fafc",
          border: `1px solid ${viewingOtherProfile ? "#f59e0b" : theme.border}`,
          borderRadius: 999,
          fontSize: 12.5,
          fontWeight: 700,
          color: viewingOtherProfile ? "#b45309" : "#334155",
          cursor: "pointer",
        }}
      >
        <span aria-hidden>👁</span>
        <span>
          Viewing as: {shortLabel}
          {viewingOtherProfile ? (editMode ? " · Edit mode" : " · View only") : ""}
        </span>
        <span aria-hidden style={{ color: "#94a3b8" }}>▸</span>
      </button>
    )
  }

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
      <button
        type="button"
        onClick={() => setMin(true)}
        title="Minimize the Viewing as bar"
        aria-label="Minimize the Viewing as bar"
        style={{
          marginLeft: "auto",
          order: 99,
          border: `1px solid ${theme.border}`,
          background: "#fff",
          color: "#64748b",
          borderRadius: 8,
          width: 28,
          height: 28,
          fontSize: 16,
          fontWeight: 800,
          cursor: "pointer",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        –
      </button>
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
      {viewingOtherProfile ? (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            border: `1px solid ${editMode ? "#f59e0b" : theme.border}`,
            background: editMode ? "#fffbeb" : "#f1f5f9",
            fontSize: 12,
            fontWeight: 800,
            color: editMode ? "#b45309" : "#334155",
            cursor: "pointer",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
          title={
            editMode
              ? "Edit mode is on — changes save to this user's account."
              : "View only — turn on to change this user's settings and data."
          }
        >
          <input
            type="checkbox"
            checked={editMode}
            onChange={(e) => setEditMode(e.target.checked)}
            style={{ accentColor: "#f59e0b" }}
          />
          {editMode ? "Edit mode on" : "View only — Edit mode"}
        </label>
      ) : null}
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
          Previewing <strong>{selectedUser.label}</strong>&apos;s portal —{" "}
          {editMode
            ? "Edit mode: changes save to their account. Their emails, texts, and calls stay hidden."
            : "view only. Their emails, texts, and calls stay hidden."}
        </span>
      ) : null}
    </div>
  )
}
