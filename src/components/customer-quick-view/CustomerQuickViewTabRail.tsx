import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"
import {
  CUSTOMER_QUICK_VIEW_CREATE_LABELS,
  CUSTOMER_QUICK_VIEW_TABS,
  isCustomerQuickViewCreateTab,
  type CustomerQuickViewTabId,
} from "./customerQuickViewTabs"

type Props = {
  active: CustomerQuickViewTabId
  onChange: (tab: CustomerQuickViewTabId) => void
  isMobile: boolean
  visibleTabIds: CustomerQuickViewTabId[]
  onCreateAction?: (tab: CustomerQuickViewTabId) => void
}

export function CustomerQuickViewTabRail({
  active,
  onChange,
  isMobile,
  visibleTabIds,
  onCreateAction,
}: Props) {
  const visibleSet = new Set(visibleTabIds)
  const tabs = CUSTOMER_QUICK_VIEW_TABS.filter((t) => visibleSet.has(t.id))
  const showCreate = isCustomerQuickViewCreateTab(active) && onCreateAction

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tabs.map((tab) => (
            <TabButton key={tab.id} label={tab.label} active={active === tab.id} onClick={() => onChange(tab.id)} compact />
          ))}
        </div>
        {showCreate ? (
          <CreateActionButton
            label={CUSTOMER_QUICK_VIEW_CREATE_LABELS[active]}
            onClick={() => onCreateAction(active)}
            compact
          />
        ) : null}
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
      {tabs.map((tab) => (
        <div key={tab.id} style={{ display: "grid", gap: 4 }}>
          <TabButton label={tab.label} active={active === tab.id} onClick={() => onChange(tab.id)} />
          {active === tab.id && isCustomerQuickViewCreateTab(tab.id) && onCreateAction ? (
            <CreateActionButton
              label={CUSTOMER_QUICK_VIEW_CREATE_LABELS[tab.id]}
              onClick={() => onCreateAction(tab.id)}
            />
          ) : null}
        </div>
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

function CreateActionButton({
  label,
  onClick,
  compact,
}: {
  label: string
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: compact ? "auto" : "100%",
        padding: compact ? "6px 12px" : "7px 10px",
        borderRadius: compact ? 999 : 8,
        border: "none",
        background: theme.charcoal,
        color: "#fff",
        fontSize: compact ? 11 : 11,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: compact ? "center" : "left",
        alignSelf: compact ? "flex-start" : undefined,
      }}
    >
      + {label}
    </button>
  )
}
