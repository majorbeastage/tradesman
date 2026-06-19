/** Portal layout for training sandbox — corporate manager with full Operations access. */

export const SANDBOX_PORTAL_CONFIG = {
  tabs: {
    dashboard: true,
    leads: true,
    conversations: true,
    quotes: true,
    calendar: true,
    customers: true,
    payments: true,
    account: true,
    "web-support": true,
    "tech-support": true,
    settings: true,
    growth: true,
    reporting: true,
    operations: true,
    work_orders: true,
    purchase_orders: true,
    parts_inventory: true,
    "business-workflow": true,
    "organization-chart": true,
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

export const SANDBOX_PROFILE_ROLE = "corporate_management" as const
