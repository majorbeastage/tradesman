import { useState } from "react"
import { theme } from "../../styles/theme"
import AdminCustomFieldsSection from "./AdminCustomFieldsSection"
import AdminPortalTabsSection from "./AdminPortalTabsSection"

type SubSection = "custom-fields" | "user-portal" | "office-portal"

type Props = { clientId: string }

export default function AdminPortalBuilder({ clientId }: Props) {
  const [sub, setSub] = useState<SubSection>("custom-fields")

  const tabStyle: React.CSSProperties = {
    padding: "8px 14px",
    marginRight: 8,
    border: `1px solid ${theme.border}`,
    background: sub === "custom-fields" ? theme.primary : "white",
    color: sub === "custom-fields" ? "white" : theme.text,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  }
  const tabStyleUser = { ...tabStyle, background: sub === "user-portal" ? theme.primary : "white", color: sub === "user-portal" ? "white" : theme.text }
  const tabStyleOffice = { ...tabStyle, background: sub === "office-portal" ? theme.primary : "white", color: sub === "office-portal" ? "white" : theme.text }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <button style={tabStyle} onClick={() => setSub("custom-fields")}>
          Custom fields
        </button>
        <button style={tabStyleUser} onClick={() => setSub("user-portal")}>
          User portal tabs
        </button>
        <button style={tabStyleOffice} onClick={() => setSub("office-portal")}>
          Office Manager portal tabs
        </button>
      </div>
      {sub === "custom-fields" && <AdminCustomFieldsSection clientId={clientId} />}
      {sub === "user-portal" && (
        <AdminPortalTabsSection clientId={clientId} portalType="user" title="User" />
      )}
      {sub === "office-portal" && (
        <AdminPortalTabsSection clientId={clientId} portalType="office_manager" title="Office Manager" />
      )}
    </div>
  )
}
