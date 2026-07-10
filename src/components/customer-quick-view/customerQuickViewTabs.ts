export type CustomerQuickViewTabId =
  | "communications"
  | "workflow"
  | "full_profile"
  | "contact"
  | "estimates"
  | "work_orders"
  | "purchase_orders"
  | "invoices"
  | "receipts"

export const CUSTOMER_QUICK_VIEW_TABS: { id: CustomerQuickViewTabId; label: string }[] = [
  { id: "communications", label: "Communications" },
  { id: "workflow", label: "Current workflow" },
  { id: "full_profile", label: "Full profile" },
  { id: "contact", label: "Contact info" },
  { id: "estimates", label: "Estimates" },
  { id: "work_orders", label: "Work orders" },
  { id: "purchase_orders", label: "Purchase orders" },
  { id: "invoices", label: "Invoices" },
  { id: "receipts", label: "Receipts" },
]
