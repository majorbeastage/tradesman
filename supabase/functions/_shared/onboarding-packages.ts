/** Package → role, billing, entitlements (Edge-safe duplicate of src/lib/subscriptionEntitlements.ts). */

export type ProductPackageId =
  | "estimate_tools_only"
  | "base"
  | "office_manager_entry"
  | "office_manager_pro"
  | "office_manager_elite"
  | "corporate"

export const PACKAGE_TO_BILLING: Record<ProductPackageId, string> = {
  estimate_tools_only: "estimate_tools_only",
  base: "basic_package",
  office_manager_entry: "om_entry",
  office_manager_pro: "om_pro",
  office_manager_elite: "om_elite",
  corporate: "corporate",
}

export const PACKAGE_TO_ROLE: Record<ProductPackageId, string> = {
  estimate_tools_only: "user",
  base: "user",
  office_manager_entry: "office_manager",
  office_manager_pro: "office_manager",
  office_manager_elite: "office_manager",
  corporate: "office_manager",
}

export const PACKAGE_MAX_USERS: Record<ProductPackageId, number> = {
  estimate_tools_only: 1,
  base: 1,
  office_manager_entry: 2,
  office_manager_pro: 5,
  office_manager_elite: 10,
  corporate: 20,
}

export const PACKAGE_MAX_OFFICE_MANAGERS: Record<ProductPackageId, number> = {
  estimate_tools_only: 0,
  base: 0,
  office_manager_entry: 1,
  office_manager_pro: 1,
  office_manager_elite: 2,
  corporate: 5,
}

export function isProductPackageId(s: string): s is ProductPackageId {
  return s in PACKAGE_TO_BILLING
}

export function shellSlotCount(packageId: ProductPackageId): number {
  const users = PACKAGE_MAX_USERS[packageId] ?? 1
  const oms = PACKAGE_MAX_OFFICE_MANAGERS[packageId] ?? 0
  return Math.max(0, users + oms - 1)
}

function fullOperationsTabs(): Record<string, boolean> {
  return {
    dashboard: true,
    leads: false,
    conversations: false,
    quotes: true,
    calendar: true,
    customers: true,
    payments: true,
    account: true,
    "web-support": false,
    "tech-support": true,
    settings: false,
    work_orders: true,
    purchase_orders: true,
    parts_inventory: true,
    growth: true,
  }
}

export function portalConfigForPackage(packageId: ProductPackageId): Record<string, unknown> {
  if (packageId === "estimate_tools_only") {
    return {
      tabs: {
        dashboard: true,
        leads: false,
        conversations: false,
        quotes: true,
        calendar: false,
        customers: false,
        payments: true,
        account: true,
        "web-support": true,
        "tech-support": true,
        settings: false,
      },
      estimate_tools_only_package: true,
    }
  }
  if (packageId === "corporate") {
    return {
      tabs: fullOperationsTabs(),
      corporate_package: true,
      enable_growth_tab: true,
      enable_work_orders_tab: true,
      enable_purchase_orders_tab: true,
      enable_parts_inventory_tab: true,
    }
  }
  const tabs: Record<string, boolean> = {
    dashboard: true,
    leads: false,
    conversations: false,
    quotes: true,
    calendar: true,
    customers: true,
    payments: true,
    account: true,
    "web-support": false,
    "tech-support": true,
    settings: false,
    growth: true,
  }
  return { tabs, enable_growth_tab: true }
}
