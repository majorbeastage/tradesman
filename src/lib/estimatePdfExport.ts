import type { SupabaseClient } from "@supabase/supabase-js"
import { buildQuotePdfBytes } from "./documentPdf"
import { fetchQuoteLogoForExport } from "./quoteLogoImage"
import { computeQuoteLineTotal, parseQuoteItemMetadata } from "./quoteItemMath"
import { DEFAULT_ESTIMATE_CANCELLATION_TEMPLATE, DEFAULT_ESTIMATE_LEGAL_TEMPLATE } from "./defaultEstimateLegal"

function itemDescription(item: Record<string, unknown>): string {
  return String(item.description ?? item.item_description ?? item.name ?? "—")
}

export async function openEstimatePdfInBrowser(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<void> {
  const [{ data: quote, error: qErr }, { data: prof }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, customer_id, metadata, customers ( display_name )")
      .eq("id", quoteId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("display_name, metadata, document_template_quote").eq("id", userId).maybeSingle(),
  ])

  if (qErr || !quote) throw qErr ?? new Error("Estimate not found.")

  const { data: items, error: iErr } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("created_at", { ascending: true })
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

  const bytes = await buildQuotePdfBytes({
    title: `Quote ${quoteId.slice(0, 8)}`,
    businessLabel,
    customerName: customerName?.trim() || "Customer",
    items: pdfItems,
    templateHeader,
    templateFooter,
    includePreparedDate: meta.quote_include_prepared_date !== false,
    showLineNumbers: meta.quote_show_line_numbers === true,
    logo,
    legal: includeLegal || showSignatures ? { body: legalText, cancellation: cancelText, showSignatures } : null,
    customerCopyAttachments: [],
  })

  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener,noreferrer")
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
