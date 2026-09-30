import { buildQuotePdfBytes, fetchImageBytesForQuotePdf, type QuotePdfCustomerCopyAttachment } from "./documentPdf"
import { fetchQuoteLogoForExport, resolveBusinessLogoUrl, resolveReceiptTemplateLogoUrl } from "./quoteLogoImage"
import type { InvoiceFormState, InvoiceLineItem } from "./invoices"
import { invoiceLineTotal } from "./invoices"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parseDocumentVisualTemplate, type DocumentVisualStyle } from "./documentVisualTemplate"
import { buildGraphicalCustomerDocumentPdf } from "./graphicalDocumentPdf"
import { parseBusinessPublicProfileSettings } from "./businessPublicProfile"
import { resolveDocumentBusinessPhone } from "./userPublicBusinessLine"

export type InvoiceTemplateSettings = {
  businessLabel: string
  templateHeader: string | null
  templateFooter: string | null
  logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>>
  layout: DocumentVisualStyle
  primaryColor: string
  secondaryColor: string
  phone: string
  tagline: string
  includePreparedDate: boolean
  includeDueDate: boolean
  includeJobDetails: boolean
  includeDescription: boolean
}

function formatIsoDateLabel(iso: string): string {
  const d = new Date(`${iso.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.trim()
  return d.toLocaleDateString(undefined, { dateStyle: "medium" })
}

export async function loadInvoiceTemplateSettings(client: SupabaseClient, userId: string): Promise<InvoiceTemplateSettings> {
  const { data } = await client
    .from("profiles")
    .select("display_name, metadata, document_template_receipt, primary_phone, best_contact_phone")
    .eq("id", userId)
    .maybeSingle()
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
  const visual = parseDocumentVisualTemplate(meta, "invoice")
  const logoUrl = visual.style === "graphical" ? resolveBusinessLogoUrl(meta) : resolveReceiptTemplateLogoUrl(meta)
  const logo = logoUrl ? await fetchQuoteLogoForExport(logoUrl) : null
  const row = data as { primary_phone?: string | null; best_contact_phone?: string | null } | null
  const phone = await resolveDocumentBusinessPhone(client, userId, [row?.primary_phone, row?.best_contact_phone])
  const tagline = parseBusinessPublicProfileSettings(meta).tagline.trim()
  return {
    businessLabel,
    templateHeader,
    templateFooter,
    logo,
    layout: visual.style,
    primaryColor: visual.primaryColor,
    secondaryColor: visual.secondaryColor,
    phone,
    tagline,
    includePreparedDate: meta.invoice_template_include_prepared_date !== false,
    includeDueDate: meta.invoice_template_include_due_date !== false,
    includeJobDetails: meta.invoice_template_include_job_details === true,
    includeDescription: meta.invoice_template_include_description !== false,
  }
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
  opts?: { sandboxWatermark?: boolean; paymentUrl?: string | null; accountNumber?: string | null },
): Promise<Uint8Array> {
  const subtotal = form.lineItems.reduce((sum, li) => sum + invoiceLineTotal(li), 0)
  if (template.layout === "graphical") {
    const due = template.includeDueDate && form.dueDate.trim() ? formatIsoDateLabel(form.dueDate) : ""
    return buildGraphicalCustomerDocumentPdf({
      documentKind: "invoice",
      businessName: template.businessLabel,
      phone: template.phone,
      tagline: template.tagline,
      logo: template.logo,
      primaryColor: template.primaryColor,
      secondaryColor: template.secondaryColor,
      documentNumber: form.invoiceNumber,
      accountNumber: opts?.accountNumber,
      dateLabel: form.invoiceDate.trim() ? formatIsoDateLabel(form.invoiceDate) : "",
      paymentStatus: due ? `DUE ${due}` : "OPEN",
      billToName: form.customerName.trim() || "Customer",
      billToPhone: form.customerPhone,
      billToEmail: form.customerEmail,
      billToAddress: form.customerAddress,
      jobTitle: template.includeJobDetails ? form.jobTitle : "",
      notes: [template.includeDescription ? form.notes : "", opts?.paymentUrl?.trim() ? `Pay online: ${opts.paymentUrl.trim()}` : ""]
        .filter((s) => s.trim())
        .join("\n\n"),
      lines: mapLineItems(form.lineItems).map((li) => ({
        description: li.description,
        quantity: li.quantity,
        rate: li.unitPrice,
        amount: li.total,
      })),
      subtotal,
      amountPaid: null,
      balanceDue: subtotal,
      showDate: template.includePreparedDate,
      showJob: template.includeJobDetails,
      showNotes: template.includeDescription || Boolean(opts?.paymentUrl?.trim()),
      showPaymentMethod: false,
      sandboxWatermark: opts?.sandboxWatermark,
    })
  }

  const headerParts = [
    template.templateHeader?.trim() || null,
    `Invoice ${form.invoiceNumber.trim()}`,
    opts?.accountNumber?.trim() ? `Account ${opts.accountNumber.trim()}` : null,
    template.includeDueDate && form.dueDate.trim() ? `Due: ${form.dueDate.trim()}` : null,
    template.includeJobDetails && form.jobTitle.trim() ? `Job: ${form.jobTitle.trim()}` : null,
    template.includeDescription && form.notes.trim() ? form.notes.trim() : null,
    opts?.paymentUrl?.trim() ? `Pay online: ${opts.paymentUrl.trim()}` : null,
  ].filter(Boolean) as string[]

  return buildQuotePdfBytes({
    title: `Invoice ${form.invoiceNumber.trim()}`,
    businessLabel: template.businessLabel,
    customerName: form.customerName.trim() || "Customer",
    items: mapLineItems(form.lineItems),
    templateHeader: headerParts.join("\n\n"),
    templateFooter: template.templateFooter,
    includePreparedDate: template.includePreparedDate,
    preparedDateLabel: form.invoiceDate.trim() ? `Invoice date: ${form.invoiceDate.trim()}` : null,
    showLineNumbers: true,
    logo: template.logo,
    customerCopyAttachments: customerCopyAttachments(form),
    sandboxWatermark: opts?.sandboxWatermark,
  })
}

export { fetchImageBytesForQuotePdf }
