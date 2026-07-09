import type { PortalSettingItem } from "../types/portal-builder"

/** Field toggles for work order PDF — stored on profiles.metadata as work_order_template_* */
export const WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS: PortalSettingItem[] = [
  { id: "work_order_template_show_logo", type: "checkbox", label: "Company logo", defaultChecked: true },
  {
    id: "work_order_template_intro",
    type: "custom_field",
    label: "Header note on work order",
    customFieldSubtype: "textarea",
  },
  {
    id: "work_order_template_footer",
    type: "custom_field",
    label: "Footer note on work order",
    customFieldSubtype: "textarea",
  },
  { id: "work_order_template_include_wo_header", type: "checkbox", label: "Work order number, status & dates", defaultChecked: true },
  { id: "work_order_template_include_customer_name", type: "checkbox", label: "Customer name", defaultChecked: true },
  { id: "work_order_template_include_customer_contact", type: "checkbox", label: "Phone & email", defaultChecked: true },
  { id: "work_order_template_include_service_address", type: "checkbox", label: "Service / job site address", defaultChecked: true },
  { id: "work_order_template_include_approval", type: "checkbox", label: "Customer approval status", defaultChecked: true },
  { id: "work_order_template_include_estimate_summary", type: "checkbox", label: "Estimate title & total", defaultChecked: true },
  { id: "work_order_template_include_estimate_lines", type: "checkbox", label: "Estimate line items", defaultChecked: true },
  { id: "work_order_template_include_scheduling", type: "checkbox", label: "Scheduled dates & times", defaultChecked: true },
  { id: "work_order_template_include_assignee", type: "checkbox", label: "Assigned technician / crew", defaultChecked: true },
  { id: "work_order_template_include_scope", type: "checkbox", label: "Scope of work", defaultChecked: true },
  { id: "work_order_template_include_materials", type: "checkbox", label: "Materials list", defaultChecked: true },
  { id: "work_order_template_include_purchase_orders", type: "checkbox", label: "Linked purchase orders", defaultChecked: false },
  { id: "work_order_template_include_workflow_approvals", type: "checkbox", label: "Internal workflow approvals", defaultChecked: false },
]
