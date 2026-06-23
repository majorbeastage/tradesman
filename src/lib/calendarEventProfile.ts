import type { SupabaseClient } from "@supabase/supabase-js"
import { parseCalendarEventReceiptMeta } from "./calendarReceiptMetadata"
import { buildCalendarReceiptPdfSections } from "./receiptItemizedLines"
import { buildReceiptPdfBytes } from "./documentPdf"
import { fetchQuoteLogoForExport, resolveReceiptTemplateLogoUrl } from "./quoteLogoImage"

export type CalendarEventDisplayStatus = "Recurring" | "Upcoming" | "Complete" | "Cancelled" | "Past — no status"

export type CalendarEventProfileRow = {
  id: string
  user_id?: string | null
  title: string
  start_at: string
  end_at: string
  quote_id: string | null
  notes: string | null
  completed_at: string | null
  removed_at?: string | null
  recurrence_series_id?: string | null
  job_type_id?: string | null
  job_type_name?: string | null
  job_type_materials_list?: string | null
  quote_total?: number | null
  materials_list?: string | null
  mileage_miles?: number | null
  metadata?: unknown
  customer_name?: string | null
}

export function calendarEventDisplayStatus(ev: {
  removed_at?: string | null
  completed_at?: string | null
  recurrence_series_id?: string | null
  start_at?: string | null
  end_at?: string | null
}): CalendarEventDisplayStatus {
  if (ev.removed_at) return "Cancelled"
  if (ev.completed_at) return "Complete"
  if (ev.recurrence_series_id) return "Recurring"
  const endMs = ev.end_at ? Date.parse(ev.end_at) : Number.NaN
  const startMs = ev.start_at ? Date.parse(ev.start_at) : Number.NaN
  const ref = Number.isFinite(endMs) ? endMs : startMs
  if (Number.isFinite(ref) && ref < Date.now()) return "Past — no status"
  return "Upcoming"
}

function normalizeJobTypeEmbed(raw: unknown): { name: string | null; materials_list: string | null } {
  const row = Array.isArray(raw) ? raw[0] : raw
  if (!row || typeof row !== "object") return { name: null, materials_list: null }
  const o = row as { name?: string | null; materials_list?: string | null }
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : null
  const materials_list = typeof o.materials_list === "string" && o.materials_list.trim() ? o.materials_list.trim() : null
  return { name, materials_list }
}

function mapCalendarEventProfileRow(row: Record<string, unknown>): CalendarEventProfileRow {
  const jt = normalizeJobTypeEmbed(row.job_types)
  return {
    id: String(row.id),
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    title: typeof row.title === "string" ? row.title : "Untitled job",
    start_at: typeof row.start_at === "string" ? row.start_at : "",
    end_at: typeof row.end_at === "string" ? row.end_at : "",
    quote_id: typeof row.quote_id === "string" ? row.quote_id : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    removed_at: typeof row.removed_at === "string" ? row.removed_at : null,
    recurrence_series_id: typeof row.recurrence_series_id === "string" ? row.recurrence_series_id : null,
    job_type_id: typeof row.job_type_id === "string" ? row.job_type_id : null,
    job_type_name: jt.name,
    job_type_materials_list: jt.materials_list,
    quote_total:
      typeof row.quote_total === "number" && Number.isFinite(row.quote_total) ? row.quote_total : null,
    materials_list: typeof row.materials_list === "string" ? row.materials_list : null,
    mileage_miles:
      typeof row.mileage_miles === "number" && Number.isFinite(row.mileage_miles) ? row.mileage_miles : null,
    metadata: row.metadata,
    customer_name: null,
  }
}

/** Fix customer name from embed */
function mapRowWithCustomer(row: Record<string, unknown>): CalendarEventProfileRow {
  const base = mapCalendarEventProfileRow(row)
  const cust = row.customers
  let customer_name: string | null = null
  if (cust && typeof cust === "object" && !Array.isArray(cust)) {
    const dn = (cust as { display_name?: string | null }).display_name
    customer_name = typeof dn === "string" && dn.trim() ? dn.trim() : null
  } else if (Array.isArray(cust) && cust[0] && typeof cust[0] === "object") {
    const dn = (cust[0] as { display_name?: string | null }).display_name
    customer_name = typeof dn === "string" && dn.trim() ? dn.trim() : null
  }
  return { ...base, customer_name }
}

const SELECT_ATTEMPTS = [
  "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, mileage_miles, metadata, completed_at, removed_at, customers ( display_name ), job_types ( name, materials_list )",
  "id, user_id, title, start_at, end_at, job_type_id, quote_id, notes, quote_total, recurrence_series_id, materials_list, mileage_miles, metadata, completed_at, removed_at, customers ( display_name ), job_types ( name, materials_list )",
  "id, title, start_at, end_at, job_type_id, quote_id, notes, completed_at, removed_at, recurrence_series_id, job_types ( name )",
  "id, title, start_at, end_at, quote_id, notes, completed_at, removed_at",
]

export async function loadCustomerCalendarEventsForProfile(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  limit = 40,
): Promise<CalendarEventProfileRow[]> {
  for (const select of SELECT_ATTEMPTS) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select(select)
      .eq("user_id", userId)
      .eq("customer_id", customerId.trim())
      .order("start_at", { ascending: false })
      .limit(limit)
    if (!error) {
      return (data ?? []).map((row) => mapRowWithCustomer(row as unknown as Record<string, unknown>))
    }
    const msg = (error.message ?? "").toLowerCase()
    if (!msg.includes("does not exist") && !msg.includes("schema cache")) break
  }
  return []
}

export async function openCalendarEventSummaryPdf(
  supabase: SupabaseClient,
  userId: string,
  ev: CalendarEventProfileRow,
): Promise<void> {
  if (!ev.completed_at) {
    throw new Error("PDF summary is available after the job is marked complete.")
  }

  const profileUserId = ev.user_id?.trim() || userId
  let itemize = false
  let includeMileage = false
  let mileageRatePerMile = 0
  let templateHeader: string | null = null
  let templateFooter: string | null = null
  let receiptBusinessLabel = "Job summary"
  let logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>> = null

  const { data: prof } = await supabase
    .from("profiles")
    .select("metadata, document_template_receipt, display_name")
    .eq("id", profileUserId)
    .maybeSingle()

  const foot = (prof as { document_template_receipt?: string | null } | null)?.document_template_receipt
  templateFooter = typeof foot === "string" && foot.trim() ? foot.trim() : null
  const dn = (prof as { display_name?: string | null } | null)?.display_name
  if (typeof dn === "string" && dn.trim()) receiptBusinessLabel = dn.trim()
  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  itemize = meta.receipt_template_itemize === true
  const rr = meta.receipt_mileage_rate_per_mile
  if (typeof rr === "number" && Number.isFinite(rr) && rr >= 0) mileageRatePerMile = rr
  else if (typeof rr === "string") {
    const p = Number.parseFloat(rr.replace(/[^0-9.]/g, ""))
    if (Number.isFinite(p) && p >= 0) mileageRatePerMile = p
  }
  const includeMileageExplicit = meta.receipt_template_include_mileage
  includeMileage =
    includeMileageExplicit === true || (includeMileageExplicit !== false && itemize && mileageRatePerMile > 0)
  const introRaw = meta.receipt_template_intro
  templateHeader = typeof introRaw === "string" && introRaw.trim() ? introRaw.trim() : null
  if (meta.receipt_template_show_logo === true) {
    const u = resolveReceiptTemplateLogoUrl(meta)
    if (u) logo = await fetchQuoteLogoForExport(u)
  }

  const receiptMeta = parseCalendarEventReceiptMeta(ev.metadata)
  const miles =
    ev.mileage_miles != null && Number.isFinite(Number(ev.mileage_miles)) && Number(ev.mileage_miles) > 0
      ? Number(ev.mileage_miles)
      : 0

  const sections = await buildCalendarReceiptPdfSections(supabase, {
    quote_id: ev.quote_id,
    materials_list: ev.materials_list ?? null,
    job_types: ev.job_type_materials_list ? { materials_list: ev.job_type_materials_list } : null,
    start_at: ev.start_at,
    end_at: ev.end_at,
    receiptMeta,
    itemizeMaterials: itemize,
    mileageMiles: miles > 0 ? miles : null,
    mileageRatePerMile: includeMileage && mileageRatePerMile > 0 ? mileageRatePerMile : null,
  })

  const mileageCostInItemized = includeMileage && miles > 0 && mileageRatePerMile > 0
  const mileageLabel = miles > 0 && !mileageCostInItemized ? `Mileage: ${miles} mi` : null
  const amount =
    sections.lineSubtotal != null
      ? `Total: $${sections.lineSubtotal.toFixed(2)}`
      : ev.quote_total != null && ev.quote_total > 0
        ? `Quote total: $${ev.quote_total.toFixed(2)}`
        : null

  const completedLabel = new Date(ev.completed_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })

  const bytes = await buildReceiptPdfBytes({
    businessLabel: receiptBusinessLabel,
    customerName: ev.customer_name?.trim() || "Customer",
    jobTitle: ev.title,
    completedAtLabel: completedLabel,
    amountLabel: amount,
    templateHeader,
    logo,
    templateFooter,
    scheduledDurationLabel: sections.scheduledDurationLabel,
    quoteLineItems: sections.quoteLines,
    includeMaterialsChecklist: itemize,
    materialsChecklistLines: sections.materialsChecklistLines,
    lineSubtotalLabel:
      sections.lineSubtotal != null
        ? itemize
          ? `Itemized subtotal: $${sections.lineSubtotal.toFixed(2)}`
          : `Line items subtotal: $${sections.lineSubtotal.toFixed(2)}`
        : null,
    mileageLabel,
    receiptItemizeMode: itemize,
    documentTitle: "Job summary",
    jobLabel: "Job",
    completedLabel: "Completed",
  })

  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener,noreferrer")
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
