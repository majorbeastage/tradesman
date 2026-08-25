import type { SupabaseClient } from "@supabase/supabase-js"
import { loadEntityAttachmentsForQuote, parseQuoteAttachmentMeta, type EntityAttachmentRow } from "./communicationAttachments"
import { computeQuoteLineTotal, parseQuoteItemMetadata, totalFromQuoteItemRows } from "./quoteItemMath"
import { quoteCustomerJobDescriptionFromMetadata } from "./estimateQuoteMetadata"
import { formatAppError } from "./formatAppError"
import { loadOwnedCustomerRows } from "./loadOwnedCustomerRows"

export const INVOICES_META_KEY = "invoices_v1"

export type InvoiceLineItem = {
  id: string
  description: string
  quantity: number
  unit_price: number
  line_kind?: string
}

export type InvoiceAttachment = {
  id: string
  public_url: string
  storage_path: string
  file_name?: string | null
  content_type?: string | null
  attach_to_customer_copy: boolean
  include_note?: boolean
  note?: string
}

export type InvoiceCustomField = {
  id: string
  label: string
  value: string
}

export type InvoiceRecord = {
  id: string
  invoice_number: string
  quote_id: string | null
  calendar_event_id: string | null
  customer_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_address: string
  job_title: string
  notes: string
  /** Staff-only notes (not on customer PDF by default). */
  internal_notes?: string
  invoice_date: string
  due_date: string
  line_items: InvoiceLineItem[]
  attachments: InvoiceAttachment[]
  custom_fields?: InvoiceCustomField[]
  payment_request_id: string | null
  status: "draft" | "sent" | "paid"
  created_at: string
  updated_at: string
  sent_at: string | null
}

export type InvoiceQuotePick = {
  id: string
  customer_id: string | null
  customer_name: string
  title: string
  total: number
}

export type InvoiceFormState = {
  invoiceId: string
  invoiceNumber: string
  quoteId: string
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  jobTitle: string
  notes: string
  internalNotes: string
  invoiceDate: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  attachments: InvoiceAttachment[]
  customFields: InvoiceCustomField[]
  paymentRequestId: string
  status: InvoiceRecord["status"]
}

export type CustomerInvoicePickerRow = {
  id: string
  display_name: string
  phone: string
  email: string
  service_address: string
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x)
}

import {
  bumpDocumentNumberMeta,
  formatDocumentNumber,
  parseDocumentNumberSettings,
} from "./documentNumberFormat"

export function generateInvoiceNumber(meta?: Record<string, unknown> | null): string {
  if (meta && typeof meta === "object") {
    const settings = parseDocumentNumberSettings(meta, "invoice")
    if (settings.enabled === false) {
      const d = new Date()
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
      return `INV-${ymd}-${suffix}`
    }
    return formatDocumentNumber(settings)
  }
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `INV-${ymd}-${suffix}`
}

export { bumpDocumentNumberMeta, formatDocumentNumber, parseDocumentNumberSettings }

export function parseInvoices(raw: unknown): InvoiceRecord[] {
  if (!Array.isArray(raw)) return []
  const out: InvoiceRecord[] = []
  for (const row of raw) {
    if (!isRecord(row) || typeof row.id !== "string") continue
    const items: InvoiceLineItem[] = []
    if (Array.isArray(row.line_items)) {
      for (const li of row.line_items) {
        if (!isRecord(li)) continue
        items.push({
          id: typeof li.id === "string" ? li.id : crypto.randomUUID(),
          description: typeof li.description === "string" ? li.description : "",
          quantity: typeof li.quantity === "number" && Number.isFinite(li.quantity) ? li.quantity : Number.parseFloat(String(li.quantity ?? 1)) || 1,
          unit_price: typeof li.unit_price === "number" && Number.isFinite(li.unit_price) ? li.unit_price : Number.parseFloat(String(li.unit_price ?? 0)) || 0,
          line_kind: typeof li.line_kind === "string" ? li.line_kind : undefined,
        })
      }
    }
    const attachments: InvoiceAttachment[] = []
    if (Array.isArray(row.attachments)) {
      for (const att of row.attachments) {
        if (!isRecord(att) || typeof att.public_url !== "string") continue
        attachments.push({
          id: typeof att.id === "string" ? att.id : crypto.randomUUID(),
          public_url: att.public_url,
          storage_path: typeof att.storage_path === "string" ? att.storage_path : "",
          file_name: typeof att.file_name === "string" ? att.file_name : null,
          content_type: typeof att.content_type === "string" ? att.content_type : null,
          attach_to_customer_copy: att.attach_to_customer_copy === true,
          include_note: att.include_note === true,
          note: typeof att.note === "string" ? att.note : "",
        })
      }
    }
    const custom_fields: InvoiceCustomField[] = []
    if (Array.isArray(row.custom_fields)) {
      for (const cf of row.custom_fields) {
        if (!isRecord(cf)) continue
        custom_fields.push({
          id: typeof cf.id === "string" ? cf.id : crypto.randomUUID(),
          label: typeof cf.label === "string" ? cf.label : "",
          value: typeof cf.value === "string" ? cf.value : "",
        })
      }
    }
    out.push({
      id: row.id,
      invoice_number: typeof row.invoice_number === "string" ? row.invoice_number : generateInvoiceNumber(),
      quote_id: typeof row.quote_id === "string" ? row.quote_id : null,
      calendar_event_id: typeof row.calendar_event_id === "string" ? row.calendar_event_id : null,
      customer_id: typeof row.customer_id === "string" ? row.customer_id : null,
      customer_name: typeof row.customer_name === "string" ? row.customer_name : "Customer",
      customer_phone: typeof row.customer_phone === "string" ? row.customer_phone : "",
      customer_email: typeof row.customer_email === "string" ? row.customer_email : "",
      customer_address: typeof row.customer_address === "string" ? row.customer_address : "",
      job_title: typeof row.job_title === "string" ? row.job_title : "",
      notes: typeof row.notes === "string" ? row.notes : "",
      internal_notes: typeof row.internal_notes === "string" ? row.internal_notes : "",
      invoice_date: typeof row.invoice_date === "string" ? row.invoice_date : new Date().toISOString().slice(0, 10),
      due_date: typeof row.due_date === "string" ? row.due_date : "",
      line_items: items,
      attachments,
      custom_fields,
      payment_request_id: typeof row.payment_request_id === "string" ? row.payment_request_id : null,
      status: row.status === "sent" || row.status === "paid" ? row.status : "draft",
      created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
      sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
    })
  }
  return out.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
}

export async function loadInvoicesFromProfile(client: SupabaseClient, userId: string): Promise<InvoiceRecord[]> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw new Error(formatAppError(error))
  const meta = isRecord(data?.metadata) ? data.metadata : {}
  return parseInvoices(meta[INVOICES_META_KEY])
}

export async function saveInvoicesToProfile(client: SupabaseClient, userId: string, invoices: InvoiceRecord[]): Promise<void> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const prevMeta = isRecord(data?.metadata) ? { ...data.metadata } : {}
  const { error: upErr } = await client
    .from("profiles")
    .update({ metadata: { ...prevMeta, [INVOICES_META_KEY]: invoices.slice(0, 300) } })
    .eq("id", userId)
  if (upErr) throw upErr
}

export function invoiceLineTotal(item: InvoiceLineItem): number {
  const meta = item.line_kind ? parseQuoteItemMetadata({ line_kind: item.line_kind }) : {}
  return computeQuoteLineTotal(item.quantity, item.unit_price, meta).total
}

export function invoiceSubtotal(items: InvoiceLineItem[]): number {
  let sum = 0
  for (const li of items) sum += invoiceLineTotal(li)
  return sum
}

export function defaultInvoiceFormState(): InvoiceFormState {
  const today = new Date()
  const invoiceDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-")
  const due = new Date(today)
  due.setDate(due.getDate() + 14)
  const dueDate = [
    due.getFullYear(),
    String(due.getMonth() + 1).padStart(2, "0"),
    String(due.getDate()).padStart(2, "0"),
  ].join("-")
  return {
    invoiceId: crypto.randomUUID(),
    invoiceNumber: generateInvoiceNumber(),
    quoteId: "",
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    jobTitle: "",
    notes: "",
    internalNotes: "",
    invoiceDate,
    dueDate,
    lineItems: [],
    attachments: [],
    customFields: [],
    paymentRequestId: "",
    status: "draft",
  }
}

export function invoiceRecordToFormState(record: InvoiceRecord): InvoiceFormState {
  return {
    invoiceId: record.id,
    invoiceNumber: record.invoice_number,
    quoteId: record.quote_id ?? "",
    customerId: record.customer_id ?? "",
    customerName: record.customer_name,
    customerPhone: record.customer_phone,
    customerEmail: record.customer_email,
    customerAddress: record.customer_address,
    jobTitle: record.job_title,
    notes: record.notes,
    internalNotes: record.internal_notes ?? "",
    invoiceDate: record.invoice_date,
    dueDate: record.due_date,
    lineItems: record.line_items.map((li) => ({ ...li })),
    attachments: record.attachments.map((a) => ({ ...a })),
    customFields: (record.custom_fields ?? []).map((c) => ({ ...c })),
    paymentRequestId: record.payment_request_id ?? "",
    status: record.status,
  }
}

export function formStateToInvoiceRecord(form: InvoiceFormState, existing?: InvoiceRecord | null): InvoiceRecord {
  const now = new Date().toISOString()
  return {
    id: form.invoiceId,
    invoice_number: form.invoiceNumber.trim() || generateInvoiceNumber(),
    quote_id: form.quoteId.trim() || null,
    calendar_event_id: existing?.calendar_event_id ?? null,
    customer_id: form.customerId.trim() || null,
    customer_name: form.customerName.trim() || "Customer",
    customer_phone: form.customerPhone.trim(),
    customer_email: form.customerEmail.trim(),
    customer_address: form.customerAddress.trim(),
    job_title: form.jobTitle.trim(),
    notes: form.notes.trim(),
    internal_notes: form.internalNotes.trim(),
    invoice_date: form.invoiceDate.trim() || now.slice(0, 10),
    due_date: form.dueDate.trim(),
    line_items: form.lineItems.map((li) => ({ ...li })),
    attachments: form.attachments.map((a) => ({ ...a })),
    custom_fields: form.customFields.map((c) => ({ ...c })),
    payment_request_id: form.paymentRequestId.trim() || null,
    status: form.status,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    sent_at: existing?.sent_at ?? null,
  }
}

function mapCustomerInvoicePickerRows(data: unknown[] | null): CustomerInvoicePickerRow[] {
  const out: CustomerInvoicePickerRow[] = []
  for (const row of data ?? []) {
    if (!isRecord(row) || typeof row.id !== "string") continue
    const identifiers = Array.isArray(row.customer_identifiers) ? row.customer_identifiers : []
    let phone = ""
    let email = ""
    for (const id of identifiers) {
      if (!isRecord(id)) continue
      const t = String(id.type ?? "").toLowerCase()
      const v = String(id.value ?? "").trim()
      if (!v) continue
      if (t === "phone" && !phone) phone = v
      if (t === "email" && !email) email = v
    }
    out.push({
      id: row.id,
      display_name: String(row.display_name ?? "").trim() || "Customer",
      phone,
      email,
      service_address: String(row.service_address ?? "").trim(),
    })
  }
  return out
}

/**
 * Invoice customer picker. Uses the same paginated owner-scoped load as the Customers hub
 * so a large shop is not wiped by a giant `.in(id, …)` URL or a failed identifier embed.
 */
export async function loadCustomersForInvoices(client: SupabaseClient, userId: string): Promise<CustomerInvoicePickerRow[]> {
  const owned = await loadOwnedCustomerRows(client, userId)
  return mapCustomerInvoicePickerRows(owned.rows)
}

export async function loadQuotesForInvoices(client: SupabaseClient, userId: string, customerId?: string | null): Promise<InvoiceQuotePick[]> {
  let q = client
    .from("quotes")
    .select("id, customer_id, metadata, customers ( display_name ), quote_items ( description, quantity, unit_price, metadata )")
    .eq("user_id", userId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(120)
  if (customerId?.trim()) q = q.eq("customer_id", customerId.trim())
  const { data, error } = await q
  if (error) throw new Error(formatAppError(error))
  const out: InvoiceQuotePick[] = []
  for (const row of data ?? []) {
    const r = row as {
      id: string
      customer_id?: string | null
      metadata?: unknown
      customers?: { display_name?: string | null } | { display_name?: string | null }[] | null
      quote_items?: { description?: string; quantity?: unknown; unit_price?: unknown; metadata?: unknown }[] | null
    }
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
    const meta = isRecord(r.metadata) ? r.metadata : {}
    const title =
      (typeof meta.job_title === "string" && meta.job_title.trim()) ||
      (typeof meta.title === "string" && meta.title.trim()) ||
      "Estimate"
    const total = totalFromQuoteItemRows(r.quote_items ?? [])
    out.push({
      id: String(r.id),
      customer_id: r.customer_id ?? null,
      customer_name: String(cust?.display_name ?? "").trim() || "Customer",
      title,
      total,
    })
  }
  return out
}

function mapQuoteAttachments(rows: EntityAttachmentRow[]): InvoiceAttachment[] {
  return rows.map((row) => {
    const parsed = parseQuoteAttachmentMeta(row.metadata)
    return {
      id: crypto.randomUUID(),
      public_url: row.public_url,
      storage_path: row.storage_path,
      file_name: row.file_name ?? null,
      content_type: row.content_type ?? null,
      attach_to_customer_copy: parsed.attachToCustomerCopy,
      include_note: parsed.includeNote,
      note: parsed.note,
    }
  })
}

export async function buildInvoiceFormFromQuote(
  client: SupabaseClient,
  userId: string,
  quoteId: string,
  base?: InvoiceFormState,
): Promise<InvoiceFormState> {
  const form = base ? { ...base } : defaultInvoiceFormState()
  const { data, error } = await client
    .from("quotes")
    .select(
      "id, customer_id, metadata, customers ( display_name, customer_identifiers ( type, value ), service_address ) , quote_items ( id, description, quantity, unit_price, metadata )",
    )
    .eq("user_id", userId)
    .eq("id", quoteId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Estimate not found.")
  const r = data as {
    id: string
    customer_id?: string | null
    metadata?: unknown
    customers?: {
      display_name?: string | null
      service_address?: string | null
      customer_identifiers?: { type?: string; value?: string }[] | null
    } | null
    quote_items?: { id?: string; description?: string; quantity?: unknown; unit_price?: unknown; metadata?: unknown }[] | null
  }
  const meta = isRecord(r.metadata) ? r.metadata : {}
  const cust = r.customers
  const title =
    (typeof meta.job_title === "string" && meta.job_title.trim()) ||
    (typeof meta.title === "string" && meta.title.trim()) ||
    "Estimate"
  let phone = ""
  let email = ""
  for (const id of cust?.customer_identifiers ?? []) {
    const t = String(id.type ?? "").toLowerCase()
    const v = String(id.value ?? "").trim()
    if (!v) continue
    if (t === "phone" && !phone) phone = v
    if (t === "email" && !email) email = v
  }
  const jobDesc = quoteCustomerJobDescriptionFromMetadata(meta)
  const lineItems: InvoiceLineItem[] = []
  for (const li of r.quote_items ?? []) {
    const itemMeta = parseQuoteItemMetadata(li.metadata)
    lineItems.push({
      id: typeof li.id === "string" ? li.id : crypto.randomUUID(),
      description: String(li.description ?? "").trim() || "Line item",
      quantity: typeof li.quantity === "number" ? li.quantity : Number.parseFloat(String(li.quantity ?? 1)) || 1,
      unit_price: typeof li.unit_price === "number" ? li.unit_price : Number.parseFloat(String(li.unit_price ?? 0)) || 0,
      line_kind: itemMeta.line_kind,
    })
  }
  const quoteAttachments = await loadEntityAttachmentsForQuote(quoteId)
  form.quoteId = String(r.id)
  form.customerId = r.customer_id ?? form.customerId
  form.customerName = String(cust?.display_name ?? "").trim() || form.customerName || "Customer"
  form.customerPhone = phone || form.customerPhone
  form.customerEmail = email || form.customerEmail
  form.customerAddress = String(cust?.service_address ?? "").trim() || form.customerAddress
  form.jobTitle = title
  form.notes = jobDesc || form.notes
  form.lineItems = lineItems.length > 0 ? lineItems : form.lineItems
  if (quoteAttachments.length > 0) form.attachments = mapQuoteAttachments(quoteAttachments)
  return form
}

export async function upsertInvoiceOnProfile(
  client: SupabaseClient,
  userId: string,
  record: InvoiceRecord,
): Promise<InvoiceRecord[]> {
  const existing = await loadInvoicesFromProfile(client, userId)
  const idx = existing.findIndex((r) => r.id === record.id)
  const next = idx >= 0 ? existing.map((r, i) => (i === idx ? record : r)) : [record, ...existing]
  await saveInvoicesToProfile(client, userId, next)
  return next
}
