import type { PortalSettingItem } from "../types/portal-builder"

/** Field toggles for purchase order PDF — stored on profiles.metadata as purchase_order_template_* */
export const PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS: PortalSettingItem[] = [
  { id: "purchase_order_template_show_logo", type: "checkbox", label: "Company logo", defaultChecked: true },
  {
    id: "purchase_order_template_intro",
    type: "custom_field",
    label: "Header note on purchase order",
    customFieldSubtype: "textarea",
  },
  {
    id: "purchase_order_template_footer",
    type: "custom_field",
    label: "Footer note on purchase order",
    customFieldSubtype: "textarea",
  },
  { id: "purchase_order_template_include_po_header", type: "checkbox", label: "PO number, vendor & status", defaultChecked: true },
  { id: "purchase_order_template_include_customer", type: "checkbox", label: "Customer name", defaultChecked: true },
  { id: "purchase_order_template_include_estimate_ref", type: "checkbox", label: "Linked estimate / job", defaultChecked: true },
  { id: "purchase_order_template_include_description", type: "checkbox", label: "PO description", defaultChecked: true },
  { id: "purchase_order_template_include_material_lines", type: "checkbox", label: "Material & part lines from estimate", defaultChecked: true },
  { id: "purchase_order_template_include_part_numbers", type: "checkbox", label: "Part numbers (from line item metadata)", defaultChecked: true },
  { id: "purchase_order_template_include_quantities", type: "checkbox", label: "Quantities & unit costs", defaultChecked: true },
  { id: "purchase_order_template_include_total", type: "checkbox", label: "PO total", defaultChecked: true },
  { id: "purchase_order_template_include_work_order_ref", type: "checkbox", label: "Linked work order number", defaultChecked: false },
]
