import { buildQuotePdfBytes, fetchImageBytesForQuotePdf, type QuotePdfCustomerCopyAttachment } from "./documentPdf"
import { fetchQuoteLogoForExport, resolveReceiptTemplateLogoUrl } from "./quoteLogoImage"
import type { InvoiceFormState, InvoiceLineItem } from "./invoices"
import { invoiceLineTotal } from "./invoices"
import type { SupabaseClient } from "@supabase/supabase-js"

export type InvoiceTemplateSettings = {
  businessLabel: string
  templateHeader: string | null
  templateFooter: string | null
  logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>>
}

export async function loadInvoiceTemplateSettings(client: SupabaseClient, userId: string): Promise<InvoiceTemplateSettings> {
  const { data } = await client.from("profiles").select("display_name, metadata, document_template_receipt").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const businessLabel = String(data?.display_name ?? "").trim() || "Invoice"
  const templateHeader =
    (typeof meta.invoice_template_header === "string" && meta.invoice_template_header.trim()) ||
    (typeof data?.document_template_receipt === "string" && data.document_template_receipt.trim()) ||
    null
  const templateFooter = typeof meta.invoice_template_footer === "string" ? meta.invoice_template_footer.trim() || null : null
  const logoUrl = resolveReceiptTemplateLogoUrl(meta)
  const logo = logoUrl ? await fetchQuoteLogoForExport(logoUrl) : null
  return { businessLabel, templateHeader, templateFooter, logo }
}

function mapLineItems(items: InvoiceLineItem[]) {
  return items.map((li) => ({
    description: li.description,
    quantity: li.quantity,
    unitPrice: li.unit_price,
    total: invoiceLineTotal(li),
  }))
}

function customerCopyAttachments(form: InvoiceFormState): QuotePdfCustomerCopyAttachment[] {
  return form.attachments
    .filter((a) => a.attach_to_customer_copy && a.public_url.trim())
    .map((a) => ({
      publicUrl: a.public_url,
      fileName: (a.file_name || "Attachment").trim(),
      contentType: a.content_type ?? null,
      description: a.include_note && a.note?.trim() ? a.note.trim() : "",
    }))
}

export async function buildInvoicePdfBytes(
  form: InvoiceFormState,
  template: InvoiceTemplateSettings,
  opts?: { sandboxWatermark?: boolean; paymentUrl?: string | null },
): Promise<Uint8Array> {
  const headerParts = [
    template.templateHeader?.trim() || null,
    `Invoice ${form.invoiceNumber.trim()}`,
    form.dueDate.trim() ? `Due: ${form.dueDate.trim()}` : null,
    form.jobTitle.trim() ? `Job: ${form.jobTitle.trim()}` : null,
    form.notes.trim() ? form.notes.trim() : null,
    opts?.paymentUrl?.trim() ? `Pay online: ${opts.paymentUrl.trim()}` : null,
  ].filter(Boolean) as string[]

  return buildQuotePdfBytes({
    title: `Invoice ${form.invoiceNumber.trim()}`,
    businessLabel: template.businessLabel,
    customerName: form.customerName.trim() || "Customer",
    items: mapLineItems(form.lineItems),
    templateHeader: headerParts.join("\n\n"),
    templateFooter: template.templateFooter,
    includePreparedDate: true,
    preparedDateLabel: form.invoiceDate.trim() ? `Invoice date: ${form.invoiceDate.trim()}` : null,
    showLineNumbers: true,
    logo: template.logo,
    customerCopyAttachments: customerCopyAttachments(form),
    sandboxWatermark: opts?.sandboxWatermark,
  })
}

export { fetchImageBytesForQuotePdf }
