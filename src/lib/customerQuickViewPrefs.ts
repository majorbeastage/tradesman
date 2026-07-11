import type { CustomerQuickViewTabId } from "../components/customer-quick-view/customerQuickViewTabs"

export const CUSTOMER_QUICK_VIEW_PREFS_META_KEY = "customer_quick_view_prefs"
export const CUSTOMER_QUICK_VIEW_TAB_VISIBILITY_META_KEY = "customer_quick_view_tab_visibility"

export type CustomerQuickViewViewMode = "all_customers" | "custom_per_customer"

/** Tabs the user may show or hide (Communications and Full profile are always on). */
export type ConfigurableCustomerQuickViewTabId = Exclude<
  CustomerQuickViewTabId,
  "communications" | "full_profile" | "customer_settings"
>

export type CustomerQuickViewTabVisibility = Record<ConfigurableCustomerQuickViewTabId, boolean>

export type CustomerQuickViewPrefs = {
  v: 1
  viewMode: CustomerQuickViewViewMode
  tabVisibility: CustomerQuickViewTabVisibility
}

export const CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_IDS: ConfigurableCustomerQuickViewTabId[] = [
  "workflow",
  "contact",
  "insurance_coi",
  "estimates",
  "work_orders",
  "purchase_orders",
  "scheduling",
  "invoices",
  "customer_payments",
  "receipts",
]

export const CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_LABELS: Record<ConfigurableCustomerQuickViewTabId, string> = {
  workflow: "Current workflow",
  contact: "Contact info",
  insurance_coi: "Insurance COI",
  estimates: "Estimates",
  work_orders: "Work orders",
  purchase_orders: "Purchase orders",
  scheduling: "Scheduling",
  invoices: "Invoices",
  customer_payments: "Customer payments",
  receipts: "Receipts",
}

export function defaultCustomerQuickViewTabVisibility(): CustomerQuickViewTabVisibility {
  return {
    workflow: true,
    contact: true,
    insurance_coi: true,
    estimates: true,
    work_orders: true,
    purchase_orders: true,
    scheduling: true,
    invoices: true,
    customer_payments: true,
    receipts: true,
  }
}

export function defaultCustomerQuickViewPrefs(): CustomerQuickViewPrefs {
  return {
    v: 1,
    viewMode: "all_customers",
    tabVisibility: defaultCustomerQuickViewTabVisibility(),
  }
}

function parseTabVisibility(raw: unknown): Partial<CustomerQuickViewTabVisibility> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out: Partial<CustomerQuickViewTabVisibility> = {}
  for (const id of CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_IDS) {
    if (typeof o[id] === "boolean") out[id] = o[id]
  }
  return Object.keys(out).length > 0 ? out : null
}

export function parseCustomerQuickViewPrefs(metadata: unknown): CustomerQuickViewPrefs {
  const defaults = defaultCustomerQuickViewPrefs()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return defaults
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_QUICK_VIEW_PREFS_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults
  const o = raw as Record<string, unknown>
  const partial = parseTabVisibility(o.tab_visibility ?? o.tabVisibility)
  const viewMode = o.view_mode === "custom_per_customer" || o.viewMode === "custom_per_customer"
    ? "custom_per_customer"
    : "all_customers"
  return {
    v: 1,
    viewMode,
    tabVisibility: { ...defaults.tabVisibility, ...(partial ?? {}) },
  }
}

export function parseCustomerQuickViewTabVisibilityOverride(customerMetadata: unknown): Partial<CustomerQuickViewTabVisibility> | null {
  if (!customerMetadata || typeof customerMetadata !== "object" || Array.isArray(customerMetadata)) return null
  const raw = (customerMetadata as Record<string, unknown>)[CUSTOMER_QUICK_VIEW_TAB_VISIBILITY_META_KEY]
  return parseTabVisibility(raw)
}

export function resolveEffectiveTabVisibility(
  globalPrefs: CustomerQuickViewPrefs,
  customerMetadata?: unknown,
): CustomerQuickViewTabVisibility {
  const base = { ...globalPrefs.tabVisibility }
  if (globalPrefs.viewMode !== "custom_per_customer") return base
  const override = parseCustomerQuickViewTabVisibilityOverride(customerMetadata)
  if (!override) return base
  return { ...base, ...override }
}

export function isQuickViewTabVisible(
  tabId: CustomerQuickViewTabId,
  globalPrefs: CustomerQuickViewPrefs,
  customerMetadata?: unknown,
): boolean {
  if (tabId === "communications" || tabId === "full_profile") return true
  if (tabId === "customer_settings") return globalPrefs.viewMode === "custom_per_customer"
  const visibility = resolveEffectiveTabVisibility(globalPrefs, customerMetadata)
  return visibility[tabId as ConfigurableCustomerQuickViewTabId] !== false
}

export function buildCustomerQuickViewPrefsPayload(prefs: CustomerQuickViewPrefs): Record<string, unknown> {
  return {
    v: 1,
    view_mode: prefs.viewMode,
    tab_visibility: prefs.tabVisibility,
  }
}

export function buildCustomerTabVisibilityPayload(visibility: CustomerQuickViewTabVisibility): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const id of CONFIGURABLE_CUSTOMER_QUICK_VIEW_TAB_IDS) {
    out[id] = visibility[id] !== false
  }
  return out
}
