import type { SupabaseClient } from "@supabase/supabase-js"
import type { ReceiptAdditionalLine } from "./calendarReceiptMetadata"
import { bumpCustomerLastActivityAt } from "./customerSchedulingActivity"
import { buildReceiptPdfBytes } from "./documentPdf"
import { fetchQuoteLogoForExport, resolveReceiptTemplateLogoUrl } from "./quoteLogoImage"
import { computeQuoteLineTotal, parseQuoteItemMetadata } from "./quoteItemMath"

export type CustomReceiptLineItem = ReceiptAdditionalLine

export type CustomReceiptDraft = {
  id: string
  created_at: string
  updated_at: string
  customer_id?: string | null
  customer_name: string
  customer_phone?: string
  customer_email?: string
  customer_address?: string
  receipt_date: string
  job_title: string
  notes?: string
  line_items: CustomReceiptLineItem[]
  manual_amount?: number | null
  sent_at?: string | null
  status?: string | null
}

export type CustomReceiptTemplateSettings = {
  businessLabel: string
  templateHeader: string | null
  templateFooter: string | null
  itemize: boolean
  logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>>
}

export type CustomReceiptFormState = {
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  receiptDate: string
  jobTitle: string
  notes: string
  lineItems: CustomReceiptLineItem[]
  manualAmount: string
  useManualAmount: boolean
}

export type CustomerReceiptPickerRow = {
  id: string
  display_name: string
  phone: string
  email: string
  service_address: string
}

const CUSTOM_RECEIPTS_META_KEY = "custom_receipts"

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x)
}

function lineKindLabel(kind: string | undefined): string {
  const k = (kind ?? "").toLowerCase()
  if (k === "labor") return "Labor"
  if (k === "material") return "Material"
  if (k === "misc") return "Misc"
  if (k === "fee") return "Fee"
  if (k === "other") return "Other"
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "Line"
}

export function newCustomReceiptLine(partial?: Partial<CustomReceiptLineItem>): CustomReceiptLineItem {
  return {
    id: partial?.id?.trim() || crypto.randomUUID(),
    description: partial?.description ?? "",
    quantity: partial?.quantity ?? 1,
    unit_price: partial?.unit_price ?? 0,
    line_kind: partial?.line_kind ?? "misc",
  }
}

export function defaultCustomReceiptFormState(): CustomReceiptFormState {
  const today = new Date()
  const receiptDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-")
  return {
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    receiptDate,
    jobTitle: "",
    notes: "",
    lineItems: [],
    manualAmount: "",
    useManualAmount: false,
  }
}

export function formatCustomReceiptLineItems(lines: CustomReceiptLineItem[]): { quoteLines: string[]; subtotal: number } {
  const quoteLines: string[] = []
  let subtotal = 0
  for (const add of lines) {
    const meta = parseQuoteItemMetadata({ line_kind: add.line_kind })
    const qty = Number.isFinite(add.quantity) ? add.quantity : 0
    const up = Number.isFinite(add.unit_price) ? add.unit_price : 0
    const { total } = computeQuoteLineTotal(qty, up, meta)
    subtotal += total
    const kind = lineKindLabel(add.line_kind)
    quoteLines.push(
      `[${kind}] ${add.description.trim() || "Item"} — ${qty} × $${up.toFixed(2)} = $${total.toFixed(2)}`,
    )
  }
  return { quoteLines, subtotal }
}

export function parseCustomReceiptDrafts(raw: unknown): CustomReceiptDraft[] {
  if (!isRecord(raw)) return []
  const rows = raw[CUSTOM_RECEIPTS_META_KEY]
  if (!Array.isArray(rows)) return []
  const out: CustomReceiptDraft[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : ""
    const customer_name = typeof row.customer_name === "string" ? row.customer_name : ""
    if (!id || !customer_name.trim()) continue
    const line_items: CustomReceiptLineItem[] = []
    if (Array.isArray(row.line_items)) {
      for (const li of row.line_items) {
        if (!isRecord(li)) continue
        line_items.push(
          newCustomReceiptLine({
            id: typeof li.id === "string" ? li.id : undefined,
            description: typeof li.description === "string" ? li.description : "",
            quantity: typeof li.quantity === "number" ? li.quantity : Number.parseFloat(String(li.quantity ?? 0)) || 0,
            unit_price:
              typeof li.unit_price === "number" ? li.unit_price : Number.parseFloat(String(li.unit_price ?? 0)) || 0,
            line_kind: typeof li.line_kind === "string" ? li.line_kind : "misc",
          }),
        )
      }
    }
    const manualRaw = row.manual_amount
    const manual_amount =
      typeof manualRaw === "number" && Number.isFinite(manualRaw)
        ? manualRaw
        : typeof manualRaw === "string" && manualRaw.trim()
          ? Number.parseFloat(manualRaw.replace(/[^0-9.]/g, ""))
          : null
    out.push({
      id,
      created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
      customer_id: typeof row.customer_id === "string" ? row.customer_id : null,
      customer_name: customer_name.trim(),
      customer_phone: typeof row.customer_phone === "string" ? row.customer_phone : undefined,
      customer_email: typeof row.customer_email === "string" ? row.customer_email : undefined,
      customer_address: typeof row.customer_address === "string" ? row.customer_address : undefined,
      receipt_date:
        typeof row.receipt_date === "string" && row.receipt_date.trim()
          ? row.receipt_date.trim()
          : new Date().toISOString().slice(0, 10),
      job_title: typeof row.job_title === "string" ? row.job_title : "",
      notes: typeof row.notes === "string" ? row.notes : undefined,
      line_items,
      manual_amount: manual_amount != null && Number.isFinite(manual_amount) ? manual_amount : null,
      sent_at: typeof row.sent_at === "string" ? row.sent_at : undefined,
      status: typeof row.status === "string" ? row.status : undefined,
    })
  }
  return out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
}

export function customReceiptDraftToFormState(draft: CustomReceiptDraft): CustomReceiptFormState {
  return {
    customerId: draft.customer_id?.trim() ?? "",
    customerName: draft.customer_name,
    customerPhone: draft.customer_phone ?? "",
    customerEmail: draft.customer_email ?? "",
    customerAddress: draft.customer_address ?? "",
    receiptDate: draft.receipt_date,
    jobTitle: draft.job_title,
    notes: draft.notes ?? "",
    lineItems: draft.line_items.map((li) => newCustomReceiptLine(li)),
    manualAmount: draft.manual_amount != null && Number.isFinite(draft.manual_amount) ? draft.manual_amount.toFixed(2) : "",
    useManualAmount: draft.manual_amount != null && Number.isFinite(draft.manual_amount),
  }
}

export function formStateToCustomReceiptDraft(
  form: CustomReceiptFormState,
  existing?: CustomReceiptDraft | null,
): CustomReceiptDraft {
  const manualParsed = Number.parseFloat(form.manualAmount.replace(/[^0-9.]/g, ""))
  const now = new Date().toISOString()
  return {
    id: existing?.id ?? crypto.randomUUID(),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    customer_id: form.customerId.trim() || null,
    customer_name: form.customerName.trim(),
    customer_phone: form.customerPhone.trim() || undefined,
    customer_email: form.customerEmail.trim() || undefined,
    customer_address: form.customerAddress.trim() || undefined,
    receipt_date: form.receiptDate.trim() || now.slice(0, 10),
    job_title: form.jobTitle.trim(),
    notes: form.notes.trim() || undefined,
    line_items: form.lineItems,
    manual_amount: form.useManualAmount && Number.isFinite(manualParsed) ? manualParsed : null,
  }
}

export async function loadReceiptTemplateSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<CustomReceiptTemplateSettings> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("metadata, document_template_receipt, display_name")
    .eq("id", userId)
    .maybeSingle()
  const foot = (prof as { document_template_receipt?: string | null } | null)?.document_template_receipt
  const templateFooter = typeof foot === "string" && foot.trim() ? foot.trim() : null
  const dn = (prof as { display_name?: string | null } | null)?.display_name
  const businessLabel = typeof dn === "string" && dn.trim() ? dn.trim() : "Receipt"
  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  const itemize = meta.receipt_template_itemize === true
  const introRaw = meta.receipt_template_intro
  const templateHeader = typeof introRaw === "string" && introRaw.trim() ? introRaw.trim() : null
  let logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>> = null
  if (meta.receipt_template_carry_from_estimate === true || meta.receipt_template_show_logo === true) {
    const u = resolveReceiptTemplateLogoUrl(meta)
    if (u) logo = await fetchQuoteLogoForExport(u)
  }
  return { businessLabel, templateHeader, templateFooter, itemize, logo }
}

function formatReceiptDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate.trim() || new Date().toLocaleDateString([], { dateStyle: "medium" })
  return d.toLocaleDateString([], { dateStyle: "medium" })
}

function buildAmountLabel(form: CustomReceiptFormState, subtotal: number): string | null {
  if (form.useManualAmount) {
    const manual = Number.parseFloat(form.manualAmount.replace(/[^0-9.]/g, ""))
    if (Number.isFinite(manual)) return `Total: $${manual.toFixed(2)}`
  }
  if (subtotal > 0) return `Total: $${subtotal.toFixed(2)}`
  return null
}

export async function buildCustomReceiptPdfBytes(
  form: CustomReceiptFormState,
  template: CustomReceiptTemplateSettings,
  opts?: { sandboxWatermark?: boolean },
): Promise<Uint8Array> {
  const { quoteLines, subtotal } = formatCustomReceiptLineItems(form.lineItems)
  const customerName = form.customerName.trim() || "Customer"
  const contactLines = [
    form.customerPhone.trim() ? `Phone: ${form.customerPhone.trim()}` : "",
    form.customerEmail.trim() ? `Email: ${form.customerEmail.trim()}` : "",
    form.customerAddress.trim() ? `Address: ${form.customerAddress.trim()}` : "",
  ].filter(Boolean)
  const jobTitle = form.jobTitle.trim() || "Custom receipt"
  const completedAtLabel = formatReceiptDateLabel(form.receiptDate)
  const amountLabel = buildAmountLabel(form, subtotal)
  const headerNote = form.notes.trim() || null
  const templateHeader = [template.templateHeader, headerNote].filter(Boolean).join("\n\n") || null

  return buildReceiptPdfBytes({
    businessLabel: template.businessLabel,
    customerName,
    customerContactLines: contactLines,
    jobTitle,
    completedAtLabel,
    amountLabel,
    templateHeader,
    templateFooter: template.templateFooter,
    logo: template.logo,
    quoteLineItems: quoteLines,
    lineSubtotalLabel:
      subtotal > 0
        ? form.useManualAmount
          ? `Line items subtotal: $${subtotal.toFixed(2)}`
          : `Line items subtotal: $${subtotal.toFixed(2)}`
        : null,
    receiptItemizeMode: template.itemize,
    documentTitle: "Receipt",
    jobLabel: "Description",
    completedLabel: "Date",
    sandboxWatermark: opts?.sandboxWatermark,
  })
}

export async function loadCustomReceiptsForCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<CustomReceiptDraft[]> {
  const { data, error } = await supabase.from("customers").select("metadata").eq("id", customerId).maybeSingle()
  if (error) throw error
  const meta = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata : {}
  return parseCustomReceiptDrafts(meta)
}

export async function saveCustomReceiptToCustomerProfile(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  draft: CustomReceiptDraft,
  existingCustomerMetadata?: unknown,
): Promise<CustomReceiptDraft[]> {
  const base =
    existingCustomerMetadata && typeof existingCustomerMetadata === "object" && !Array.isArray(existingCustomerMetadata)
      ? { ...(existingCustomerMetadata as Record<string, unknown>) }
      : {}
  const prev = parseCustomReceiptDrafts(base)
  const nextList = [draft, ...prev.filter((r) => r.id !== draft.id)].slice(0, 40)
  const nextMeta = { ...base, [CUSTOM_RECEIPTS_META_KEY]: nextList }
  const { error } = await supabase.from("customers").update({ metadata: nextMeta }).eq("id", customerId)
  if (error) {
    const msg = error.message ?? String(error)
    if (msg.toLowerCase().includes("metadata")) {
      throw new Error("Run supabase/customers-metadata.sql in Supabase to save receipts on customer profiles.")
    }
    throw error
  }

  const { subtotal } = formatCustomReceiptLineItems(draft.line_items)
  const total =
    draft.manual_amount != null && Number.isFinite(draft.manual_amount) ? draft.manual_amount : subtotal > 0 ? subtotal : null
  const bodyParts = [
    `Custom receipt saved for ${draft.customer_name}.`,
    draft.job_title ? `Description: ${draft.job_title}` : "",
    `Date: ${formatReceiptDateLabel(draft.receipt_date)}`,
    total != null ? `Amount: $${total.toFixed(2)}` : "",
    draft.line_items.length ? `${draft.line_items.length} line item(s).` : "",
  ].filter(Boolean)

  await supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: customerId,
    event_type: "note",
    direction: "outbound",
    subject: "Custom receipt saved",
    body: bodyParts.join(" "),
    unread: false,
    metadata: { source: "custom_receipt", custom_receipt_id: draft.id },
  })
  await bumpCustomerLastActivityAt(supabase, customerId)
  return nextList
}

export async function loadCustomersForCustomReceipt(
  supabase: SupabaseClient,
  userId: string,
): Promise<CustomerReceiptPickerRow[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, display_name, service_address, customer_identifiers ( type, value )")
    .eq("user_id", userId)
    .order("display_name", { ascending: true })
    .limit(500)
  if (error) throw error
  return (data ?? []).map((row) => {
    const ids = (row as { customer_identifiers?: Array<{ type?: string; value?: string | null }> }).customer_identifiers ?? []
    const phone = ids.find((i) => i.type === "phone")?.value?.trim() ?? ""
    const email = ids.find((i) => i.type === "email")?.value?.trim() ?? ""
    const service_address =
      typeof (row as { service_address?: string | null }).service_address === "string"
        ? String((row as { service_address?: string | null }).service_address).trim()
        : ""
    return {
      id: String((row as { id: string }).id),
      display_name: String((row as { display_name?: string | null }).display_name ?? "").trim() || "Customer",
      phone,
      email,
      service_address,
    }
  })
}
