export type CustomerQuickViewTabId =
  | "communications"
  | "workflow"
  | "full_profile"
  | "contact"
  | "insurance_coi"
  | "estimates"
  | "work_orders"
  | "purchase_orders"
  | "scheduling"
  | "invoices"
  | "customer_payments"
  | "receipts"
  | "customer_settings"

export const CUSTOMER_QUICK_VIEW_TABS: { id: CustomerQuickViewTabId; label: string }[] = [
  { id: "communications", label: "Communications" },
  { id: "workflow", label: "Current workflow" },
  { id: "full_profile", label: "Full profile" },
  { id: "contact", label: "Contact info" },
  { id: "insurance_coi", label: "Insurance COI" },
  { id: "estimates", label: "Estimates" },
  { id: "work_orders", label: "Work orders" },
  { id: "purchase_orders", label: "Purchase orders" },
  { id: "scheduling", label: "Scheduling" },
  { id: "invoices", label: "Invoices" },
  { id: "customer_payments", label: "Customer payments" },
  { id: "receipts", label: "Receipts" },
  { id: "customer_settings", label: "Customer settings" },
]

export type CustomerQuickViewCreateTabId =
  | "estimates"
  | "work_orders"
  | "purchase_orders"
  | "invoices"
  | "receipts"
  | "scheduling"

export const CUSTOMER_QUICK_VIEW_CREATE_LABELS: Record<CustomerQuickViewCreateTabId, string> = {
  estimates: "Create estimate",
  work_orders: "Create work order",
  purchase_orders: "Create purchase order",
  invoices: "Create invoice",
  receipts: "Create receipt",
  scheduling: "Schedule",
}

export function isCustomerQuickViewCreateTab(tab: CustomerQuickViewTabId): tab is CustomerQuickViewCreateTabId {
  return tab in CUSTOMER_QUICK_VIEW_CREATE_LABELS
}
