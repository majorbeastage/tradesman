import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { CUSTOMER_QUICK_VIEW_TABS, type CustomerQuickViewTabId } from "./customerQuickViewTabs"

type Props = {
  active: CustomerQuickViewTabId
  onChange: (tab: CustomerQuickViewTabId) => void
  isMobile: boolean
}

export function CustomerQuickViewTabRail({ active, onChange, isMobile }: Props) {
  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {CUSTOMER_QUICK_VIEW_TABS.map((tab) => (
          <TabButton key={tab.id} label={tab.label} active={active === tab.id} onClick={() => onChange(tab.id)} compact />
        ))}
      </div>
    )
  }

  return (
    <nav
      aria-label="Customer quick view"
      style={{
        flexShrink: 0,
        width: 168,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        borderLeft: `1px solid ${theme.border}`,
        paddingLeft: 10,
        alignSelf: "stretch",
      }}
    >
      {CUSTOMER_QUICK_VIEW_TABS.map((tab) => (
        <TabButton key={tab.id} label={tab.label} active={active === tab.id} onClick={() => onChange(tab.id)} />
      ))}
    </nav>
  )
}

function TabButton({
  label,
  active,
  onClick,
  compact,
}: {
  label: string
  active: boolean
  onClick: () => void
  compact?: boolean
}) {
  const style: CSSProperties = compact
    ? {
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.primary : theme.border}`,
        background: active ? "#fff7ed" : "#fff",
        color: active ? "#9a3412" : theme.text,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "center",
      }
    : {
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: `1px solid ${active ? theme.primary : theme.border}`,
        background: active ? "#fff7ed" : "#fff",
        color: active ? "#9a3412" : theme.text,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        lineHeight: 1.3,
      }

  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} style={style}>
      {label}
    </button>
  )
}
