import type { PortalConfig } from "../types/portal-builder"
import {
  ALL_DASHBOARD_LINK_IDS,
  DASHBOARD_GRID_SLOT_COUNT,
  type DashboardQuickLinkId,
  type DashboardQuickLinksStored,
} from "./dashboardQuickLinksPrefs"

/** Full corporate-manager portal for training sandbox accounts. */
export const SANDBOX_PROFILE_ROLE = "corporate_management" as const

export function buildSandboxPortalConfig(): PortalConfig {
  return {
    tabs: {
      dashboard: true,
      customers: true,
      quotes: true,
      calendar: true,
      payments: true,
      account: true,
      "tech-support": true,
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
  }
}

/** Pre-fill dashboard 5×5 grid with every quick-link shortcut (corporate sandbox demo). */
export function buildSandboxDashboardQuickLinks(): DashboardQuickLinksStored {
  const preferred: DashboardQuickLinkId[] = [
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
  ]
  const rest = (Array.from(ALL_DASHBOARD_LINK_IDS) as DashboardQuickLinkId[]).filter((id) => !preferred.includes(id))
  const ordered = [...preferred, ...rest]
  const tile_grid = Array.from({ length: DASHBOARD_GRID_SLOT_COUNT }, (_, i) => ordered[i] ?? null)
  return { v: 4, tile_grid, tile_scheme: "ocean" }
}

export function mergeSandboxPortalConfig(existing: PortalConfig | null | undefined): PortalConfig {
  const base = buildSandboxPortalConfig()
  if (!existing || typeof existing !== "object") return base
  return {
    ...base,
    ...existing,
    tabs: { ...(base.tabs ?? {}), ...(existing.tabs ?? {}) },
    operations_modules: { ...(base.operations_modules ?? {}), ...(existing.operations_modules ?? {}) },
    sandbox_account: true,
    demo_account: false,
    corporate_package: true,
    enable_operations_tab: true,
  }
}

/** @deprecated use buildSandboxPortalConfig() */
export const SANDBOX_PORTAL_CONFIG = buildSandboxPortalConfig()
