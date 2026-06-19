/** Portal layout for training sandbox — corporate manager with full Operations access. */

export const SANDBOX_PROFILE_ROLE = "corporate_management" as const

export const SANDBOX_PORTAL_CONFIG = {
  tabs: {
    dashboard: true,
    customers: true,
    quotes: true,
    calendar: true,
    payments: true,
    account: true,
    "tech-support": true,
    settings: true,
    growth: true,
    operations: true,
    reporting: true,
    "business-workflow": true,
    "organization-chart": true,
    leads: false,
    conversations: false,
    "web-support": false,
    work_orders: true,
    purchase_orders: true,
    parts_inventory: true,
  },
  sandbox_account: true,
  demo_account: false,
  corporate_package: true,
  enable_growth_tab: true,
  enable_operations_tab: true,
  enable_work_orders_tab: true,
  enable_purchase_orders_tab: true,
  enable_parts_inventory_tab: true,
  operations_modules: {
    work_orders: true,
    purchase_orders: true,
    invoicing: true,
    inventory: true,
    team_management: true,
  },
} as const

/** v4 tile grid — quick-link shortcuts for corporate sandbox demo. */
export const SANDBOX_DASHBOARD_QUICK_LINKS = {
  v: 4 as const,
  tile_scheme: "ocean" as const,
  tile_grid: [
    "customers",
    "estimates",
    "calendar",
    "team_management",
    "operations",
    "operations_work_orders",
    "operations_purchase_orders",
    "operations_invoicing",
    "operations_inventory",
    "growth",
    "payments",
    "settings",
    "setup_guide",
    "insurance",
    "reporting",
    "business_workflow",
    "organization_chart",
    "job_types",
    "today_todo",
    "time_clock",
    "custom_receipt",
    "customer_payments_soon",
    "scheduling_tools",
    null,
    null,
  ],
}

export function mergeSandboxPortalConfigRecord(existing: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const base = SANDBOX_PORTAL_CONFIG as Record<string, unknown>
  if (!existing) return { ...base }
  return {
    ...base,
    ...existing,
    tabs: { ...(SANDBOX_PORTAL_CONFIG.tabs as Record<string, boolean>), ...(existing.tabs as Record<string, boolean> | undefined) },
    operations_modules: {
      ...SANDBOX_PORTAL_CONFIG.operations_modules,
      ...((existing.operations_modules as Record<string, boolean> | undefined) ?? {}),
    },
    sandbox_account: true,
    demo_account: false,
    corporate_package: true,
    enable_operations_tab: true,
  }
}
