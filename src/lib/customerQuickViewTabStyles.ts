import type { CustomerQuickViewTabId } from "../components/customer-quick-view/customerQuickViewTabs"
import type { DashboardTileFontId } from "./dashboardQuickLinksPrefs"
import { DASHBOARD_TILE_FONT_OPTIONS } from "./dashboardQuickLinksPrefs"

export const CUSTOMER_QUICK_VIEW_TAB_STYLES_META_KEY = "customer_quick_view_tab_styles"

export type CustomerQuickViewTabStyle = {
  backgroundColor?: string
  color?: string
  fontFamily?: DashboardTileFontId
  icon?: string
}

export const CUSTOMER_QUICK_VIEW_TAB_BG_SWATCHES = [
  "#e0f2fe",
  "#dbeafe",
  "#dcfce7",
  "#bbf7d0",
  "#fef9c3",
  "#fde68a",
  "#fee2e2",
  "#fecaca",
  "#f8fafc",
  "#ffffff",
  "#f1f5f9",
  "#1e293b",
]

export const CUSTOMER_QUICK_VIEW_TAB_TEXT_SWATCHES = [
  "#0f172a",
  "#1e293b",
  "#0369a1",
  "#166534",
  "#854d0e",
  "#991b1b",
  "#ffffff",
  "#475569",
]

export const CUSTOMER_QUICK_VIEW_TAB_ICONS: { id: string; label: string; glyph: string }[] = [
  { id: "none", label: "No icon", glyph: "" },
  { id: "truck", label: "Truck", glyph: "🚚" },
  { id: "document", label: "Document", glyph: "📄" },
  { id: "engine", label: "Engine", glyph: "⚙️" },
  { id: "wrench", label: "Wrench", glyph: "🔧" },
  { id: "cone", label: "Traffic cone", glyph: "🚧" },
  { id: "phone", label: "Phone", glyph: "📞" },
  { id: "book", label: "Book", glyph: "📖" },
  { id: "calendar", label: "Calendar", glyph: "📅" },
  { id: "typewriter", label: "Typewriter", glyph: "⌨️" },
  { id: "calculator", label: "Calculator", glyph: "🧮" },
  { id: "tree", label: "Org chart", glyph: "🌳" },
  { id: "clipboard", label: "Clipboard", glyph: "📋" },
  { id: "shield", label: "Shield", glyph: "🛡️" },
  { id: "users", label: "People", glyph: "👥" },
  { id: "card", label: "Payment card", glyph: "💳" },
  { id: "receipt", label: "Receipt", glyph: "🧾" },
  { id: "hammer", label: "Hammer", glyph: "🔨" },
  { id: "package", label: "Package", glyph: "📦" },
  { id: "chart", label: "Chart", glyph: "📊" },
  { id: "flow", label: "Workflow", glyph: "🔀" },
  { id: "star", label: "Star", glyph: "⭐" },
]

const BLUE_TABS: CustomerQuickViewTabId[] = ["communications", "workflow", "full_profile", "contact", "insurance_coi"]
const GREEN_TABS: CustomerQuickViewTabId[] = ["estimates", "work_orders", "purchase_orders", "scheduling"]
const YELLOW_TABS: CustomerQuickViewTabId[] = ["invoices", "customer_payments", "receipts"]
const RED_TABS: CustomerQuickViewTabId[] = ["customer_settings"]

const DEFAULT_TAB_ICON: Partial<Record<CustomerQuickViewTabId, string>> = {
  communications: "phone",
  workflow: "flow",
  full_profile: "book",
  contact: "users",
  insurance_coi: "shield",
  estimates: "document",
  work_orders: "wrench",
  purchase_orders: "clipboard",
  scheduling: "calendar",
  invoices: "document",
  customer_payments: "calculator",
  receipts: "receipt",
  customer_settings: "gear",
}

/** gear not in list - use engine or add gear */
DEFAULT_TAB_ICON.customer_settings = "engine"

export function defaultCustomerQuickViewTabStyle(tabId: CustomerQuickViewTabId): CustomerQuickViewTabStyle {
  if (BLUE_TABS.includes(tabId)) {
    return { backgroundColor: "#e0f2fe", color: "#0369a1", icon: DEFAULT_TAB_ICON[tabId] }
  }
  if (GREEN_TABS.includes(tabId)) {
    return { backgroundColor: "#dcfce7", color: "#166534", icon: DEFAULT_TAB_ICON[tabId] }
  }
  if (YELLOW_TABS.includes(tabId)) {
    return { backgroundColor: "#fef9c3", color: "#854d0e", icon: DEFAULT_TAB_ICON[tabId] }
  }
  if (RED_TABS.includes(tabId)) {
    return { backgroundColor: "#fee2e2", color: "#991b1b", icon: DEFAULT_TAB_ICON[tabId] }
  }
  return { backgroundColor: "#f8fafc", color: "#0f172a" }
}

export function resolveCustomerQuickViewTabStyle(
  tabId: CustomerQuickViewTabId,
  stored?: Partial<Record<string, CustomerQuickViewTabStyle>>,
): CustomerQuickViewTabStyle {
  const base = defaultCustomerQuickViewTabStyle(tabId)
  const custom = stored?.[tabId]
  if (!custom) return base
  return { ...base, ...custom }
}

export function parseCustomerQuickViewTabStyles(metadata: unknown): Partial<Record<string, CustomerQuickViewTabStyle>> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_QUICK_VIEW_TAB_STYLES_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Partial<Record<string, CustomerQuickViewTabStyle>> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue
    const o = v as Record<string, unknown>
    out[k] = {
      backgroundColor: typeof o.backgroundColor === "string" ? o.backgroundColor : undefined,
      color: typeof o.color === "string" ? o.color : undefined,
      fontFamily:
        o.fontFamily === "system" || o.fontFamily === "serif" || o.fontFamily === "mono" || o.fontFamily === "rounded"
          ? o.fontFamily
          : undefined,
      icon: typeof o.icon === "string" ? o.icon : undefined,
    }
  }
  return out
}

export function fontFamilyCss(fontId?: DashboardTileFontId): string {
  const row = DASHBOARD_TILE_FONT_OPTIONS.find((f) => f.id === fontId)
  return row?.css ?? "inherit"
}

export function tabIconGlyph(iconId?: string): string {
  if (!iconId || iconId === "none") return ""
  return CUSTOMER_QUICK_VIEW_TAB_ICONS.find((i) => i.id === iconId)?.glyph ?? ""
}
