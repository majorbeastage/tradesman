import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../../styles/theme"
import { useAuth } from "../../contexts/AuthContext"
import { useSandboxTrainingMode } from "../../lib/sandboxTrainingUi"
import { postOutboundMessages } from "../../lib/platformToolsJsonBody"
import { downloadPdfBlob, EMAIL_INLINE_PDF_MAX_BYTES, uint8ArrayToBase64 } from "../../lib/documentPdf"
import { uploadBytesForOutbound, ENTITY_ATTACHMENT_ACCEPT, ENTITY_ATTACHMENT_MAX_BYTES, uploadInvoiceAttachmentFile } from "../../lib/uploadCommAttachment"
import { entityAttachmentDisplayLabel, isProbablyImageAttachment } from "../../lib/communicationAttachments"
import { createPaymentRequestLink, fetchPaymentProviderStatus, sendPaymentRequest, type PaymentProviderId } from "../../lib/paymentRequests"
import {
  buildInvoiceFormFromQuote,
  defaultInvoiceFormState,
  formStateToInvoiceRecord,
  invoiceHasPurchaseOrderLine,
  invoiceLineFromPurchaseOrder,
  invoiceRecordToFormState,
  invoiceSubtotal,
  loadCustomersForInvoices,
  loadInvoicesFromProfile,
  loadQuotesForInvoices,
  upsertInvoiceOnProfile,
  type CustomerInvoicePickerRow,
  type InvoiceFormState,
  type InvoiceLineItem,
  type InvoiceQuotePick,
  type InvoiceRecord,
} from "../../lib/invoices"
import { buildInvoicePdfBytes, loadInvoiceTemplateSettings } from "../../lib/invoicePdfExport"
import { consumeInvoicesPrefill } from "../../lib/workflowNavigation"
import { formatDisplayText } from "../../lib/formatDisplayText"
import { formatAppError, isAuthSessionError } from "../../lib/formatAppError"
import CustomerSearchPicker, { customerSearchPickerRowToContact } from "../../components/CustomerSearchPicker"
import { getFreshAccessToken } from "../../lib/authPlatformApi"
import { useCustomerDataScope } from "../../hooks/useCustomerDataScope"
import {
  DOCUMENT_NUMBER_DIGIT_OPTIONS,
  applyDocumentNumberSettingsToMeta,
  buildDocumentNumberFormat,
  clampDocumentNumberDigits,
  formatDocumentNumber,
  parseDocumentNumberSettings,
} from "../../lib/documentNumberFormat"
import { AdminSortableRow } from "../../components/admin/AdminSortableRow"
import { reorderByIndex } from "../../lib/reorderArray"
import { appendEmailSignature, loadStoredEmailSignature, saveStoredEmailSignature } from "../../lib/emailSignature"
import { loadPurchaseOrdersFromProfile, type PurchaseOrderRecord } from "../../lib/purchaseOrders"

type InvoiceDeliveryPanel = null | "email" | "sms" | "separate_email" | "both"

function mergeCommaEmails(...parts: (string | undefined)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!part?.trim()) continue
    for (const raw of part.split(/[,;]+/)) {
      const e = raw.trim().toLowerCase()
      if (e && e.includes("@") && !seen.has(e)) {
        seen.add(e)
        out.push(e)
      }
    }
  }
  return out.join(", ")
}

type Props = {
  supabase: SupabaseClient | null
  userId: string | null
  setPage?: (page: string) => void
}

const INVOICE_LINE_KINDS = ["labor", "material", "travel", "misc"] as const
const INVOICE_LINE_KIND_LABEL: Record<(typeof INVOICE_LINE_KINDS)[number], string> = {
  labor: "Labor",
  material: "Materials",
  travel: "Travel",
  misc: "Misc",
}

function newInvoiceLine(): InvoiceLineItem {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, line_kind: "misc" }
}

function normalizeInvoiceLineKind(raw: string | undefined): (typeof INVOICE_LINE_KINDS)[number] {
  const v = String(raw || "").toLowerCase()
  return (INVOICE_LINE_KINDS as readonly string[]).includes(v) ? (v as (typeof INVOICE_LINE_KINDS)[number]) : "misc"
}

const secondaryBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  cursor: "pointer",
}

export default function InvoicesWorkspace({ supabase, userId, setPage }: Props) {
  const sandboxTraining = useSandboxTrainingMode()
  const { session, signOut } = useAuth()
  const { dataUserId, loading: customerScopeLoading } = useCustomerDataScope()
  const customerOwnerId = dataUserId || userId
  const [form, setForm] = useState<InvoiceFormState>(() => defaultInvoiceFormState())
  const [savedInvoices, setSavedInvoices] = useState<InvoiceRecord[]>([])
  const [customers, setCustomers] = useState<CustomerInvoicePickerRow[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [quotes, setQuotes] = useState<InvoiceQuotePick[]>([])
  const [busy, setBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const sendMenuRef = useRef<HTMLDivElement | null>(null)
  const [deliveryPanel, setDeliveryPanel] = useState<InvoiceDeliveryPanel>(null)
  const [invoiceEmailSubject, setInvoiceEmailSubject] = useState("")
  const [invoiceEmailBody, setInvoiceEmailBody] = useState("")
  const [invoiceEmailSignature, setInvoiceEmailSignature] = useState(() => loadStoredEmailSignature())
  const [invoiceEmailCc, setInvoiceEmailCc] = useState("")
  const [invoiceEmailBcc, setInvoiceEmailBcc] = useState("")
  const [invoiceEmailAdditionalTo, setInvoiceEmailAdditionalTo] = useState("")
  const [invoiceEmailSeparateTo, setInvoiceEmailSeparateTo] = useState("")
  const [invoiceEmailCopySelf, setInvoiceEmailCopySelf] = useState(true)
  const [invoiceEmailAttachEntity, setInvoiceEmailAttachEntity] = useState(true)
  const [invoiceSmsBody, setInvoiceSmsBody] = useState("")
  const [invoiceSmsAttachEntity, setInvoiceSmsAttachEntity] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [includePaymentLink, setIncludePaymentLink] = useState(true)
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderId>("helcim")
  const [newDesc, setNewDesc] = useState("")
  const [newQty, setNewQty] = useState("1")
  const [newUnit, setNewUnit] = useState("0")
  const [newKind, setNewKind] = useState<(typeof INVOICE_LINE_KINDS)[number]>("misc")
  const [showInvoiceSettings, setShowInvoiceSettings] = useState(false)
  const [invoiceNumberEnabled, setInvoiceNumberEnabled] = useState(false)
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState("INV")
  const [invoiceNumberDigits, setInvoiceNumberDigits] = useState("4")
  const [invoiceTplIncludePreparedDate, setInvoiceTplIncludePreparedDate] = useState(true)
  const [invoiceTplIncludeDueDate, setInvoiceTplIncludeDueDate] = useState(true)
  const [invoiceTplIncludePhotos, setInvoiceTplIncludePhotos] = useState(false)
  const [invoiceTplIncludePurchaseOrders, setInvoiceTplIncludePurchaseOrders] = useState(false)
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([])
  const [addPoId, setAddPoId] = useState("")
  const [invoiceTplIncludeJobDetails, setInvoiceTplIncludeJobDetails] = useState(false)
  const [invoiceTplIncludeCustomFields, setInvoiceTplIncludeCustomFields] = useState(false)
  const [invoiceTplIncludeDescription, setInvoiceTplIncludeDescription] = useState(true)
  const [invoiceDueIntervalUnit, setInvoiceDueIntervalUnit] = useState<"days" | "weeks" | "months">("days")
  const [invoiceDueIntervalValue, setInvoiceDueIntervalValue] = useState("14")
  const [invoiceCustomDescriptionTemplate, setInvoiceCustomDescriptionTemplate] = useState("")
  const [invoiceSectionOrder, setInvoiceSectionOrder] = useState<string[]>([
    "line_items",
    "job_details",
    "description",
    "custom_fields",
    "photos",
    "due_date",
  ])
  const [tplLoaded, setTplLoaded] = useState(false)

  function mergeInvoiceSectionOrder(raw: string[]): string[] {
    const all = ["line_items", "job_details", "description", "custom_fields", "photos", "due_date"]
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of raw) {
      if (!all.includes(id) || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
    for (const id of all) {
      if (!seen.has(id)) out.push(id)
    }
    return out
  }

  function applyInvoiceTemplateMeta(meta: Record<string, unknown>) {
    const inv = parseDocumentNumberSettings(meta, "invoice")
    setInvoiceNumberEnabled(inv.enabled === true)
    setInvoiceNumberPrefix(inv.prefix)
    setInvoiceNumberDigits(String(inv.sequenceDigits))
    setInvoiceTplIncludePreparedDate(meta.invoice_template_include_prepared_date !== false)
    setInvoiceTplIncludeDueDate(meta.invoice_template_include_due_date !== false)
    setInvoiceTplIncludePhotos(meta.invoice_template_include_photos === true)
    setInvoiceTplIncludePurchaseOrders(meta.invoice_template_include_purchase_orders === true)
    setInvoiceTplIncludeJobDetails(meta.invoice_template_include_job_details === true)
    setInvoiceTplIncludeCustomFields(meta.invoice_template_include_custom_fields === true)
    setInvoiceTplIncludeDescription(meta.invoice_template_include_description !== false)
    const unit = meta.invoice_template_due_interval_unit
    if (unit === "days" || unit === "weeks" || unit === "months") setInvoiceDueIntervalUnit(unit)
    if (typeof meta.invoice_template_due_interval_value === "number") {
      setInvoiceDueIntervalValue(String(meta.invoice_template_due_interval_value))
    }
    if (typeof meta.invoice_template_description === "string") {
      setInvoiceCustomDescriptionTemplate(meta.invoice_template_description)
    }
    if (Array.isArray(meta.invoice_template_section_order)) {
      setInvoiceSectionOrder(
        mergeInvoiceSectionOrder(meta.invoice_template_section_order.filter((x): x is string => typeof x === "string")),
      )
    }
  }

  useEffect(() => {
    if (!supabase || !userId) return
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      applyInvoiceTemplateMeta(meta)
      setTplLoaded(true)
    })()
  }, [supabase, userId])

  useEffect(() => {
    const name = form.customerName.trim() || "Customer"
    const number = form.invoiceNumber.trim() || "invoice"
    setInvoiceEmailSubject(`Invoice ${number} for ${name}`)
    setInvoiceEmailBody("Please see the invoice below and let us know if you have any questions.\n\nThank you,")
    setInvoiceSmsBody(`Hi ${name}, please see your invoice attached. Reply with any questions. Thank you!`)
  }, [form.invoiceId, form.customerName, form.invoiceNumber])

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (sendMenuRef.current && !sendMenuRef.current.contains(target)) {
        setSendMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocPointerDown)
    return () => document.removeEventListener("mousedown", onDocPointerDown)
  }, [])

  useEffect(() => {
    if (!showInvoiceSettings || !supabase || !userId || !tplLoaded) return
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      applyInvoiceTemplateMeta(meta)
    })()
  }, [showInvoiceSettings, supabase, userId, tplLoaded])

  const subtotal = useMemo(() => invoiceSubtotal(form.lineItems), [form.lineItems])

  useEffect(() => {
    if (!supabase || !userId || !invoiceTplIncludePurchaseOrders) {
      setPurchaseOrders([])
      return
    }
    const ownerId = (customerOwnerId || userId).trim()
    let cancelled = false
    void loadPurchaseOrdersFromProfile(supabase, ownerId)
      .then((rows) => {
        if (!cancelled) setPurchaseOrders(rows)
      })
      .catch(() => {
        if (!cancelled) setPurchaseOrders([])
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId, customerOwnerId, invoiceTplIncludePurchaseOrders])

  const addablePurchaseOrders = useMemo(() => {
    if (!invoiceTplIncludePurchaseOrders) return []
    const quoteId = form.quoteId.trim()
    const customerId = form.customerId.trim()
    return purchaseOrders.filter((po) => {
      if (invoiceHasPurchaseOrderLine(form.lineItems, po)) return false
      if (quoteId && po.quote_id === quoteId) return true
      if (customerId && po.customer_id === customerId) return true
      if (!quoteId && !customerId) return true
      return !po.quote_id && !po.customer_id
    })
  }, [invoiceTplIncludePurchaseOrders, purchaseOrders, form.lineItems, form.quoteId, form.customerId])

  useEffect(() => {
    if (!supabase || !userId || customerScopeLoading) return
    const ownerId = (customerOwnerId || userId).trim()
    let cancelled = false
    setCustomersLoading(true)
    void (async () => {
      try {
        const token = await getFreshAccessToken(supabase, null)
        const [invRes, custRes, statusRes] = await Promise.allSettled([
          loadInvoicesFromProfile(supabase, userId),
          ownerId ? loadCustomersForInvoices(supabase, ownerId) : Promise.resolve([]),
          fetchPaymentProviderStatus(userId, token),
        ])
        if (cancelled) return

        if (invRes.status === "fulfilled") {
          setSavedInvoices(invRes.value)
        } else if (isAuthSessionError(invRes.reason)) {
          await signOut()
          return
        } else {
          setNotice(formatAppError(invRes.reason))
        }

        if (custRes.status === "fulfilled") {
          setCustomers(custRes.value)
          const prefill = consumeInvoicesPrefill()
          if (prefill?.quoteId) {
            try {
              const next = await buildInvoiceFormFromQuote(
                supabase,
                ownerId,
                prefill.quoteId,
                defaultInvoiceFormState(),
                { includePurchaseOrders: invoiceTplIncludePurchaseOrders },
              )
              if (cancelled) return
              if (prefill.customerId) next.customerId = prefill.customerId
              setForm(next)
              const n = next.attachments.length
              setNotice(
                n > 0
                  ? `Loaded estimate with ${n} photo/file${n === 1 ? "" : "s"}.`
                  : "Loaded line items from estimate.",
              )
            } catch (e) {
              if (!cancelled) setNotice(formatAppError(e))
            }
          } else if (prefill?.customerId) {
            const row = custRes.value.find((c) => c.id === prefill.customerId)
            if (row) applyCustomer(row)
          }
        } else if (isAuthSessionError(custRes.reason)) {
          await signOut()
          return
        } else {
          setNotice(formatAppError(custRes.reason))
        }

        if (statusRes.status === "fulfilled" && statusRes.value?.defaultProvider) {
          setPaymentProvider(statusRes.value.defaultProvider)
        }
      } finally {
        if (!cancelled) setCustomersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, userId, customerOwnerId, customerScopeLoading, signOut])

  useEffect(() => {
    if (!supabase || !userId) return
    const quoteOwnerId = (customerOwnerId || userId).trim()
    void loadQuotesForInvoices(supabase, quoteOwnerId, form.customerId.trim() || null)
      .then(setQuotes)
      .catch(() => setQuotes([]))
  }, [supabase, userId, customerOwnerId, form.customerId])

  function applyCustomer(row: CustomerInvoicePickerRow) {
    setForm((prev) => ({
      ...prev,
      customerId: row.id,
      customerName: row.display_name,
      customerPhone: row.phone,
      customerEmail: row.email,
      customerAddress: row.service_address,
    }))
  }

  async function handleQuotePick(quoteId: string) {
    if (!supabase || !userId || !quoteId) return
    setBusy(true)
    setNotice(null)
    try {
      const ownerId = (customerOwnerId || userId).trim()
      const next = await buildInvoiceFormFromQuote(supabase, ownerId, quoteId, form, {
        includePurchaseOrders: invoiceTplIncludePurchaseOrders,
      })
      setForm(next)
      const n = next.attachments.length
      setNotice(
        n > 0
          ? `Estimate loaded with ${n} photo/file${n === 1 ? "" : "s"}. Edit line items or add more pictures before sending.`
          : "Estimate loaded into invoice. Add photos below if this job has pictures.",
      )
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    if (!supabase || !userId) return
    if (!form.customerName.trim()) {
      setNotice("Enter a customer name.")
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const existing = savedInvoices.find((r) => r.id === form.invoiceId) ?? null
      const record = formStateToInvoiceRecord(form, existing)
      const next = await upsertInvoiceOnProfile(supabase, userId, record)
      setSavedInvoices(next)
      setNotice("Invoice saved.")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadPdf() {
    if (!supabase || !userId) return
    setBusy(true)
    setNotice(null)
    try {
      const template = await loadInvoiceTemplateSettings(supabase, userId)
      const bytes = await buildInvoicePdfBytes(form, template, { sandboxWatermark: sandboxTraining })
      downloadPdfBlob(bytes, `${form.invoiceNumber.trim() || "invoice"}.pdf`)
      setNotice("PDF downloaded.")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length || !supabase || !userId) return
    setUploadBusy(true)
    try {
      const added = [...form.attachments]
      for (const file of Array.from(files)) {
        if (file.size > ENTITY_ATTACHMENT_MAX_BYTES) throw new Error(`${file.name} is too large (max 50 MB).`)
        const up = await uploadInvoiceAttachmentFile({ userId, invoiceId: form.invoiceId, file })
        if (!up) throw new Error(`Could not upload ${file.name}.`)
        added.push({
          id: crypto.randomUUID(),
          public_url: up.public_url,
          storage_path: up.storage_path,
          file_name: file.name,
          content_type: file.type || null,
          attach_to_customer_copy: true,
          include_note: false,
          note: "",
        })
      }
      setForm((prev) => ({ ...prev, attachments: added }))
      setNotice("File attached.")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setUploadBusy(false)
    }
  }

  async function handleSend(channel: "email" | "sms" | "both", opts?: { separateToOnly?: boolean }) {
    setSendMenuOpen(false)
    if (!supabase || !userId) return
    const cid = form.customerId.trim()
    if (!cid) {
      setNotice("Link a customer before sending.")
      return
    }
    const token = (await getFreshAccessToken(supabase, session))?.trim()
    if (!token) {
      setNotice("Sign in again to send.")
      return
    }
    const wantEmail = channel === "email" || channel === "both"
    const wantSms = channel === "sms" || channel === "both"
    const email = opts?.separateToOnly ? invoiceEmailSeparateTo.trim() : form.customerEmail.trim()
    const phone = form.customerPhone.trim()
    if (wantEmail && !email) {
      setNotice(opts?.separateToOnly ? "Enter the recipient email address." : "No email on file — add one or choose Text.")
      return
    }
    if (wantSms && !phone) {
      setNotice("No phone on file — add one or choose Email.")
      return
    }
    if (form.lineItems.length === 0) {
      setNotice("Add at least one line item.")
      return
    }
    const subject = invoiceEmailSubject.trim()
    const composedBody = invoiceEmailBody.trim()
    if (wantEmail && !subject) {
      setNotice("Enter an email subject.")
      return
    }
    if (wantEmail && !composedBody) {
      setNotice("Enter an email message.")
      return
    }
    if (wantSms && !invoiceSmsBody.trim()) {
      setNotice("Enter a text message.")
      return
    }
    setSending(true)
    setNotice(null)
    try {
      let simulatedSend = false
      let paymentUrl: string | null = null
      let paymentRequestId = form.paymentRequestId.trim()
      if (includePaymentLink && subtotal > 0) {
        try {
          const { paymentRequest, paymentUrl: url } = await createPaymentRequestLink({
            userId,
            customerId: cid,
            amount: subtotal,
            description: form.jobTitle.trim() ? `Invoice: ${form.jobTitle.trim()}` : `Invoice ${form.invoiceNumber}`,
            provider: paymentProvider,
            quoteId: form.quoteId.trim() || null,
            invoiceId: form.invoiceId,
            accessToken: token,
          })
          paymentUrl = url
          paymentRequestId = paymentRequest.id
          setForm((prev) => ({ ...prev, paymentRequestId }))
        } catch (e) {
          throw new Error(
            `${formatAppError(e)} Uncheck “Include payment link” to send the invoice without a pay button, or restart npm run dev so /api reaches the live site.`,
          )
        }
      }

      const template = await loadInvoiceTemplateSettings(supabase, userId)
      const bytes = await buildInvoicePdfBytes(form, template, {
        sandboxWatermark: sandboxTraining,
        paymentUrl,
      })
      const filename = `${form.invoiceNumber.trim() || "invoice"}.pdf`
      const copyAttachments = form.attachments.filter((a) => a.attach_to_customer_copy && a.public_url.trim())
      const attachUrls = invoiceEmailAttachEntity ? copyAttachments.map((a) => a.public_url.trim()) : []
      const imageAttachUrls = invoiceSmsAttachEntity
        ? copyAttachments
            .filter((a) => isProbablyImageAttachment(a.content_type, a.public_url, a.file_name))
            .map((a) => a.public_url.trim())
        : []

      if (wantEmail) {
        const signedInEmail = session?.user?.email?.trim().toLowerCase() ?? ""
        const ccMerged = mergeCommaEmails(invoiceEmailCopySelf ? signedInEmail : undefined, invoiceEmailCc)
        const bccMerged = mergeCommaEmails(invoiceEmailBcc)
        let bodyForSend = appendEmailSignature(composedBody, invoiceEmailSignature)
        if (paymentUrl && !bodyForSend.includes(paymentUrl)) {
          bodyForSend = `${bodyForSend}\n\nPay online: ${paymentUrl}`
        }
        if (invoiceEmailAttachEntity && copyAttachments.length > 0) {
          const noteBlocks = copyAttachments.map((a) => {
            const title = (a.file_name || "Attachment").trim()
            const desc = a.include_note && a.note?.trim() ? a.note.trim() : ""
            return desc ? `${title}\n${desc}` : title
          })
          bodyForSend = `${bodyForSend}\n\n---\nCustomer copy (additional attachments below):\n${noteBlocks.join("\n\n")}`
        }
        const attachmentPublicUrls = [...attachUrls]
        let inlineAttachments: { filename: string; content: string }[] | undefined
        if (bytes.length <= EMAIL_INLINE_PDF_MAX_BYTES) {
          inlineAttachments = [{ filename, content: uint8ArrayToBase64(bytes) }]
        } else {
          const pdfUrl = await uploadBytesForOutbound(userId, bytes, filename, "invoice-email", "application/pdf")
          if (!pdfUrl) {
            throw new Error("Invoice PDF is too large to attach by email. Try Download and send manually.")
          }
          attachmentPublicUrls.unshift(pdfUrl)
        }
        const emailResult = await postOutboundMessages(
          "email",
          {
            to: email,
            toAdditional: opts?.separateToOnly ? undefined : invoiceEmailAdditionalTo.trim() || undefined,
            cc: ccMerged || undefined,
            bcc: bccMerged || undefined,
            subject,
            body: bodyForSend,
            userId,
            customerId: cid,
            requireAttachments: true,
            ...(inlineAttachments ? { attachments: inlineAttachments } : {}),
            ...(attachmentPublicUrls.length ? { attachmentPublicUrls } : {}),
          },
          token,
        )
        if (emailResult.simulated) simulatedSend = true
      }

      if (wantSms) {
        const url = await uploadBytesForOutbound(userId, bytes, filename, "invoice-sms", "application/pdf")
        if (!url) throw new Error("Could not upload invoice PDF for text.")
        let smsBody = invoiceSmsBody.trim()
        if (paymentUrl && !smsBody.includes(paymentUrl)) smsBody = `${smsBody} Pay: ${paymentUrl}`
        if (url && !smsBody.includes(url)) smsBody = `${smsBody}\n\nInvoice PDF:\n${url}`
        const smsResult = await postOutboundMessages(
          "sms",
          {
            to: phone,
            body: smsBody,
            userId,
            customerId: cid,
            ...(imageAttachUrls.length ? { mediaPublicUrls: imageAttachUrls.slice(0, 5) } : {}),
          },
          token,
        )
        if (smsResult.simulated) simulatedSend = true
      }

      if (paymentRequestId) {
        await sendPaymentRequest({
          userId,
          paymentRequestId,
          channel: channel === "both" ? "both" : channel,
          accessToken: token,
        }).catch(() => undefined)
      }

      const existing = savedInvoices.find((r) => r.id === form.invoiceId) ?? null
      const record = formStateToInvoiceRecord(
        { ...form, paymentRequestId, status: "sent" },
        existing ? { ...existing, sent_at: new Date().toISOString() } : null,
      )
      record.sent_at = new Date().toISOString()
      record.status = "sent"
      const next = await upsertInvoiceOnProfile(supabase, userId, record)
      setSavedInvoices(next)
      setForm((prev) => ({ ...prev, status: "sent", paymentRequestId }))
      if (simulatedSend) {
        setNotice("Sandbox/training: the invoice was not sent to the customer.")
      } else {
        setDeliveryPanel(null)
        setNotice(channel === "both" ? "Invoice sent by email and text." : channel === "email" ? "Invoice emailed." : "Invoice texted.")
      }
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setSending(false)
    }
  }

  function loadSaved(id: string) {
    const row = savedInvoices.find((r) => r.id === id)
    if (!row) return
    setForm(invoiceRecordToFormState(row))
    setNotice("Loaded saved invoice.")
  }

  function startNewInvoice() {
    const next = defaultInvoiceFormState()
    if (invoiceCustomDescriptionTemplate.trim()) {
      next.notes = invoiceCustomDescriptionTemplate.trim()
    }
    setForm(next)
    setNotice(null)
  }

  const inputStyle = { ...theme.formInput, width: "100%", boxSizing: "border-box" as const }
  const sectionBase: CSSProperties = {
    marginTop: 0,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    background: "#fff",
    padding: "10px 12px",
  }
  const summaryStyle: CSSProperties = {
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    color: theme.text,
    listStyle: "none",
  }

  function sectionEnabled(id: string): boolean {
    if (id === "photos") return true
    if (id === "due_date") return invoiceTplIncludeDueDate
    if (id === "job_details") return invoiceTplIncludeJobDetails
    if (id === "custom_fields") return invoiceTplIncludeCustomFields
    if (id === "description") return invoiceTplIncludeDescription && !invoiceTplIncludeJobDetails
    return true
  }

  function sectionLabel(id: string): string {
    if (id === "description") return "Description"
    if (id === "line_items") return "Line items"
    if (id === "photos") return "Photos"
    if (id === "due_date") return "Due date"
    if (id === "job_details") return "Job details"
    if (id === "custom_fields") return "Custom fields"
    return id
  }

  const visibleSectionOrder = invoiceSectionOrder.filter(sectionEnabled)

  function renderInvoiceSection(id: string) {
    if (id === "line_items") {
      return (
        <div key={id} style={{ padding: 14, border: `1px solid ${theme.border}`, borderRadius: 10, background: "#fff" }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Line items</div>
          <div style={{ width: "100%", overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 0,
                border: "1px solid #cbd5e1",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #94a3b8", background: "#e2e8f0" }}>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700 }}>#</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700 }}>Description</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, width: 120 }}>Type</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, width: 72 }}>Qty</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, width: 96 }}>Unit $</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, width: 88 }}>Total</th>
                  <th style={{ padding: "10px 8px", width: 56 }} />
                </tr>
              </thead>
              <tbody>
                {form.lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: "#334155", fontWeight: 500 }}>
                      No line items yet — add below or load from an estimate.
                    </td>
                  </tr>
                ) : (
                  form.lineItems.map((li, rowIdx) => (
                    <tr key={li.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 600 }}>{rowIdx + 1}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          value={li.description}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              lineItems: p.lineItems.map((x) => (x.id === li.id ? { ...x, description: e.target.value } : x)),
                            }))
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <select
                          value={normalizeInvoiceLineKind(li.line_kind)}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              lineItems: p.lineItems.map((x) =>
                                x.id === li.id ? { ...x, line_kind: e.target.value } : x,
                              ),
                            }))
                          }
                          style={inputStyle}
                        >
                          {INVOICE_LINE_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {INVOICE_LINE_KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={li.quantity}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              lineItems: p.lineItems.map((x) =>
                                x.id === li.id ? { ...x, quantity: Number.parseFloat(e.target.value) || 0 } : x,
                              ),
                            }))
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={li.unit_price}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              lineItems: p.lineItems.map((x) =>
                                x.id === li.id ? { ...x, unit_price: Number.parseFloat(e.target.value) || 0 } : x,
                              ),
                            }))
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "10px 8px", fontWeight: 700 }}>${invoiceSubtotal([li]).toFixed(2)}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, lineItems: p.lineItems.filter((x) => x.id !== li.id) }))}
                          style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div
            style={{
              marginTop: 16,
              padding: 14,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              background: "#f8fafc",
              display: "grid",
              gridTemplateColumns: "minmax(160px, 2fr) 120px 72px 96px auto",
              gap: 8,
              alignItems: "end",
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 600, display: "grid", gap: 4 }}>
              Description
              <input placeholder="What this line is for" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, display: "grid", gap: 4 }}>
              Type
              <select value={newKind} onChange={(e) => setNewKind(normalizeInvoiceLineKind(e.target.value))} style={inputStyle}>
                {INVOICE_LINE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {INVOICE_LINE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, display: "grid", gap: 4 }}>
              Qty
              <input value={newQty} onChange={(e) => setNewQty(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, display: "grid", gap: 4 }}>
              Unit $
              <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} style={inputStyle} />
            </label>
            <button
              type="button"
              onClick={() => {
                const qty = Number.parseFloat(newQty) || 1
                const unit = Number.parseFloat(newUnit) || 0
                if (!newDesc.trim()) return
                setForm((p) => ({
                  ...p,
                  lineItems: [
                    ...p.lineItems,
                    { ...newInvoiceLine(), description: newDesc.trim(), quantity: qty, unit_price: unit, line_kind: newKind },
                  ],
                }))
                setNewDesc("")
                setNewQty("1")
                setNewUnit("0")
                setNewKind("misc")
              }}
              style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer", height: 38 }}
            >
              Add line item
            </button>
          </div>
          {invoiceTplIncludePurchaseOrders ? (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                border: `1px dashed ${theme.border}`,
                borderRadius: 8,
                background: "#f8fafc",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "end",
              }}
            >
              <label style={{ fontSize: 12, fontWeight: 600, display: "grid", gap: 4, flex: "1 1 220px" }}>
                Add purchase order as a line item
                <select value={addPoId} onChange={(e) => setAddPoId(e.target.value)} style={inputStyle}>
                  <option value="">
                    {addablePurchaseOrders.length === 0 ? "No unused purchase orders for this job" : "Choose purchase order…"}
                  </option>
                  {addablePurchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number}
                      {po.vendor_name ? ` — ${po.vendor_name}` : ""}
                      {po.total != null ? ` ($${po.total.toFixed(2)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!addPoId}
                onClick={() => {
                  const po = addablePurchaseOrders.find((p) => p.id === addPoId)
                  if (!po) return
                  setForm((p) => ({ ...p, lineItems: [...p.lineItems, invoiceLineFromPurchaseOrder(po)] }))
                  setAddPoId("")
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: addPoId ? theme.primary : "#94a3b8",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: addPoId ? "pointer" : "not-allowed",
                  height: 38,
                }}
              >
                Add PO line
              </button>
            </div>
          ) : null}
          <div style={{ marginTop: 12, fontWeight: 800, fontSize: 15 }}>Subtotal: ${subtotal.toFixed(2)}</div>
        </div>
      )
    }

    if (id === "job_details") {
      return (
        <details key={id} style={{ ...sectionBase, background: "#f8fafc" }}>
          <summary style={summaryStyle}>Job details</summary>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Leave note for customer to see</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Leave internal notes</span>
              <textarea
                rows={3}
                value={form.internalNotes}
                onChange={(e) => setForm((p) => ({ ...p, internalNotes: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
          </div>
        </details>
      )
    }

    if (id === "description") {
      return (
        <details key={id} style={sectionBase}>
          <summary style={summaryStyle}>Description</summary>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Notes / job description</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder={invoiceCustomDescriptionTemplate || undefined}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
          </div>
        </details>
      )
    }

    if (id === "custom_fields") {
      return (
        <details key={id} style={sectionBase}>
          <summary style={summaryStyle}>
            Custom fields
            <span style={{ fontWeight: 600, color: "#64748b", marginLeft: 8, fontSize: 13 }}>
              {form.customFields.length}
            </span>
          </summary>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {form.customFields.map((cf) => (
              <div key={cf.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Label
                  <input
                    value={cf.label}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        customFields: p.customFields.map((x) => (x.id === cf.id ? { ...x, label: e.target.value } : x)),
                      }))
                    }
                    style={{ ...inputStyle, marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Value
                  <input
                    value={cf.value}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        customFields: p.customFields.map((x) => (x.id === cf.id ? { ...x, value: e.target.value } : x)),
                      }))
                    }
                    style={{ ...inputStyle, marginTop: 4 }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, customFields: p.customFields.filter((x) => x.id !== cf.id) }))}
                  style={{ ...secondaryBtn, padding: "8px 10px", color: "#b91c1c" }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  customFields: [...p.customFields, { id: crypto.randomUUID(), label: "", value: "" }],
                }))
              }
              style={secondaryBtn}
            >
              Add custom field
            </button>
          </div>
        </details>
      )
    }

    if (id === "photos") {
      return (
        <div key={id} style={{ padding: 14, border: `1px solid ${theme.border}`, borderRadius: 10, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Photos & files</div>
            <span style={{ fontWeight: 600, color: "#64748b", fontSize: 13 }}>
              {form.attachments.length} file{form.attachments.length === 1 ? "" : "s"}
              {form.attachments.filter((a) => a.attach_to_customer_copy).length
                ? ` · ${form.attachments.filter((a) => a.attach_to_customer_copy).length} on customer copy`
                : ""}
            </span>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
            Same as the estimate tool. Pictures from a loaded estimate show here. Add more, or uncheck a file to leave it
            off the customer PDF.
          </p>
          <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            Upload photos or files
            <input
              type="file"
              multiple
              accept={ENTITY_ATTACHMENT_ACCEPT}
              disabled={uploadBusy}
              onChange={(e) => {
                void handleFileUpload(e.target.files)
                e.target.value = ""
              }}
              style={{ display: "block", marginTop: 6, fontSize: 13 }}
            />
          </label>
          {uploadBusy ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>Uploading…</p> : null}
          {form.attachments.length > 0 ? (
            <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
              {form.attachments.map((att) => (
                <li
                  key={att.id}
                  style={{
                    marginBottom: 12,
                    padding: 10,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {isProbablyImageAttachment(att.content_type, att.public_url, att.file_name) ? (
                      <img
                        src={att.public_url}
                        alt={att.file_name || "Attachment"}
                        style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                      />
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          width: 72,
                          height: 72,
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f1f5f9",
                          borderRadius: 6,
                          fontWeight: 800,
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        {entityAttachmentDisplayLabel(att.content_type, att.file_name)}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={att.public_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: 13, color: theme.primary }}>
                        {att.file_name || "File"}
                      </a>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={att.attach_to_customer_copy}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              attachments: p.attachments.map((a) =>
                                a.id === att.id ? { ...a, attach_to_customer_copy: e.target.checked } : a,
                              ),
                            }))
                          }
                        />
                        Include on customer copy
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, attachments: p.attachments.filter((a) => a.id !== att.id) }))}
                      style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}
                    >
                      Remove
                    </button>
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Note on customer copy
                    <input
                      value={att.note || ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          attachments: p.attachments.map((a) =>
                            a.id === att.id ? { ...a, note: e.target.value, include_note: Boolean(e.target.value.trim()) } : a,
                          ),
                        }))
                      }
                      placeholder="Optional description"
                      style={{ ...inputStyle, marginTop: 4 }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>No photos yet. Upload here or load an estimate that has files.</p>
          )}
        </div>
      )
    }

    if (id === "due_date") {
      return (
        <details key={id} style={sectionBase}>
          <summary style={summaryStyle}>Due date</summary>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Due date</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} style={inputStyle} />
            </label>
          </div>
        </details>
      )
    }

    return null
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 960 }}>
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, color: theme.text }}>Custom invoices</h2>
      </div>

      {notice ? (
        <p
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: /emailed|texted|Invoice sent|saved|Loaded/i.test(notice) && !/not sent|failed|HTTP|error/i.test(notice)
              ? "#047857"
              : "#9a3412",
            background: /emailed|texted|Invoice sent|saved|Loaded/i.test(notice) && !/not sent|failed|HTTP|error/i.test(notice)
              ? "#ecfdf5"
              : "#fff7ed",
            border: "1px solid currentColor",
          }}
        >
          {formatDisplayText(notice, "Something went wrong.")}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" onClick={startNewInvoice} style={secondaryBtn}>
          New invoice
        </button>
        {setPage ? (
          <button type="button" onClick={() => setPage("payments")} style={secondaryBtn}>
            Payment collection
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowInvoiceSettings(true)}
          style={secondaryBtn}
        >
          Invoice settings
        </button>
        {savedInvoices.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) loadSaved(e.target.value)
            }}
            style={{ ...theme.formInput, minWidth: 200 }}
          >
            <option value="">Open saved invoice…</option>
            {savedInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} — {inv.customer_name} (${invoiceSubtotal(inv.line_items).toFixed(2)})
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 12, padding: 14, border: `1px solid ${theme.border}`, borderRadius: 10, background: "#f8fafc" }}>
        <CustomerSearchPicker
          customers={customers}
          value={form.customerId}
          onChange={(id, row) => {
            if (row) applyCustomer(customerSearchPickerRowToContact(row))
            else {
              setForm((prev) => ({
                ...prev,
                customerId: id,
                customerName: id ? prev.customerName : "",
                customerPhone: id ? prev.customerPhone : "",
                customerEmail: id ? prev.customerEmail : "",
                customerAddress: id ? prev.customerAddress : "",
              }))
            }
          }}
          allowEmpty
          emptyLabel="— No customer —"
          loading={customersLoading}
          disabled={customersLoading}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>From estimate</span>
            <select
              value={form.quoteId}
              onChange={(e) => void handleQuotePick(e.target.value)}
              disabled={busy}
              style={inputStyle}
            >
              <option value="">Choose estimate to load…</option>
              {quotes.map((q) => {
                const number = q.estimate_number || `EST-${q.id.slice(0, 8).toUpperCase()}`
                const title = q.title.trim() && q.title.trim().toLowerCase() !== "estimate" ? q.title.trim() : ""
                const amount = `$${q.total.toFixed(2)}`
                return (
                  <option key={q.id} value={q.id}>
                    {title ? `${number} — ${title} — ${amount}` : `${number} — ${amount}`}
                  </option>
                )
              })}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Invoice #</span>
            <input value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} style={inputStyle} />
          </label>
          {invoiceTplIncludePreparedDate ? (
            <label style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Date prepared</span>
              <input type="date" value={form.invoiceDate} onChange={(e) => setForm((p) => ({ ...p, invoiceDate: e.target.value }))} style={inputStyle} />
            </label>
          ) : null}
        </div>
        <label style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Job title</span>
          <input value={form.jobTitle} onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))} style={inputStyle} />
        </label>
      </div>

      <div style={{ display: "grid", gap: 12 }}>{visibleSectionOrder.map((id) => renderInvoiceSection(id))}</div>

      <div
        style={{
          padding: 14,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          background: "#fff",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14 }}>What goes on the customer file</div>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
          This is the invoice PDF the customer gets. Edit line items and photos above, then send.
        </p>
        <div style={{ fontSize: 13, color: "#334155", display: "grid", gap: 2 }}>
          {form.invoiceNumber.trim() ? <div><strong>Invoice #</strong> {form.invoiceNumber.trim()}</div> : null}
          {form.customerName.trim() ? <div><strong>Customer</strong> {form.customerName.trim()}</div> : null}
          {form.jobTitle.trim() ? <div><strong>Job</strong> {form.jobTitle.trim()}</div> : null}
          {form.invoiceDate.trim() ? <div><strong>Date</strong> {form.invoiceDate.trim()}</div> : null}
          {form.dueDate.trim() ? <div><strong>Due</strong> {form.dueDate.trim()}</div> : null}
        </div>
        {form.notes.trim() ? (
          <p style={{ margin: 0, fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>
            <strong>Notes</strong>
            {"\n"}
            {form.notes.trim()}
          </p>
        ) : null}
        {form.lineItems.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No line items on the file yet.</p>
        ) : (
          <div style={{ width: "100%", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid #e2e8f0" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 6px" }}>#</th>
                  <th style={{ padding: "8px 6px" }}>Description</th>
                  <th style={{ padding: "8px 6px" }}>Type</th>
                  <th style={{ padding: "8px 6px" }}>Qty</th>
                  <th style={{ padding: "8px 6px" }}>Unit $</th>
                  <th style={{ padding: "8px 6px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {form.lineItems.map((li, idx) => (
                  <tr key={li.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 6px" }}>{idx + 1}</td>
                    <td style={{ padding: "8px 6px" }}>{li.description || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{INVOICE_LINE_KIND_LABEL[normalizeInvoiceLineKind(li.line_kind)]}</td>
                    <td style={{ padding: "8px 6px" }}>{li.quantity}</td>
                    <td style={{ padding: "8px 6px" }}>${Number(li.unit_price || 0).toFixed(2)}</td>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>${invoiceSubtotal([li]).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontWeight: 800, fontSize: 15 }}>Subtotal: ${subtotal.toFixed(2)}</div>
        {form.attachments.filter((a) => a.attach_to_customer_copy).length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No photos marked for the customer copy yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              Photos on the file ({form.attachments.filter((a) => a.attach_to_customer_copy).length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {form.attachments
                .filter((a) => a.attach_to_customer_copy)
                .map((att) => (
                  <div key={att.id} style={{ width: 88, display: "grid", gap: 4 }}>
                    {isProbablyImageAttachment(att.content_type, att.public_url, att.file_name) ? (
                      <img
                        src={att.public_url}
                        alt={att.file_name || "Photo"}
                        style={{ width: 88, height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${theme.border}` }}
                      />
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          width: 88,
                          height: 72,
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f1f5f9",
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "0 6px",
                          textAlign: "center",
                        }}
                      >
                        {entityAttachmentDisplayLabel(att.content_type, att.file_name)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#334155", wordBreak: "break-word", lineHeight: 1.3 }}>
                      {att.file_name || "File"}
                      {att.note?.trim() ? ` — ${att.note.trim()}` : ""}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={includePaymentLink} onChange={(e) => setIncludePaymentLink(e.target.checked)} />
        Include payment link when sending (Helcim / Clover / Stripe / configured provider)
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" disabled={busy} onClick={() => void handleSave()} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Working…" : "Save invoice"}
        </button>
        <button type="button" disabled={busy} onClick={() => void handleDownloadPdf()} style={{ ...secondaryBtn, padding: "10px 16px", borderRadius: 8, fontWeight: 700 }}>
          Preview / Download PDF
        </button>
        <div ref={sendMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            disabled={sending}
            onClick={() => setSendMenuOpen((o) => !o)}
            style={{ padding: "10px 16px", borderRadius: 8, border: `2px solid ${theme.primary}`, background: "#fff", color: theme.primary, fontWeight: 700, cursor: "pointer" }}
          >
            {sending ? "Sending…" : "Send to customer ▾"}
          </button>
          {sendMenuOpen ? (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 6,
                minWidth: 260,
                background: "#fff",
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                zIndex: 30,
                padding: 4,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {(
                [
                  ["email", "Send to Customer Email"],
                  ["sms", "Send to Customer SMS"],
                  ["both", "Send to both"],
                  ["separate_email", "Send to Separate Email"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSendMenuOpen(false)
                    if (key === "separate_email") setInvoiceEmailSeparateTo("")
                    setDeliveryPanel(key)
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: 13,
                    color: theme.text,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {deliveryPanel && notice ? (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: /failed|HTTP|error|not sent/i.test(notice) ? "#9a3412" : "#047857" }}>
          {formatDisplayText(notice, "Something went wrong.")}
        </p>
      ) : null}

      {deliveryPanel === "email" || deliveryPanel === "separate_email" || deliveryPanel === "both" ? (
        <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", display: "grid", gap: 10 }}>
          {deliveryPanel === "separate_email" ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>To</label>
              <input value={invoiceEmailSeparateTo} onChange={(e) => setInvoiceEmailSeparateTo(e.target.value)} placeholder="Enter recipient email address" style={theme.formInput} />
            </>
          ) : (
            <>
              {form.customerEmail.trim() ? (
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: theme.text }}>To:</strong> {form.customerEmail.trim()}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "#b45309", fontWeight: 600 }}>
                  No email on file. Add one on the customer, or use Send to Separate Email.
                </p>
              )}
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Additional recipients (To)</label>
              <input value={invoiceEmailAdditionalTo} onChange={(e) => setInvoiceEmailAdditionalTo(e.target.value)} placeholder="Comma-separated extra To addresses" style={theme.formInput} />
            </>
          )}
          <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>CC</label>
          <input value={invoiceEmailCc} onChange={(e) => setInvoiceEmailCc(e.target.value)} placeholder="Optional, comma-separated" style={theme.formInput} />
          <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>BCC</label>
          <input value={invoiceEmailBcc} onChange={(e) => setInvoiceEmailBcc(e.target.value)} placeholder="Optional, comma-separated" style={theme.formInput} />
          {session?.user?.email ? (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#0f172a" }}>
              <input type="checkbox" style={{ marginTop: 3 }} checked={invoiceEmailCopySelf} onChange={(e) => setInvoiceEmailCopySelf(e.target.checked)} />
              <span>
                Copy me on this email <span style={{ color: "#64748b" }}>({session.user.email})</span>
              </span>
            </label>
          ) : null}
          <input value={invoiceEmailSubject} onChange={(e) => setInvoiceEmailSubject(e.target.value)} placeholder="Subject" style={theme.formInput} />
          <textarea value={invoiceEmailBody} onChange={(e) => setInvoiceEmailBody(e.target.value)} rows={4} placeholder="Message" style={{ ...theme.formInput, resize: "vertical", color: "#111827" }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Email signature (appended automatically with --)</label>
          <textarea
            value={invoiceEmailSignature}
            onChange={(e) => setInvoiceEmailSignature(e.target.value)}
            onBlur={() => saveStoredEmailSignature(invoiceEmailSignature)}
            rows={3}
            placeholder="Your name, business, phone…"
            style={{ ...theme.formInput, resize: "vertical", color: "#111827" }}
          />
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            The invoice PDF (same as Preview / Download) is always attached. Photos marked for customer copy are included
            in that PDF.
          </p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#0f172a" }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={invoiceEmailAttachEntity} onChange={(e) => setInvoiceEmailAttachEntity(e.target.checked)} />
            <span>
              Also attach files flagged for <strong>customer copy</strong> (
              {form.attachments.filter((a) => a.attach_to_customer_copy).length} on this invoice)
            </span>
          </label>
          <button
            type="button"
            onClick={() => void handleSend("email", { separateToOnly: deliveryPanel === "separate_email" })}
            disabled={sending}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 600,
              cursor: sending ? "not-allowed" : "pointer",
              justifySelf: "start",
              display: deliveryPanel === "both" ? "none" : undefined,
            }}
          >
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      ) : null}

      {deliveryPanel === "sms" || deliveryPanel === "both" ? (
        <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", display: "grid", gap: 10 }}>
          {form.customerPhone.trim() ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              <strong style={{ color: theme.text }}>To:</strong> {form.customerPhone.trim()}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "#b45309", fontWeight: 600 }}>No phone on file. Add it on the customer, or send email instead.</p>
          )}
          <textarea value={invoiceSmsBody} onChange={(e) => setInvoiceSmsBody(e.target.value)} rows={4} placeholder="Message" style={{ ...theme.formInput, resize: "vertical", color: "#111827" }} />
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>The invoice PDF is included as a download link.</p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#0f172a" }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={invoiceSmsAttachEntity} onChange={(e) => setInvoiceSmsAttachEntity(e.target.checked)} />
            <span>
              Also attach photos flagged for <strong>customer copy</strong> (
              {form.attachments.filter((a) => a.attach_to_customer_copy).length} on this invoice)
            </span>
          </label>
          <button
            type="button"
            onClick={() => void handleSend("sms")}
            disabled={sending}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 600,
              cursor: sending ? "not-allowed" : "pointer",
              justifySelf: "start",
              display: deliveryPanel === "both" ? "none" : undefined,
            }}
          >
            {sending ? "Sending…" : "Send text"}
          </button>
        </div>
      ) : null}

      {deliveryPanel === "both" ? (
        <button
          type="button"
          onClick={() => void handleSend("both")}
          disabled={sending}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            cursor: sending ? "not-allowed" : "pointer",
            justifySelf: "start",
          }}
        >
          {sending ? "Sending…" : "Send email & text"}
        </button>
      ) : null}

      {deliveryPanel ? (
        <button type="button" onClick={() => setDeliveryPanel(null)} style={{ border: "none", background: "transparent", color: "#64748b", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>
          Close
        </button>
      ) : null}

      {showInvoiceSettings ? (
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setShowInvoiceSettings(false)}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              padding: 16,
              display: "grid",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Invoice settings</h3>
              <button type="button" onClick={() => setShowInvoiceSettings(false)} style={{ ...secondaryBtn, padding: "4px 10px" }}>
                ×
              </button>
            </div>

            <details style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#f8fafc", padding: "10px 12px" }}>
              <summary style={{ ...summaryStyle, fontSize: 13 }}>Invoice numbering</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={invoiceNumberEnabled}
                    onChange={(e) => setInvoiceNumberEnabled(e.target.checked)}
                  />
                  Apply custom numbering on invoices
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Prefix
                    <input value={invoiceNumberPrefix} onChange={(e) => setInvoiceNumberPrefix(e.target.value.slice(0, 24))} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Digits
                    <select value={invoiceNumberDigits} onChange={(e) => setInvoiceNumberDigits(e.target.value)} style={inputStyle}>
                      {DOCUMENT_NUMBER_DIGIT_OPTIONS.map((d) => (
                        <option key={d} value={String(d)}>
                          {d} digits
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                  Preview:{" "}
                  <strong>
                    {formatDocumentNumber({
                      format: buildDocumentNumberFormat(invoiceNumberPrefix.trim() || "INV", clampDocumentNumberDigits(invoiceNumberDigits, 4)),
                      prefix: invoiceNumberPrefix.trim() || "INV",
                      sequenceDigits: clampDocumentNumberDigits(invoiceNumberDigits, 4),
                      nextSequence: 1,
                    })}
                  </strong>
                </p>
              </div>
            </details>

            <details style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <summary style={{ ...summaryStyle, fontSize: 13 }}>Fields on invoices</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={invoiceTplIncludePreparedDate} onChange={(e) => setInvoiceTplIncludePreparedDate(e.target.checked)} />
                  Date prepared
                </label>
                <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={invoiceTplIncludeDueDate} onChange={(e) => setInvoiceTplIncludeDueDate(e.target.checked)} />
                  Due date
                </label>
                {invoiceTplIncludeDueDate ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginLeft: 24 }}>
                    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                      Standard interval
                      <select
                        value={invoiceDueIntervalUnit}
                        onChange={(e) => setInvoiceDueIntervalUnit(e.target.value as "days" | "weeks" | "months")}
                        style={inputStyle}
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                      Value
                      <input
                        value={invoiceDueIntervalValue}
                        onChange={(e) => setInvoiceDueIntervalValue(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                        style={inputStyle}
                      />
                    </label>
                  </div>
                ) : null}
                <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={invoiceTplIncludeJobDetails} onChange={(e) => setInvoiceTplIncludeJobDetails(e.target.checked)} />
                  Job details
                </label>
                <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={invoiceTplIncludeDescription} onChange={(e) => setInvoiceTplIncludeDescription(e.target.checked)} />
                  Description
                </label>
                <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={invoiceTplIncludeCustomFields} onChange={(e) => setInvoiceTplIncludeCustomFields(e.target.checked)} />
                  Custom fields
                </label>
                <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={invoiceTplIncludePhotos} onChange={(e) => setInvoiceTplIncludePhotos(e.target.checked)} />
                  Photos
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={invoiceTplIncludePurchaseOrders}
                      onChange={(e) => setInvoiceTplIncludePurchaseOrders(e.target.checked)}
                    />
                    Add purchase orders as line items
                  </span>
                  <span style={{ marginLeft: 24, fontSize: 12, color: "#64748b" }}>
                    Off by default. When on, you can add a PO as a line. The PO number is part of the description.
                  </span>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Custom description template
                  <textarea
                    rows={3}
                    value={invoiceCustomDescriptionTemplate}
                    onChange={(e) => setInvoiceCustomDescriptionTemplate(e.target.value)}
                    placeholder="Optional default notes block for new invoices"
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>
              </div>
            </details>

            <details style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <summary style={{ ...summaryStyle, fontSize: 13 }}>Section order</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {invoiceSectionOrder
                  .filter(sectionEnabled)
                  .map((id, idx, arr) => (
                    <AdminSortableRow
                      key={id}
                      scope="invoice-section-order"
                      index={idx}
                      onReorder={(from, to) => {
                        const visible = arr
                        const nextVisible = reorderByIndex(visible, from, to)
                        const hidden = invoiceSectionOrder.filter((x) => !visible.includes(x))
                        setInvoiceSectionOrder(mergeInvoiceSectionOrder([...nextVisible, ...hidden]))
                      }}
                      rowStyle={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{sectionLabel(id)}</span>
                    </AdminSortableRow>
                  ))}
              </div>
            </details>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowInvoiceSettings(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...secondaryBtn, background: theme.primary, color: "#fff", borderColor: theme.primary }}
                onClick={() => {
                  void (async () => {
                    if (!supabase || !userId) return
                    const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
                    const prev =
                      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
                        ? { ...(data.metadata as Record<string, unknown>) }
                        : {}
                    const next = applyDocumentNumberSettingsToMeta(prev, "invoice", {
                      prefix: invoiceNumberPrefix,
                      sequenceDigits: clampDocumentNumberDigits(invoiceNumberDigits, 4),
                      enabled: invoiceNumberEnabled,
                    })
                    next.invoice_template_include_prepared_date = invoiceTplIncludePreparedDate
                    next.invoice_template_include_due_date = invoiceTplIncludeDueDate
                    next.invoice_template_include_photos = invoiceTplIncludePhotos
                    next.invoice_template_include_purchase_orders = invoiceTplIncludePurchaseOrders
                    next.invoice_template_include_job_details = invoiceTplIncludeJobDetails
                    next.invoice_template_include_custom_fields = invoiceTplIncludeCustomFields
                    next.invoice_template_include_description = invoiceTplIncludeDescription
                    next.invoice_template_due_interval_unit = invoiceDueIntervalUnit
                    next.invoice_template_due_interval_value = Math.max(1, parseInt(invoiceDueIntervalValue || "1", 10) || 1)
                    next.invoice_template_section_order = invoiceSectionOrder
                    next.invoice_template_description = invoiceCustomDescriptionTemplate.trim()
                    const { error } = await supabase.from("profiles").update({ metadata: next }).eq("id", userId)
                    if (error) {
                      setNotice(error.message)
                      return
                    }
                    setNotice("Invoice settings saved.")
                    setShowInvoiceSettings(false)
                  })()
                }}
              >
                Save settings
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
