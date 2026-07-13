/** Role-based dashboard quick-link defaults (mirrors src/lib/dashboardQuickLinksPrefs.ts). */

export const DEFAULT_USER_QUICK_LINK_ORDER = [
  "today_todo",
  "time_clock",
  "calendar",
  "team_management",
  "customers",
  "operations_work_orders",
  "operations_purchase_orders",
  "operations_inventory",
  "setup_guide",
] as const

export const DEFAULT_OFFICE_MANAGER_QUICK_LINK_ORDER = [
  "today_todo",
  "team_management",
  "customers",
  "estimates",
  "calendar",
  "customer_payments_soon",
  "email_client",
  "time_clock",
  "payments",
  "growth",
  "operations",
  "operations_work_orders",
  "operations_purchase_orders",
  "operations_invoicing",
  "operations_inventory",
  "custom_receipt",
  "setup_guide",
  "organization_chart",
  "business_workflow",
  "job_types",
  "reporting",
  "insurance",
] as const

const OFFICE_MANAGER_LIKE_QUICK_LINK_ROLES = new Set([
  "office_manager",
  "admin",
  "corporate_management",
])

export function usesOfficeManagerQuickLinkDefaults(role: string | null | undefined): boolean {
  if (!role) return false
  return OFFICE_MANAGER_LIKE_QUICK_LINK_ROLES.has(role)
}

export function defaultQuickLinkOrderForRole(role: string | null | undefined): string[] {
  return usesOfficeManagerQuickLinkDefaults(role)
    ? [...DEFAULT_OFFICE_MANAGER_QUICK_LINK_ORDER]
    : [...DEFAULT_USER_QUICK_LINK_ORDER]
}

export function buildDefaultDashboardQuickLinksForRole(role: string | null | undefined): Record<string, unknown> {
  const order = defaultQuickLinkOrderForRole(role)
  const cols = 4
  const rows = Math.max(2, Math.ceil(order.length / cols))
  return {
    v: 4,
    tile_grid: order,
    tile_order: order,
    tile_grid_cols: cols,
    tile_grid_rows: rows,
    tile_scheme: "paper",
    updated_at: new Date().toISOString(),
  }
}
