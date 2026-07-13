import type { SupabaseClient } from "@supabase/supabase-js"
import { buildQuotePdfBytes } from "./documentPdf"
import { isSandboxProfile } from "./sandboxEnvironment"
import { fetchQuoteLogoForExport } from "./quoteLogoImage"
import { computeQuoteLineTotal, parseQuoteItemMetadata } from "./quoteItemMath"
import { DEFAULT_ESTIMATE_CANCELLATION_TEMPLATE, DEFAULT_ESTIMATE_LEGAL_TEMPLATE } from "./defaultEstimateLegal"
import { archiveEstimatePdfBytes, getLatestArchivedEstimatePdf } from "./estimatePdfArchive"

function itemDescription(item: Record<string, unknown>): string {
  return String(item.description ?? item.item_description ?? item.name ?? "—")
}

function formatPreparedLabel(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" })
}

function pickPreparedDateIso(quoteMeta: Record<string, unknown>, createdAt: string | null | undefined): string {
  const sent = quoteMeta.estimate_sent_at ?? quoteMeta.last_sent_at
  if (typeof sent === "string" && sent.trim()) return sent.trim()
  if (typeof createdAt === "string" && createdAt.trim()) return createdAt.trim()
  return new Date().toISOString()
}

export type EstimatePdfViewResult = {
  quoteId: string
  url: string
  mode: "archived" | "generated"
  preparedAtLabel: string | null
}

async function buildEstimatePdfBytesForQuote(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  preparedDateIso?: string | null,
): Promise<Uint8Array> {
  const [{ data: quote, error: qErr }, { data: prof }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, customer_id, metadata, created_at, customers ( display_name )")
      .eq("id", quoteId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("display_name, metadata, document_template_quote").eq("id", userId).maybeSingle(),
  ])

  if (qErr || !quote) throw qErr ?? new Error("Estimate not found.")

  const { data: items, error: iErr } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
  if (iErr) throw iErr

  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  const quoteMeta =
    quote.metadata && typeof quote.metadata === "object" && !Array.isArray(quote.metadata)
      ? (quote.metadata as Record<string, unknown>)
      : {}

  const businessLabel =
    typeof prof?.display_name === "string" && prof.display_name.trim() ? prof.display_name.trim() : "Estimate"
  const templateHeader =
    typeof prof?.document_template_quote === "string" && prof.document_template_quote.trim()
      ? prof.document_template_quote.trim()
      : null
  const templateFooter =
    typeof meta.quote_template_footer === "string" && meta.quote_template_footer.trim()
      ? meta.quote_template_footer.trim()
      : null

  let logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>> = null
  if (meta.quote_show_logo === true) {
    const logoUrl = typeof meta.quote_logo_url === "string" ? meta.quote_logo_url.trim() : ""
    if (logoUrl) logo = await fetchQuoteLogoForExport(logoUrl)
  }

  const cust = quote.customers as { display_name?: string | null } | { display_name?: string | null }[] | null
  const customerName = Array.isArray(cust) ? cust[0]?.display_name : cust?.display_name

  const pdfItems = (items ?? []).map((raw) => {
    const item = raw as Record<string, unknown>
    const qty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
    const up = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0
    const parsed = parseQuoteItemMetadata(item.metadata)
    const { total } = computeQuoteLineTotal(qty, up, parsed)
    return { description: itemDescription(item), quantity: qty, unitPrice: up, total }
  })

  const legalText =
    typeof quoteMeta.estimate_legal_text === "string" && quoteMeta.estimate_legal_text.trim()
      ? quoteMeta.estimate_legal_text.trim()
      : typeof meta.estimate_legal_text === "string" && meta.estimate_legal_text.trim()
        ? meta.estimate_legal_text.trim()
        : DEFAULT_ESTIMATE_LEGAL_TEMPLATE

  const cancelText =
    typeof quoteMeta.estimate_cancellation_text === "string" && quoteMeta.estimate_cancellation_text.trim()
      ? quoteMeta.estimate_cancellation_text.trim()
      : typeof meta.estimate_cancellation_text === "string" && meta.estimate_cancellation_text.trim()
        ? meta.estimate_cancellation_text.trim()
        : DEFAULT_ESTIMATE_CANCELLATION_TEMPLATE

  const includeLegal = quoteMeta.estimate_include_legal === true || meta.quote_include_legal === true
  const showSignatures = quoteMeta.estimate_legal_signatures === true || meta.quote_legal_signatures === true
  const preparedIso = preparedDateIso ?? pickPreparedDateIso(quoteMeta, (quote as { created_at?: string }).created_at)

  return buildQuotePdfBytes({
    title: `Quote ${quoteId.slice(0, 8)}`,
    businessLabel,
    customerName: customerName?.trim() || "Customer",
    items: pdfItems,
    templateHeader,
    templateFooter,
    includePreparedDate: meta.quote_include_prepared_date !== false,
    preparedDateLabel: formatPreparedLabel(preparedIso),
    showLineNumbers: meta.quote_show_line_numbers === true,
    logo,
    legal: includeLegal || showSignatures ? { body: legalText, cancellation: cancelText, showSignatures } : null,
    customerCopyAttachments: [],
    sandboxWatermark: isSandboxProfile(null, meta),
  })
}

/** Prefer a filed archived PDF; otherwise generate, archive, and return a view URL. */
export async function openEstimatePdfForProfile(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  opts?: { archiveIfGenerated?: boolean },
): Promise<EstimatePdfViewResult> {
  const archived = await getLatestArchivedEstimatePdf(supabase, quoteId)
  if (archived?.public_url) {
    return {
      quoteId,
      url: archived.public_url,
      mode: "archived",
      preparedAtLabel: formatPreparedLabel(archived.prepared_at ?? archived.created_at),
    }
  }

  const bytes = await buildEstimatePdfBytesForQuote(supabase, userId, quoteId)
  const preparedAt = new Date().toISOString()
  if (opts?.archiveIfGenerated !== false) {
    const row = await archiveEstimatePdfBytes(supabase, userId, quoteId, bytes, {
      source: "manual",
      preparedAt,
    })
    if (row?.public_url) {
      return {
        quoteId,
        url: row.public_url,
        mode: "generated",
        preparedAtLabel: formatPreparedLabel(row.prepared_at ?? preparedAt),
      }
    }
  }

  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  return { quoteId, url, mode: "generated", preparedAtLabel: formatPreparedLabel(preparedAt) }
}

export async function archiveEstimatePdfFromQuote(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  source: "email" | "download" | "manual",
  preparedDateIso?: string | null,
): Promise<void> {
  const bytes = await buildEstimatePdfBytesForQuote(supabase, userId, quoteId, preparedDateIso)
  const preparedAt = preparedDateIso ?? new Date().toISOString()
  await archiveEstimatePdfBytes(supabase, userId, quoteId, bytes, { source, preparedAt })
}

export async function openEstimatePdfInBrowser(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<void> {
  const view = await openEstimatePdfForProfile(supabase, userId, quoteId)
  if (view.url.startsWith("blob:")) {
    window.open(view.url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(view.url), 60_000)
    return
  }
  window.open(view.url, "_blank", "noopener,noreferrer")
}
