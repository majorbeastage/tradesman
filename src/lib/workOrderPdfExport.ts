import type { SupabaseClient } from "@supabase/supabase-js"
import {
  customerEmailFromIdentifiers,
  customerPhoneFromIdentifiers,
} from "./customerIdentifiers"
import { listCustomerEmailValues, listCustomerPhoneValues } from "./customerContactList"
import { estimateDisplayStatus } from "./customerDocumentStatus"
import { calendarEventAssigneeUserId } from "./calendarAssignee"
import { loadBusinessWorkflowFromMetadata } from "./businessWorkflow"
import { parseQuoteInternalWorkflow } from "./estimateWorkflowRuntime"
import { parseQuoteItemMetadata, computeQuoteLineTotal } from "./quoteItemMath"
import { materialsListToLines, buildReceiptItemizedLines } from "./receiptItemizedLines"
import { parseJobSiteFromEventMetadata } from "./jobSiteLocation"
import { loadPurchaseOrdersFromProfile } from "./purchaseOrders"
import type { WorkOrderRecord } from "./workOrders"
import { isTemplateChecked } from "./jobDocumentTemplate"
import { WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "./workOrderDocumentTemplate"
import { buildJobDocumentPdfBytes, fetchImageBytesForQuotePdf, type JobDocumentPdfSection } from "./documentPdf"

function scopeFromEventMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""
  const m = metadata as Record<string, unknown>
  const scheduled = typeof m.scheduled_scope_of_work === "string" ? m.scheduled_scope_of_work.trim() : ""
  if (scheduled) return scheduled
  return typeof m.scope_of_work === "string" ? m.scope_of_work.trim() : ""
}

function materialsFromEventMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""
  const m = metadata as Record<string, unknown>
  const scheduled = typeof m.scheduled_materials_list === "string" ? m.scheduled_materials_list.trim() : ""
  if (scheduled) return scheduled
  return typeof m.materials_list === "string" ? m.materials_list.trim() : ""
}

async function resolveAssigneeLabel(supabase: SupabaseClient, assigneeId: string): Promise<string> {
  if (!assigneeId) return "Unassigned"
  const { data } = await supabase.from("profiles").select("display_name, email").eq("id", assigneeId).maybeSingle()
  const name = typeof data?.display_name === "string" ? data.display_name.trim() : ""
  if (name) return name
  const email = typeof data?.email === "string" ? data.email.trim() : ""
  return email || assigneeId.slice(0, 8)
}

async function fetchLogoForTemplate(metadata: Record<string, unknown>, showLogo: boolean) {
  if (!showLogo) return null
  const url =
    (typeof metadata.estimate_template_logo_url === "string" ? metadata.estimate_template_logo_url.trim() : "") ||
    (typeof metadata.quote_logo_url === "string" ? metadata.quote_logo_url.trim() : "")
  if (!url) return null
  return fetchImageBytesForQuotePdf(url)
}

export async function buildWorkOrderDocumentPdf(
  supabase: SupabaseClient,
  userId: string,
  workOrder: WorkOrderRecord,
  templateForm: Record<string, string>,
): Promise<Uint8Array> {
  const on = (id: string) => isTemplateChecked(templateForm, id)

  const [{ data: prof }, quoteRes, customerRes, eventsRes, workflowOrders] = await Promise.all([
    supabase.from("profiles").select("display_name, metadata").eq("id", userId).maybeSingle(),
    supabase
      .from("quotes")
      .select("id, status, metadata, customer_id, customers ( display_name, service_address, customer_identifiers )")
      .eq("id", workOrder.quote_id)
      .eq("user_id", userId)
      .maybeSingle(),
    workOrder.customer_id
      ? supabase
          .from("customers")
          .select("display_name, service_address, customer_identifiers")
          .eq("id", workOrder.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("calendar_events")
      .select("id, title, start_at, end_at, notes, metadata, job_types ( name, materials_list )")
      .eq("user_id", userId)
      .eq("quote_id", workOrder.quote_id)
      .is("removed_at", null)
      .order("start_at", { ascending: true })
      .limit(12),
    loadPurchaseOrdersFromProfile(supabase, userId),
  ])

  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  const businessLabel =
    typeof prof?.display_name === "string" && prof.display_name.trim() ? prof.display_name.trim() : "Work order"
  const workflow = loadBusinessWorkflowFromMetadata(meta)

  const quote = quoteRes.data as {
    status?: string | null
    metadata?: unknown
    customers?: { display_name?: string | null; service_address?: string | null; customer_identifiers?: unknown } | null
  } | null

  const customerRow = customerRes.data ?? quote?.customers ?? null
  const customerName =
    (typeof customerRow?.display_name === "string" ? customerRow.display_name.trim() : "") ||
    workOrder.customer_name ||
    "Customer"

  const identifiers = customerRow?.customer_identifiers ?? null
  const phone = customerPhoneFromIdentifiers(identifiers) || listCustomerPhoneValues(identifiers)[0] || ""
  const email = customerEmailFromIdentifiers(identifiers) || listCustomerEmailValues(identifiers)[0] || ""
  const serviceAddress =
    (typeof customerRow?.service_address === "string" ? customerRow.service_address.trim() : "") || ""

  const quoteMeta =
    quote?.metadata && typeof quote.metadata === "object" && !Array.isArray(quote.metadata)
      ? (quote.metadata as Record<string, unknown>)
      : {}
  const wfState = parseQuoteInternalWorkflow(quoteMeta)
  const approvalStatus = estimateDisplayStatus(quote?.status ?? null, quote?.metadata)

  const { data: quoteItems } = await supabase
    .from("quote_items")
    .select("description, quantity, unit_price, metadata")
    .eq("quote_id", workOrder.quote_id)
    .order("created_at", { ascending: true })

  const events = (eventsRes.data ?? []) as Array<{
    id: string
    title?: string | null
    start_at?: string | null
    end_at?: string | null
    notes?: string | null
    metadata?: unknown
    job_types?: { name?: string | null; materials_list?: string | null } | null
  }>

  const sections: JobDocumentPdfSection[] = []

  if (on("work_order_template_include_wo_header")) {
    sections.push({
      heading: "Work order",
      lines: [
        `Number: ${workOrder.work_order_number}`,
        `Status: ${workOrder.status}`,
        `Created: ${new Date(workOrder.created_at).toLocaleString()}`,
        workOrder.updated_at !== workOrder.created_at
          ? `Updated: ${new Date(workOrder.updated_at).toLocaleString()}`
          : "",
      ].filter(Boolean),
    })
  }

  if (on("work_order_template_include_customer_name") || on("work_order_template_include_customer_contact") || on("work_order_template_include_service_address")) {
    const lines: string[] = []
    if (on("work_order_template_include_customer_name")) lines.push(`Customer: ${customerName}`)
    if (on("work_order_template_include_customer_contact")) {
      if (phone) lines.push(`Phone: ${phone}`)
      if (email) lines.push(`Email: ${email}`)
    }
    if (on("work_order_template_include_service_address") && serviceAddress) lines.push(`Service address: ${serviceAddress}`)
    if (lines.length) sections.push({ heading: "Customer", lines })
  }

  if (on("work_order_template_include_approval")) {
    const signedAt =
      typeof quoteMeta.customer_signed_at === "string" ? quoteMeta.customer_signed_at.trim() : ""
    sections.push({
      heading: "Approvals",
      lines: [
        `Customer approval: ${approvalStatus}`,
        signedAt ? `Signed: ${new Date(signedAt).toLocaleString()}` : "",
      ].filter(Boolean),
    })
  }

  if (on("work_order_template_include_estimate_summary") || on("work_order_template_include_estimate_lines")) {
    const estLines: string[] = []
    if (on("work_order_template_include_estimate_summary")) {
      estLines.push(`Title: ${workOrder.estimate_title}`)
      if (workOrder.estimate_total != null) estLines.push(`Total: $${workOrder.estimate_total.toFixed(2)}`)
    }
    if (on("work_order_template_include_estimate_lines")) {
      for (const item of quoteItems ?? []) {
        const qMeta = parseQuoteItemMetadata(item.metadata)
        const qty = Number(item.quantity) || 0
        const up = Number(item.unit_price) || 0
        const { total } = computeQuoteLineTotal(qty, up, qMeta)
        const desc = String(item.description ?? "Line").trim()
        const kind = qMeta.line_kind ? ` (${qMeta.line_kind})` : ""
        estLines.push(`${desc}${kind} — ${qty} × $${up.toFixed(2)} = $${total.toFixed(2)}`)
      }
    }
    if (estLines.length) sections.push({ heading: "Estimate", lines: estLines })
  }

  if (on("work_order_template_include_scheduling") && events.length > 0) {
    const lines: string[] = []
    for (const ev of events) {
      const start = ev.start_at ? new Date(ev.start_at).toLocaleString() : "—"
      const end = ev.end_at ? new Date(ev.end_at).toLocaleString() : "—"
      lines.push(`${ev.title?.trim() || "Scheduled job"}: ${start} – ${end}`)
      const jobSite = parseJobSiteFromEventMetadata(ev.metadata)
      if (jobSite.address) lines.push(`  Job site: ${jobSite.address}`)
      if (ev.notes?.trim()) lines.push(`  Notes: ${ev.notes.trim()}`)
    }
    sections.push({ heading: "Schedule", lines })
  }

  if (on("work_order_template_include_assignee") && events.length > 0) {
    const lines: string[] = []
    for (const ev of events) {
      const assigneeId = calendarEventAssigneeUserId(ev)
      const label = await resolveAssigneeLabel(supabase, assigneeId)
      lines.push(`${ev.title?.trim() || "Job"}: ${label}`)
    }
    sections.push({ heading: "Assignments", lines })
  }

  if (on("work_order_template_include_scope")) {
    const scopeParts: string[] = []
    for (const ev of events) {
      const s = scopeFromEventMetadata(ev.metadata)
      if (s) scopeParts.push(s)
    }
    const scope = scopeParts.join("\n\n").trim()
    if (scope) sections.push({ heading: "Scope of work", lines: [scope] })
  }

  if (on("work_order_template_include_materials")) {
    const materialLines: string[] = []
    for (const ev of events) {
      const fromMeta = materialsFromEventMetadata(ev.metadata)
      if (fromMeta) materialLines.push(...materialsListToLines(fromMeta))
      else {
        const checklist = await buildReceiptItemizedLines(supabase, {
          quote_id: workOrder.quote_id,
          materials_list: fromMeta,
          job_types: ev.job_types,
        })
        materialLines.push(...checklist)
      }
    }
    const unique = [...new Set(materialLines.map((l) => l.trim()).filter(Boolean))]
    if (unique.length) sections.push({ heading: "Materials", lines: unique.map((l) => `• ${l}`) })
  }

  if (on("work_order_template_include_purchase_orders")) {
    const linked = workflowOrders.filter(
      (po) => po.quote_id === workOrder.quote_id || po.work_order_id === workOrder.id,
    )
    if (linked.length) {
      sections.push({
        heading: "Purchase orders",
        lines: linked.map(
          (po) =>
            `${po.po_number} · ${po.vendor_name} · ${po.status}${po.total != null ? ` · $${po.total.toFixed(2)}` : ""}${po.description ? ` — ${po.description}` : ""}`,
        ),
      })
    }
  }

  if (on("work_order_template_include_workflow_approvals") && workflow) {
    const lines: string[] = []
    for (const node of workflow.nodes) {
      if (wfState.completedNodeIds.includes(node.id)) lines.push(`✓ ${node.label}`)
      else if (wfState.pendingNodeIds.includes(node.id)) lines.push(`○ Pending: ${node.label}`)
    }
    if (lines.length) sections.push({ heading: "Internal workflow", lines })
  }

  const logo = await fetchLogoForTemplate(meta, on("work_order_template_show_logo"))

  return buildJobDocumentPdfBytes({
    documentTitle: "Work Order",
    businessLabel,
    subtitle: workOrder.work_order_number,
    preparedAtLabel: new Date(workOrder.created_at).toLocaleDateString(),
    intro: templateForm.work_order_template_intro?.trim() || null,
    footer: templateForm.work_order_template_footer?.trim() || null,
    logo,
    sections,
  })
}

export async function openWorkOrderDocumentPdf(
  supabase: SupabaseClient,
  userId: string,
  workOrder: WorkOrderRecord,
  templateForm: Record<string, string>,
): Promise<string> {
  const bytes = await buildWorkOrderDocumentPdf(supabase, userId, workOrder, templateForm)
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  return URL.createObjectURL(blob)
}

export { WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS }
