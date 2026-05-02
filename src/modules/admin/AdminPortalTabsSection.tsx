import { useState, useEffect } from "react"
import { theme } from "../../styles/theme"
import { TAB_ID_LABELS } from "../../types/portal-builder"
import { fetchPortalTabs, upsertPortalTab } from "../../lib/portal-builder-api"
import type { PortalTab } from "../../types/portal-builder"

type PortalKind = "user" | "office_manager"

const TAB_IDS: Record<PortalKind, readonly string[]> = {
  user: [
    "dashboard",
    "leads",
    "conversations",
    "customers",
    "quotes",
    "calendar",
    "payments",
    "account",
    "web-support",
    "tech-support",
    "settings",
  ],
  office_manager: [
    "dashboard",
    "leads",
    "conversations",
    "customers",
    "quotes",
    "calendar",
    "payments",
    "account",
    "web-support",
    "tech-support",
  ],
}

type Props = {
  clientId: string
  portalType: PortalKind
  title: string
}

export default function AdminPortalTabsSection({ clientId, portalType, title }: Props) {
  const [tabs, setTabs] = useState<PortalTab[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    fetchPortalTabs(clientId, portalType).then((data) => {
      if (!cancelled) {
        setTabs(data)
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId, portalType])

  const tabIds = TAB_IDS[portalType]
  const tabMap = new Map(tabs.map((t) => [t.tab_id, t]))

  const setVisible = async (tabId: string, visible: boolean) => {
    setSaving(tabId)
    try {
      const existing = tabMap.get(tabId)
      await upsertPortalTab({
        client_id: clientId,
        portal_type: portalType,
        tab_id: tabId,
        label: existing?.label ?? TAB_ID_LABELS[tabId] ?? tabId,
        visible,
        sort_order: existing?.sort_order ?? tabIds.indexOf(tabId),
      })
      setTabs((prev) => {
        const next = prev.filter((t) => t.tab_id !== tabId)
        next.push({
          id: existing?.id ?? "",
          client_id: clientId,
          portal_type: portalType,
          tab_id: tabId,
          label: existing?.label ?? null,
          visible,
          sort_order: existing?.sort_order ?? tabIds.indexOf(tabId),
        })
        next.sort((a, b) => a.sort_order - b.sort_order)
        return next
      })
    } finally {
      setSaving(null)
    }
  }

  const move = async (tabId: string, direction: "up" | "down") => {
    const idx = tabs.findIndex((t) => t.tab_id === tabId)
    if (idx < 0) return
    const newOrder = [...tabs].sort((a, b) => a.sort_order - b.sort_order)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= newOrder.length) return
    ;[newOrder[idx].sort_order, newOrder[swapIdx].sort_order] = [
      newOrder[swapIdx].sort_order,
      newOrder[idx].sort_order,
    ]
    setSaving(tabId)
    try {
      for (const t of newOrder) {
        await upsertPortalTab({
          client_id: clientId,
          portal_type: portalType,
          tab_id: t.tab_id,
          label: t.label ?? TAB_ID_LABELS[t.tab_id],
          visible: t.visible,
          sort_order: t.sort_order,
        })
      }
      setTabs((prev) => {
        const next = [...prev].sort((a, b) => a.sort_order - b.sort_order)
        const a = next.findIndex((t) => t.tab_id === newOrder[idx].tab_id)
        const b = next.findIndex((t) => t.tab_id === newOrder[swapIdx].tab_id)
        if (a >= 0 && b >= 0) {
          next[a] = { ...next[a], sort_order: newOrder[idx].sort_order }
          next[b] = { ...next[b], sort_order: newOrder[swapIdx].sort_order }
        }
        return next.sort((a, b) => a.sort_order - b.sort_order)
      })
    } finally {
      setSaving(null)
    }
  }

  const orderedTabs = [...tabs].sort((a, b) => a.sort_order - b.sort_order)
  const missing = tabIds.filter((id) => !tabMap.has(id))

  const cardStyle: React.CSSProperties = {
    background: "white",
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 12,
  }

  if (loading) return <p style={{ color: theme.text }}>Loading…</p>

  return (
    <div>
      <p style={{ color: theme.text, marginBottom: 16, opacity: 0.9 }}>
        Turn tabs on or off and change their order for the {title} portal.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {orderedTabs.map((t, i) => (
          <div key={t.tab_id} style={cardStyle}>
            <button
              type="button"
              disabled={saving !== null || i === 0}
              onClick={() => move(t.tab_id, "up")}
              style={{ padding: "4px 8px", cursor: i === 0 ? "not-allowed" : "pointer" }}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={saving !== null || i === orderedTabs.length - 1}
              onClick={() => move(t.tab_id, "down")}
              style={{ padding: "4px 8px", cursor: i === orderedTabs.length - 1 ? "not-allowed" : "pointer" }}
              title="Move down"
            >
              ↓
            </button>
            <span style={{ flex: 1, fontWeight: 500, color: theme.text }}>
              {t.label ?? TAB_ID_LABELS[t.tab_id] ?? t.tab_id}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={t.visible}
                disabled={saving !== null}
                onChange={(e) => setVisible(t.tab_id, e.target.checked)}
              />
              <span style={{ fontSize: 14, color: theme.text }}>Visible</span>
            </label>
          </div>
        ))}
        {missing.map((tabId) => (
          <div key={tabId} style={cardStyle}>
            <span style={{ flex: 1, color: theme.text }}>{TAB_ID_LABELS[tabId] ?? tabId}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => {
                  if (e.target.checked) void setVisible(tabId, true)
                }}
              />
              <span style={{ fontSize: 14, color: theme.text }}>Visible</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
