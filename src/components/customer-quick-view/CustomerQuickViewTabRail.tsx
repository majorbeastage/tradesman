import { useCallback, useState, type CSSProperties, type MouseEvent } from "react"
import { theme } from "../../styles/theme"
import {
  fontFamilyCss,
  resolveCustomerQuickViewTabStyle,
  tabIconGlyph,
  type CustomerQuickViewTabStyle,
} from "../../lib/customerQuickViewTabStyles"
import {
  CUSTOMER_QUICK_VIEW_CREATE_LABELS,
  CUSTOMER_QUICK_VIEW_TABS,
  isCustomerQuickViewCreateTab,
  type CustomerQuickViewTabId,
} from "./customerQuickViewTabs"
import { CustomerQuickViewTabStyleMenu } from "./CustomerQuickViewTabStyleMenu"

type Props = {
  active: CustomerQuickViewTabId
  onChange: (tab: CustomerQuickViewTabId) => void
  isMobile: boolean
  visibleTabIds: CustomerQuickViewTabId[]
  onCreateAction?: (tab: CustomerQuickViewTabId) => void
  tabStyles?: Partial<Record<string, CustomerQuickViewTabStyle>>
  onTabStyleChange?: (tabId: CustomerQuickViewTabId, patch: Partial<CustomerQuickViewTabStyle>) => void
}

export function CustomerQuickViewTabRail({
  active,
  onChange,
  isMobile,
  visibleTabIds,
  onCreateAction,
  tabStyles,
  onTabStyleChange,
}: Props) {
  const visibleSet = new Set(visibleTabIds)
  const tabs = CUSTOMER_QUICK_VIEW_TABS.filter((t) => visibleSet.has(t.id))
  const showCreate = isCustomerQuickViewCreateTab(active) && onCreateAction

  const [styleMenu, setStyleMenu] = useState<{
    tabId: CustomerQuickViewTabId
    label: string
    x: number
    y: number
  } | null>(null)

  const openStyleMenu = useCallback(
    (e: MouseEvent, tabId: CustomerQuickViewTabId, label: string) => {
      if (!onTabStyleChange) return
      e.preventDefault()
      setStyleMenu({ tabId, label, x: e.clientX, y: e.clientY })
    },
    [onTabStyleChange],
  )

  const menuStyle = styleMenu
    ? resolveCustomerQuickViewTabStyle(styleMenu.tabId, tabStyles)
    : null

  if (isMobile) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                label={tab.label}
                active={active === tab.id}
                onClick={() => onChange(tab.id)}
                compact
                tabStyle={resolveCustomerQuickViewTabStyle(tab.id, tabStyles)}
                onContextMenu={onTabStyleChange ? (e) => openStyleMenu(e, tab.id, tab.label) : undefined}
              />
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
        {styleMenu && menuStyle && onTabStyleChange ? (
          <CustomerQuickViewTabStyleMenu
            open
            x={styleMenu.x}
            y={styleMenu.y}
            tabId={styleMenu.tabId}
            label={styleMenu.label}
            style={menuStyle}
            onChange={(patch) => onTabStyleChange(styleMenu.tabId, patch)}
            onClose={() => setStyleMenu(null)}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <nav
        aria-label="Customer quick view"
        onContextMenu={
          onTabStyleChange
            ? (e) => {
                e.preventDefault()
              }
            : undefined
        }
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
            <TabButton
              label={tab.label}
              active={active === tab.id}
              onClick={() => onChange(tab.id)}
              tabStyle={resolveCustomerQuickViewTabStyle(tab.id, tabStyles)}
              onContextMenu={onTabStyleChange ? (e) => openStyleMenu(e, tab.id, tab.label) : undefined}
            />
            {active === tab.id && isCustomerQuickViewCreateTab(tab.id) && onCreateAction ? (
              <CreateActionButton
                label={CUSTOMER_QUICK_VIEW_CREATE_LABELS[tab.id]}
                onClick={() => onCreateAction(tab.id)}
              />
            ) : null}
          </div>
        ))}
      </nav>
      {styleMenu && menuStyle && onTabStyleChange ? (
        <CustomerQuickViewTabStyleMenu
          open
          x={styleMenu.x}
          y={styleMenu.y}
          tabId={styleMenu.tabId}
          label={styleMenu.label}
          style={menuStyle}
          onChange={(patch) => onTabStyleChange(styleMenu.tabId, patch)}
          onClose={() => setStyleMenu(null)}
        />
      ) : null}
    </>
  )
}

function TabButton({
  label,
  active,
  onClick,
  compact,
  tabStyle,
  onContextMenu,
}: {
  label: string
  active: boolean
  onClick: () => void
  compact?: boolean
  tabStyle: CustomerQuickViewTabStyle
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const icon = tabIconGlyph(tabStyle.icon)
  const bg = tabStyle.backgroundColor ?? "#f8fafc"
  const color = tabStyle.color ?? theme.text
  const activeBg = active && bg.startsWith("#")
    ? `color-mix(in srgb, ${bg} 88%, #0f172a)`
    : bg

  const style: CSSProperties = compact
    ? {
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.primary : theme.border}`,
        background: activeBg,
        color,
        fontFamily: fontFamilyCss(tabStyle.fontFamily),
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "center",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }
    : {
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: `1px solid ${active ? theme.primary : theme.border}`,
        background: activeBg,
        color,
        fontFamily: fontFamilyCss(tabStyle.fontFamily),
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        lineHeight: 1.3,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-current={active ? "page" : undefined}
      style={style}
      title={onContextMenu ? "Right-click to customize style" : undefined}
    >
      {icon ? <span aria-hidden style={{ fontSize: compact ? 12 : 14, lineHeight: 1 }}>{icon}</span> : null}
      <span>{label}</span>
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
