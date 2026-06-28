import { useState, type CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { EMAIL_CLIENT_THEMES, type EmailClientThemeId } from "../../lib/emailClientThemes"
import type { EmailClientInboxOption, EmailClientWorkspaceV1 } from "../../lib/emailClientWorkspace"

type Tab = "appearance" | "inboxes" | "outOfOffice"

type Props = {
  open: boolean
  onClose: () => void
  workspace: EmailClientWorkspaceV1
  onSave: (patch: Partial<EmailClientWorkspaceV1>) => void
  orgInboxes: EmailClientInboxOption[]
  saving?: boolean
}

export default function EmailClientOptionsModal({ open, onClose, workspace, onSave, orgInboxes, saving }: Props) {
  const [tab, setTab] = useState<Tab>("appearance")
  const [oooDraft, setOooDraft] = useState(workspace.outOfOffice)

  if (!open) return null

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: tab === id ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: tab === id ? "#fff7ed" : "#fff",
        fontWeight: tab === id ? 800 : 600,
        fontSize: 13,
        color: theme.text,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Email client options">
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: theme.text }}>Email options</h2>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {tabBtn("appearance", "Theme")}
          {tabBtn("inboxes", "Inboxes")}
          {tabBtn("outOfOffice", "Out of office")}
        </div>

        {tab === "appearance" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Choose a color scheme for the email client.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {EMAIL_CLIENT_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSave({ themeId: t.id as EmailClientThemeId })}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 12,
                    border: workspace.themeId === t.id ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    background: t.panelBackground,
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "block", fontWeight: 800, fontSize: 13 }}>{t.label}</span>
                  <span style={{ display: "block", marginTop: 8, height: 8, borderRadius: 4, background: t.accent }} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "inboxes" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              Additional inboxes configured by your organization. Team leaders grant access in Team Management.
            </p>
            {orgInboxes.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>No extra inboxes yet. Set up routes under Account → Email.</p>
            ) : (
              orgInboxes.map((inbox) => {
                const checked = workspace.enabledInboxRouteIds.includes(inbox.routeId)
                const active = workspace.activeInboxRouteId === inbox.routeId
                return (
                  <label
                    key={inbox.routeId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: active ? "#fff7ed" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...workspace.enabledInboxRouteIds, inbox.routeId]
                          : workspace.enabledInboxRouteIds.filter((id) => id !== inbox.routeId)
                        onSave({
                          enabledInboxRouteIds: ids,
                          activeInboxRouteId:
                            !e.target.checked && workspace.activeInboxRouteId === inbox.routeId ? null : workspace.activeInboxRouteId,
                        })
                      }}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong style={{ display: "block", fontSize: 14, color: theme.text }}>{inbox.label}</strong>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{inbox.address}</span>
                    </span>
                  </label>
                )
              })
            )}
          </div>
        ) : null}

        {tab === "outOfOffice" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>
              <input type="checkbox" checked={oooDraft.enabled} onChange={(e) => setOooDraft((d) => ({ ...d, enabled: e.target.checked }))} /> Enable
              automatic out-of-office replies
            </label>
            <label style={labelStyle}>
              Message
              <textarea
                value={oooDraft.message}
                onChange={(e) => setOooDraft((d) => ({ ...d, message: e.target.value }))}
                rows={4}
                style={{ ...theme.formInput, display: "block", marginTop: 6, width: "100%", resize: "vertical" }}
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <label style={labelStyle}>
                Starts
                <input
                  type="datetime-local"
                  value={oooDraft.startAt?.slice(0, 16) ?? ""}
                  onChange={(e) => setOooDraft((d) => ({ ...d, startAt: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  style={{ ...theme.formInput, display: "block", marginTop: 6 }}
                />
              </label>
              <label style={labelStyle}>
                Ends
                <input
                  type="datetime-local"
                  value={oooDraft.endAt?.slice(0, 16) ?? ""}
                  onChange={(e) => setOooDraft((d) => ({ ...d, endAt: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  style={{ ...theme.formInput, display: "block", marginTop: 6 }}
                />
              </label>
            </div>
            <label style={labelStyle}>
              <input type="checkbox" checked={oooDraft.syncCalendar} onChange={(e) => setOooDraft((d) => ({ ...d, syncCalendar: e.target.checked }))} /> Block
              calendar during out-of-office
            </label>
            <label style={labelStyle}>
              <input type="checkbox" checked={oooDraft.shareWithOrg} onChange={(e) => setOooDraft((d) => ({ ...d, shareWithOrg: e.target.checked }))} /> Share
              status with organization members
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave({ outOfOffice: oooDraft })}
              style={{
                justifySelf: "start",
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save out-of-office"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10060,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
}

const modalStyle: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "min(88vh, 720px)",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 16,
  padding: "20px 22px 24px",
  boxShadow: "0 24px 64px rgba(15,23,42,0.2)",
}

const closeBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
  color: theme.text,
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: theme.text,
}
