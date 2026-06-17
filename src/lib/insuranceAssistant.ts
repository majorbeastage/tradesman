import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as defaultSupabase } from "./supabase"
import { coiExpiryStatus, daysUntilCoiExpiry } from "./coiExpiration"
import { customerPhoneFromIdentifiers, customerEmailFromIdentifiers } from "./customerIdentifiers"
import { loadCustomersForCustomReceipt, type CustomerReceiptPickerRow } from "./customReceipt"
import type { InsuranceReasonId, InsuranceTypeId } from "./thimbleInsuranceResources"

export type InsuranceJobEventRow = {
  id: string
  title: string
  start_at: string
  customer_id: string | null
  quote_id: string | null
  quote_total: number | null
  customer_name: string
  service_address: string
}

export type InsuranceCoiRecord = {
  id: string
  file_name: string
  public_url: string
  storage_path: string
  uploaded_at: string
  insurance_type: InsuranceTypeId
  reason: InsuranceReasonId
  customer_id?: string | null
  calendar_event_id?: string | null
  quote_id?: string | null
  attachment_ids: string[]
  expires_at?: string | null
  policy_number?: string | null
  source?: "assistant" | "external"
}

const COI_META_KEY = "insurance_coi_records"
const BUSINESS_COI_META_KEY = "insurance_business_coi_records"
const BUCKET = "comm-attachments"

export async function loadInsuranceCustomers(
  client: SupabaseClient,
  userId: string,
): Promise<CustomerReceiptPickerRow[]> {
  return loadCustomersForCustomReceipt(client, userId)
}

export async function loadInsuranceJobEvents(
  client: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<InsuranceJobEventRow[]> {
  const selects = [
    "id, title, start_at, customer_id, quote_id, quote_total, customers ( display_name, service_address )",
    "id, title, start_at, customer_id, quote_id, customers ( display_name, service_address )",
  ]
  for (const sel of selects) {
    const { data, error } = await client
      .from("calendar_events")
      .select(sel)
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .order("start_at", { ascending: false })
      .limit(80)
    if (error) continue
    return (data ?? []).map((row) => {
      const r = row as unknown as {
        id: string
        title?: string | null
        start_at: string
        customer_id?: string | null
        quote_id?: string | null
        quote_total?: number | null
        customers?: { display_name?: string | null; service_address?: string | null } | { display_name?: string | null; service_address?: string | null }[] | null
      }
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
      return {
        id: String(r.id),
        title: String(r.title ?? "").trim() || "Scheduled job",
        start_at: r.start_at,
        customer_id: r.customer_id ?? null,
        quote_id: r.quote_id ?? null,
        quote_total: typeof r.quote_total === "number" && Number.isFinite(r.quote_total) ? r.quote_total : null,
        customer_name: String(cust?.display_name ?? "").trim() || "Customer",
        service_address: String(cust?.service_address ?? "").trim(),
      }
    })
  }
  return []
}

export function formatInsuranceMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "—"
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatInsuranceWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

async function uploadCoiBytes(
  client: SupabaseClient,
  userId: string,
  file: File,
  subfolder: string,
): Promise<{ public_url: string; storage_path: string } | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "coi.pdf"
  const path = `${userId}/insurance/${subfolder}/${crypto.randomUUID()}-${safeName}`
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/pdf",
  })
  if (error) return null
  const { data } = client.storage.from(BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) return null
  return { public_url: data.publicUrl, storage_path: path }
}

function parseCoiList(meta: unknown, key: string): InsuranceCoiRecord[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return []
  const raw = (meta as Record<string, unknown>)[key]
  if (!Array.isArray(raw)) return []
  const out: InsuranceCoiRecord[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    if (typeof o.id !== "string" || typeof o.public_url !== "string") continue
    out.push({
      id: o.id,
      file_name: typeof o.file_name === "string" ? o.file_name : "Certificate of Insurance",
      public_url: o.public_url,
      storage_path: typeof o.storage_path === "string" ? o.storage_path : "",
      uploaded_at: typeof o.uploaded_at === "string" ? o.uploaded_at : new Date().toISOString(),
      insurance_type: o.insurance_type === "business" ? "business" : "job_specific",
      reason: (typeof o.reason === "string" ? o.reason : "other") as InsuranceReasonId,
      customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
      calendar_event_id: typeof o.calendar_event_id === "string" ? o.calendar_event_id : null,
      quote_id: typeof o.quote_id === "string" ? o.quote_id : null,
      attachment_ids: Array.isArray(o.attachment_ids) ? o.attachment_ids.map(String) : [],
      expires_at: typeof o.expires_at === "string" ? o.expires_at : null,
      policy_number: typeof o.policy_number === "string" ? o.policy_number : null,
      source: o.source === "external" ? "external" : "assistant",
    })
  }
  return out
}

export type SaveCoiInput = {
  userId: string
  file: File
  insuranceType: InsuranceTypeId
  reason: InsuranceReasonId
  customerId?: string | null
  calendarEventId?: string | null
  quoteId?: string | null
  expiresAt?: string | null
  policyNumber?: string | null
  source?: "assistant" | "external"
}

export function listBusinessCoiRecords(profileMetadata: unknown): InsuranceCoiRecord[] {
  return parseCoiList(profileMetadata, BUSINESS_COI_META_KEY)
}

export function listCustomerCoiRecords(customerMetadata: unknown): InsuranceCoiRecord[] {
  return parseCoiList(customerMetadata, COI_META_KEY)
}

export type CoiTodoItem = {
  id: string
  label: string
  expiresAt: string | null
  scope: "business" | "customer" | "job"
  customerId?: string | null
  calendarEventId?: string | null
  daysUntil: number | null
  status: "expired" | "expiring_soon"
}

/** Collect COI renewal items for dashboard to-do (expired or within 30 days). */
export async function loadCoiTodoItems(
  client: SupabaseClient,
  userId: string,
): Promise<CoiTodoItem[]> {
  const now = Date.now()
  const items: CoiTodoItem[] = []

  const { data: prof } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  for (const rec of listBusinessCoiRecords(prof?.metadata)) {
    const status = coiExpiryStatus(rec.expires_at, now)
    if (status !== "expired" && status !== "expiring_soon") continue
    items.push({
      id: rec.id,
      label: rec.file_name,
      expiresAt: rec.expires_at ?? null,
      scope: "business",
      daysUntil: daysUntilCoiExpiry(rec.expires_at, now),
      status,
    })
  }

  const { data: customers } = await client.from("customers").select("id, display_name, metadata").eq("user_id", userId).limit(500)
  for (const row of customers ?? []) {
    const name = String((row as { display_name?: string | null }).display_name ?? "").trim() || "Customer"
    const cid = String((row as { id: string }).id)
    for (const rec of listCustomerCoiRecords((row as { metadata?: unknown }).metadata)) {
      const status = coiExpiryStatus(rec.expires_at, now)
      if (status !== "expired" && status !== "expiring_soon") continue
      items.push({
        id: `${cid}:${rec.id}`,
        label: `${name} — ${rec.file_name}`,
        expiresAt: rec.expires_at ?? null,
        scope: rec.calendar_event_id ? "job" : "customer",
        customerId: cid,
        calendarEventId: rec.calendar_event_id ?? null,
        daysUntil: daysUntilCoiExpiry(rec.expires_at, now),
        status,
      })
    }
  }

  items.sort((a, b) => {
    const da = a.daysUntil ?? -9999
    const db = b.daysUntil ?? -9999
    return da - db
  })
  return items
}

/** Upload COI and link to customer metadata, calendar event, and estimate when available. */
export async function saveInsuranceCoi(
  input: SaveCoiInput,
  client: SupabaseClient = defaultSupabase!,
): Promise<InsuranceCoiRecord> {
  if (!client) throw new Error("Not connected.")
  const subfolder = input.calendarEventId
    ? `jobs/${input.calendarEventId}`
    : input.customerId
      ? `customers/${input.customerId}`
      : "business"
  const up = await uploadCoiBytes(client, input.userId, input.file, subfolder)
  if (!up) throw new Error("Could not upload certificate file.")

  const coiMeta = {
    document_type: "certificate_of_insurance",
    insurance_type: input.insuranceType,
    insurance_reason: input.reason,
    customer_id: input.customerId ?? null,
    calendar_event_id: input.calendarEventId ?? null,
    quote_id: input.quoteId ?? null,
    linked_entities: {
      customer: Boolean(input.customerId),
      calendar_event: Boolean(input.calendarEventId),
      estimate: Boolean(input.quoteId),
      invoice: Boolean(input.quoteId),
      documents: true,
    },
  }

  const attachmentIds: string[] = []

  if (input.calendarEventId) {
    const { data, error } = await client
      .from("entity_attachments")
      .insert({
        user_id: input.userId,
        calendar_event_id: input.calendarEventId,
        storage_path: up.storage_path,
        public_url: up.public_url,
        content_type: input.file.type || "application/pdf",
        file_name: input.file.name || "COI.pdf",
        metadata: coiMeta,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    if (data?.id) attachmentIds.push(String(data.id))
  }

  if (input.quoteId) {
    const { data, error } = await client
      .from("entity_attachments")
      .insert({
        user_id: input.userId,
        quote_id: input.quoteId,
        storage_path: up.storage_path,
        public_url: up.public_url,
        content_type: input.file.type || "application/pdf",
        file_name: input.file.name || "COI.pdf",
        metadata: coiMeta,
      })
      .select("id")
      .single()
    if (!error && data?.id) attachmentIds.push(String(data.id))
  }

  const record: InsuranceCoiRecord = {
    id: crypto.randomUUID(),
    file_name: input.file.name || "Certificate of Insurance",
    public_url: up.public_url,
    storage_path: up.storage_path,
    uploaded_at: new Date().toISOString(),
    insurance_type: input.insuranceType,
    reason: input.reason,
    customer_id: input.customerId ?? null,
    calendar_event_id: input.calendarEventId ?? null,
    quote_id: input.quoteId ?? null,
    attachment_ids: attachmentIds,
    expires_at: input.expiresAt ?? null,
    policy_number: input.policyNumber ?? null,
    source: input.source ?? "assistant",
  }

  if (input.customerId) {
    const { data: cust } = await client.from("customers").select("metadata").eq("id", input.customerId).maybeSingle()
    const meta =
      cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
        ? (cust.metadata as Record<string, unknown>)
        : {}
    const list = parseCoiList(meta, COI_META_KEY)
    const nextMeta = { ...meta, [COI_META_KEY]: [record, ...list].slice(0, 40) }
    const { error } = await client.from("customers").update({ metadata: nextMeta }).eq("id", input.customerId)
    if (error && !error.message.includes("metadata")) throw new Error(error.message)
  }

  if (input.insuranceType === "business" && !input.customerId) {
    const { data: prof } = await client.from("profiles").select("metadata").eq("id", input.userId).maybeSingle()
    const meta =
      prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
        ? (prof.metadata as Record<string, unknown>)
        : {}
    const list = parseCoiList(meta, BUSINESS_COI_META_KEY)
    const nextMeta = { ...meta, [BUSINESS_COI_META_KEY]: [record, ...list].slice(0, 40) }
    const { error } = await client.from("profiles").update({ metadata: nextMeta }).eq("id", input.userId)
    if (error) throw new Error(error.message)
  }

  if (input.customerId) {
    const { data: idents } = await client
      .from("customer_identifiers")
      .select("type, value")
      .eq("customer_id", input.customerId)
      .eq("user_id", input.userId)
    const ids = (idents ?? []) as { type: string; value: string }[]
    const contact = [customerPhoneFromIdentifiers(ids), customerEmailFromIdentifiers(ids)].filter(Boolean).join(" · ")
    void client.from("communication_events").insert({
      user_id: input.userId,
      customer_id: input.customerId,
      event_type: "note",
      direction: "outbound",
      subject: "Certificate of insurance uploaded",
      body: `COI saved via Insurance Assistant${contact ? ` (${contact})` : ""}. Linked to customer, job, and documents.`,
      unread: false,
      metadata: { source: "insurance_assistant", coi_id: record.id },
    })
  }

  return record
}

/** Share an on-file COI with a customer (and optional job) without re-uploading. */
export async function provideExistingCoiToCustomer(
  input: {
    userId: string
    customerId: string
    coi: InsuranceCoiRecord
    calendarEventId?: string | null
    quoteId?: string | null
  },
  client: SupabaseClient = defaultSupabase!,
): Promise<void> {
  if (!client) throw new Error("Not connected.")
  const { data: cust } = await client.from("customers").select("metadata").eq("id", input.customerId).maybeSingle()
  const meta =
    cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
      ? (cust.metadata as Record<string, unknown>)
      : {}
  const list = parseCoiList(meta, COI_META_KEY)
  const linked: InsuranceCoiRecord = {
    ...input.coi,
    id: crypto.randomUUID(),
    customer_id: input.customerId,
    calendar_event_id: input.calendarEventId ?? input.coi.calendar_event_id ?? null,
    quote_id: input.quoteId ?? input.coi.quote_id ?? null,
    uploaded_at: new Date().toISOString(),
  }
  const nextMeta = { ...meta, [COI_META_KEY]: [linked, ...list].slice(0, 40) }
  const { error } = await client.from("customers").update({ metadata: nextMeta }).eq("id", input.customerId)
  if (error && !error.message.includes("metadata")) throw new Error(error.message)

  const expiryLine = linked.expires_at
    ? ` Expiration: ${new Date(linked.expires_at).toLocaleDateString(undefined, { dateStyle: "medium" })}.`
    : ""
  void client.from("communication_events").insert({
    user_id: input.userId,
    customer_id: input.customerId,
    event_type: "note",
    direction: "outbound",
    subject: "Certificate of insurance provided",
    body: `${linked.file_name} shared with this customer.${expiryLine} View: ${linked.public_url}`,
    unread: false,
    metadata: {
      source: "insurance_coi_provide",
      coi_id: linked.id,
      calendar_event_id: linked.calendar_event_id,
    },
  })
}

export function customerContactLine(row: CustomerReceiptPickerRow): string {
  const parts = [row.phone, row.email].filter(Boolean)
  return parts.join(" · ")
}
