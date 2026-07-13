import type { SupabaseClient } from "@supabase/supabase-js"
import { parseQuoteItemMetadata, computeQuoteLineTotal } from "./quoteItemMath"
import { loadWorkOrdersFromProfile, type WorkOrderRecord } from "./workOrders"
import type { PurchaseOrderRecord } from "./purchaseOrders"
import { isTemplateChecked } from "./jobDocumentTemplate"
import { PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "./purchaseOrderDocumentTemplate"
import { buildJobDocumentPdfBytes, fetchImageBytesForQuotePdf, type JobDocumentPdfSection } from "./documentPdf"
import { isSandboxProfile } from "./sandboxEnvironment"

async function fetchLogoForTemplate(metadata: Record<string, unknown>, showLogo: boolean) {
  if (!showLogo) return null
  const url =
    (typeof metadata.estimate_template_logo_url === "string" ? metadata.estimate_template_logo_url.trim() : "") ||
    (typeof metadata.quote_logo_url === "string" ? metadata.quote_logo_url.trim() : "")
  if (!url) return null
  return fetchImageBytesForQuotePdf(url)
}

export async function buildPurchaseOrderDocumentPdf(
  supabase: SupabaseClient,
  userId: string,
  purchaseOrder: PurchaseOrderRecord,
  templateForm: Record<string, string>,
): Promise<Uint8Array> {
  const on = (id: string) => isTemplateChecked(templateForm, id)

  const [{ data: prof }, quoteItemsRes, customerRes, workOrders] = await Promise.all([
    supabase.from("profiles").select("display_name, metadata").eq("id", userId).maybeSingle(),
    purchaseOrder.quote_id
      ? supabase
          .from("quote_items")
          .select("description, quantity, unit_price, metadata")
          .eq("quote_id", purchaseOrder.quote_id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    purchaseOrder.customer_id
      ? supabase.from("customers").select("display_name, service_address").eq("id", purchaseOrder.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadWorkOrdersFromProfile(supabase, userId),
  ])

  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  const businessLabel =
    typeof prof?.display_name === "string" && prof.display_name.trim() ? prof.display_name.trim() : "Purchase order"

  const linkedWo: WorkOrderRecord | undefined = purchaseOrder.work_order_id
    ? workOrders.find((w) => w.id === purchaseOrder.work_order_id)
    : purchaseOrder.quote_id
      ? workOrders.find((w) => w.quote_id === purchaseOrder.quote_id)
      : undefined

  const sections: JobDocumentPdfSection[] = []

  if (on("purchase_order_template_include_po_header")) {
    sections.push({
      heading: "Purchase order",
      lines: [
        `PO number: ${purchaseOrder.po_number}`,
        `Vendor: ${purchaseOrder.vendor_name}`,
        `Status: ${purchaseOrder.status}`,
        `Created: ${new Date(purchaseOrder.created_at).toLocaleString()}`,
      ],
    })
  }

  if (on("purchase_order_template_include_customer") && (purchaseOrder.customer_id || customerRes.data)) {
    const name =
      (typeof customerRes.data?.display_name === "string" ? customerRes.data.display_name.trim() : "") ||
      purchaseOrder.estimate_title ||
      "Customer"
    const addr = typeof customerRes.data?.service_address === "string" ? customerRes.data.service_address.trim() : ""
    const lines = [`Customer: ${name}`]
    if (addr) lines.push(`Service address: ${addr}`)
    sections.push({ heading: "Customer / job", lines })
  }

  if (on("purchase_order_template_include_estimate_ref") && purchaseOrder.estimate_title) {
    sections.push({
      heading: "Linked estimate",
      lines: [purchaseOrder.estimate_title],
    })
  }

  if (on("purchase_order_template_include_work_order_ref") && linkedWo) {
    sections.push({
      heading: "Work order",
      lines: [`${linkedWo.work_order_number} · ${linkedWo.status}`],
    })
  }

  if (on("purchase_order_template_include_description") && purchaseOrder.description.trim()) {
    sections.push({ heading: "Description", lines: [purchaseOrder.description.trim()] })
  }

  const materialLines: string[] = []
  const items = quoteItemsRes.data ?? []
  const includeMaterials = on("purchase_order_template_include_material_lines")
  const includePartNumbers = on("purchase_order_template_include_part_numbers")
  const includeQty = on("purchase_order_template_include_quantities")

  if (includeMaterials || includePartNumbers) {
    for (const item of items) {
      const qMeta = parseQuoteItemMetadata(item.metadata)
      const rawMeta =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {}
      if (qMeta.line_kind && qMeta.line_kind !== "material" && includeMaterials) continue
      const desc = String(item.description ?? "Item").trim()
      const part =
        (typeof rawMeta.part_number === "string" ? rawMeta.part_number.trim() : "") ||
        (typeof rawMeta.sku === "string" ? rawMeta.sku.trim() : "") ||
        (typeof rawMeta.part_no === "string" ? rawMeta.part_no.trim() : "")
      const qty = Number(item.quantity) || 0
      const up = Number(item.unit_price) || 0
      const { total } = computeQuoteLineTotal(qty, up, qMeta)
      const parts: string[] = [desc]
      if (includePartNumbers && part) parts.push(`Part # ${part}`)
      if (includeQty) parts.push(`${qty} × $${up.toFixed(2)} = $${total.toFixed(2)}`)
      materialLines.push(parts.join(" · "))
    }
  }

  if (materialLines.length) {
    sections.push({ heading: "Materials / parts", lines: materialLines.map((l) => `• ${l}`) })
  } else if (includeMaterials && purchaseOrder.description.trim()) {
    sections.push({
      heading: "Materials / parts",
      lines: purchaseOrder.description
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((l) => `• ${l}`),
    })
  }

  if (on("purchase_order_template_include_total") && purchaseOrder.total != null) {
    sections.push({ heading: "Total", lines: [`$${purchaseOrder.total.toFixed(2)}`] })
  }

  const logo = await fetchLogoForTemplate(meta, on("purchase_order_template_show_logo"))

  return buildJobDocumentPdfBytes({
    documentTitle: "Purchase Order",
    businessLabel,
    subtitle: purchaseOrder.po_number,
    preparedAtLabel: new Date(purchaseOrder.created_at).toLocaleDateString(),
    intro: templateForm.purchase_order_template_intro?.trim() || null,
    footer: templateForm.purchase_order_template_footer?.trim() || null,
    logo,
    sections,
    sandboxWatermark: isSandboxProfile(null, meta),
  })
}

export async function openPurchaseOrderDocumentPdf(
  supabase: SupabaseClient,
  userId: string,
  purchaseOrder: PurchaseOrderRecord,
  templateForm: Record<string, string>,
): Promise<string> {
  const bytes = await buildPurchaseOrderDocumentPdf(supabase, userId, purchaseOrder, templateForm)
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  return URL.createObjectURL(blob)
}

export { PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS }
