import { useEffect, useMemo, useState, type CSSProperties } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../../styles/theme"
import { useAuth } from "../../contexts/AuthContext"
import { useSandboxTrainingMode } from "../../lib/sandboxTrainingUi"
import { outboundMessagesJsonBody } from "../../lib/platformToolsJsonBody"
import { downloadPdfBlob, uint8ArrayToBase64 } from "../../lib/documentPdf"
import { uploadBytesForOutbound, ENTITY_ATTACHMENT_ACCEPT, ENTITY_ATTACHMENT_MAX_BYTES, uploadInvoiceAttachmentFile } from "../../lib/uploadCommAttachment"
import { entityAttachmentDisplayLabel, isProbablyImageAttachment } from "../../lib/communicationAttachments"
import { createPaymentRequestLink, fetchPaymentProviderStatus, sendPaymentRequest, type PaymentProviderId } from "../../lib/paymentRequests"
import {
  buildInvoiceFormFromQuote,
  defaultInvoiceFormState,
  formStateToInvoiceRecord,
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

type Props = {
  supabase: SupabaseClient | null
  userId: string | null
  setPage?: (page: string) => void
}

function newInvoiceLine(): InvoiceLineItem {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, line_kind: "misc" }
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
  const { session } = useAuth()
  const [form, setForm] = useState<InvoiceFormState>(() => defaultInvoiceFormState())
  const [savedInvoices, setSavedInvoices] = useState<InvoiceRecord[]>([])
  const [customers, setCustomers] = useState<CustomerInvoicePickerRow[]>([])
  const [quotes, setQuotes] = useState<InvoiceQuotePick[]>([])
  const [busy, setBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [includePaymentLink, setIncludePaymentLink] = useState(true)
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderId>("helcim")
  const [newDesc, setNewDesc] = useState("")
  const [newQty, setNewQty] = useState("1")
  const [newUnit, setNewUnit] = useState("0")

  const subtotal = useMemo(() => invoiceSubtotal(form.lineItems), [form.lineItems])

  useEffect(() => {
    if (!supabase || !userId) return
    void (async () => {
      try {
        const [inv, cust, status] = await Promise.all([
          loadInvoicesFromProfile(supabase, userId),
          loadCustomersForInvoices(supabase, userId),
          fetchPaymentProviderStatus(userId, session?.access_token ?? null).catch(() => null),
        ])
        setSavedInvoices(inv)
        setCustomers(cust)
        if (status?.defaultProvider) setPaymentProvider(status.defaultProvider)
        const prefill = consumeInvoicesPrefill()
        if (prefill?.quoteId) {
          const next = await buildInvoiceFormFromQuote(supabase, userId, prefill.quoteId, defaultInvoiceFormState())
          if (prefill.customerId) next.customerId = prefill.customerId
          setForm(next)
          setNotice("Loaded line items from estimate.")
        } else if (prefill?.customerId) {
          const row = cust.find((c) => c.id === prefill.customerId)
          if (row) applyCustomer(row)
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [supabase, userId, session?.access_token])

  useEffect(() => {
    if (!supabase || !userId) return
    void loadQuotesForInvoices(supabase, userId, form.customerId.trim() || null)
      .then(setQuotes)
      .catch(() => setQuotes([]))
  }, [supabase, userId, form.customerId])

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
      const next = await buildInvoiceFormFromQuote(supabase, userId, quoteId, form)
      setForm(next)
      setNotice("Estimate loaded into invoice.")
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
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
      setNotice(e instanceof Error ? e.message : String(e))
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
      setNotice(e instanceof Error ? e.message : String(e))
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
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadBusy(false)
    }
  }

  async function handleSend(channel: "email" | "sms" | "both") {
    setSendMenuOpen(false)
    if (!supabase || !userId) return
    const cid = form.customerId.trim()
    if (!cid) {
      setNotice("Link a customer before sending.")
      return
    }
    const token = session?.access_token?.trim()
    if (!token) {
      setNotice("Sign in again to send.")
      return
    }
    const wantEmail = channel === "email" || channel === "both"
    const wantSms = channel === "sms" || channel === "both"
    const email = form.customerEmail.trim()
    const phone = form.customerPhone.trim()
    if (wantEmail && !email) {
      setNotice("No email on file — add one or choose Text.")
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
    setSending(true)
    setNotice(null)
    try {
      let paymentUrl: string | null = null
      let paymentRequestId = form.paymentRequestId.trim()
      if (includePaymentLink && subtotal > 0) {
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
      }

      const template = await loadInvoiceTemplateSettings(supabase, userId)
      const bytes = await buildInvoicePdfBytes(form, template, {
        sandboxWatermark: sandboxTraining,
        paymentUrl,
      })
      const filename = `${form.invoiceNumber.trim() || "invoice"}.pdf`
      const attachUrls = form.attachments.filter((a) => a.attach_to_customer_copy).map((a) => a.public_url)

      if (wantEmail) {
        const payLine = paymentUrl ? `\n\nPay online: ${paymentUrl}` : ""
        const res = await fetch("/api/outbound-messages?__channel=email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: outboundMessagesJsonBody({
            to: email,
            subject: `Invoice ${form.invoiceNumber.trim()} from ${template.businessLabel}`,
            body: `Hi ${form.customerName.trim()},\n\nPlease find your invoice attached.${payLine}\n\nThank you.`,
            userId,
            customerId: cid,
            requireAttachments: true,
            attachments: [{ filename, content: uint8ArrayToBase64(bytes) }],
            ...(attachUrls.length ? { attachmentPublicUrls: attachUrls } : {}),
          }),
        })
        const raw = await res.text()
        if (!res.ok) throw new Error(raw.slice(0, 300))
      }

      if (wantSms) {
        const url = await uploadBytesForOutbound(userId, bytes, filename, "invoice-sms", "application/pdf")
        if (!url) throw new Error("Could not upload invoice PDF for text.")
        const media = [url, ...attachUrls].slice(0, 5)
        const payLine = paymentUrl ? ` Pay: ${paymentUrl}` : ""
        const res = await fetch("/api/outbound-messages?__channel=sms", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: outboundMessagesJsonBody({
            to: phone,
            body: `Hi ${form.customerName.trim()}, your invoice is attached.${payLine}`,
            userId,
            customerId: cid,
            mediaPublicUrls: media,
          }),
        })
        const raw = await res.text()
        if (!res.ok) throw new Error(raw.slice(0, 300))
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
      setNotice(channel === "both" ? "Invoice sent by email and text." : channel === "email" ? "Invoice emailed." : "Invoice texted.")
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
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
    setForm(defaultInvoiceFormState())
    setNotice(null)
  }

  const inputStyle = { ...theme.formInput, width: "100%", boxSizing: "border-box" as const }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 960 }}>
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, color: theme.text }}>Custom invoices</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Build itemized invoices from estimates, attach photos and files, and send by email or text. Payment links can be included automatically.
        </p>
      </div>

      {notice ? (
        <p style={{ margin: 0, fontSize: 13, color: notice.includes("sent") || notice.includes("saved") || notice.includes("Loaded") ? "#047857" : "#b45309" }}>
          {notice}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Customer</span>
            <select
              value={form.customerId}
              onChange={(e) => {
                const row = customers.find((c) => c.id === e.target.value)
                if (row) applyCustomer(row)
              }}
              style={inputStyle}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>From estimate</span>
            <select
              value={form.quoteId}
              onChange={(e) => void handleQuotePick(e.target.value)}
              disabled={busy}
              style={inputStyle}
            >
              <option value="">Choose estimate to load…</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} — ${q.total.toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Invoice #</span>
            <input value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} style={inputStyle} />
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Due date</span>
            <input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} style={inputStyle} />
          </label>
        </div>
        <label style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Job title</span>
          <input value={form.jobTitle} onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))} style={inputStyle} />
        </label>
        <label style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Notes / job description</span>
          <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
        </label>
      </div>

      <div style={{ padding: 14, border: `1px solid ${theme.border}`, borderRadius: 10, background: "#fff" }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Line items</div>
        {form.lineItems.length === 0 ? (
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>No lines yet — add below or load from an estimate.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "6px 4px" }}>Description</th>
                <th style={{ padding: "6px 4px", width: 72 }}>Qty</th>
                <th style={{ padding: "6px 4px", width: 96 }}>Unit $</th>
                <th style={{ padding: "6px 4px", width: 88 }}>Total</th>
                <th style={{ padding: "6px 4px", width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {form.lineItems.map((li) => (
                <tr key={li.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px" }}>
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
                  <td style={{ padding: "4px" }}>
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
                  <td style={{ padding: "4px" }}>
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
                  <td style={{ padding: "4px", fontWeight: 700 }}>${invoiceSubtotal([li]).toFixed(2)}</td>
                  <td style={{ padding: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, lineItems: p.lineItems.filter((x) => x.id !== li.id) }))}
                      style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <input placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }} />
          <input placeholder="Qty" value={newQty} onChange={(e) => setNewQty(e.target.value)} style={{ ...inputStyle, width: 72 }} />
          <input placeholder="Unit $" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} style={{ ...inputStyle, width: 96 }} />
          <button
            type="button"
            onClick={() => {
              const qty = Number.parseFloat(newQty) || 1
              const unit = Number.parseFloat(newUnit) || 0
              if (!newDesc.trim()) return
              setForm((p) => ({
                ...p,
                lineItems: [...p.lineItems, { ...newInvoiceLine(), description: newDesc.trim(), quantity: qty, unit_price: unit }],
              }))
              setNewDesc("")
              setNewQty("1")
              setNewUnit("0")
            }}
            style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            Add line
          </button>
        </div>
        <div style={{ marginTop: 12, fontWeight: 800, fontSize: 15 }}>Subtotal: ${subtotal.toFixed(2)}</div>
      </div>

      <div style={{ padding: 14, border: `1px solid ${theme.border}`, borderRadius: 10, background: "#fff" }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Photos & files</div>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>Photos, PDFs, and Word docs up to 50 MB. Included on send when &ldquo;customer copy&rdquo; is checked.</p>
        <input type="file" multiple accept={ENTITY_ATTACHMENT_ACCEPT} disabled={uploadBusy} onChange={(e) => void handleFileUpload(e.target.files)} style={{ fontSize: 13 }} />
        {form.attachments.length > 0 ? (
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
            {form.attachments.map((att) => (
              <li key={att.id} style={{ marginBottom: 8, padding: 8, border: `1px solid ${theme.border}`, borderRadius: 8, display: "flex", gap: 10, alignItems: "center" }}>
                {isProbablyImageAttachment(att.content_type, att.public_url, att.file_name) ? (
                  <img src={att.public_url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                ) : (
                  <span style={{ display: "inline-flex", width: 48, height: 48, alignItems: "center", justifyContent: "center", background: "#f1f5f9", borderRadius: 6, fontWeight: 800, fontSize: 10 }}>
                    {entityAttachmentDisplayLabel(att.content_type, att.file_name)}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={att.public_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: 13, color: theme.primary }}>
                    {att.file_name || "File"}
                  </a>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={att.attach_to_customer_copy}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          attachments: p.attachments.map((a) => (a.id === att.id ? { ...a, attach_to_customer_copy: e.target.checked } : a)),
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
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={includePaymentLink} onChange={(e) => setIncludePaymentLink(e.target.checked)} />
        Include payment link when sending (Helcim / configured provider)
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" disabled={busy} onClick={() => void handleSave()} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Working…" : "Save invoice"}
        </button>
        <button type="button" disabled={busy} onClick={() => void handleDownloadPdf()} style={{ ...secondaryBtn, padding: "10px 16px", borderRadius: 8, fontWeight: 700 }}>
          Download PDF
        </button>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            disabled={sending}
            onClick={() => setSendMenuOpen((o) => !o)}
            style={{ padding: "10px 16px", borderRadius: 8, border: `2px solid ${theme.primary}`, background: "#fff", color: theme.primary, fontWeight: 700, cursor: "pointer" }}
          >
            {sending ? "Sending…" : "Send to customer ▾"}
          </button>
          {sendMenuOpen ? (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 5, minWidth: 160 }}>
              {(["email", "sms", "both"] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => void handleSend(ch)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "#fff", color: theme.text, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  {ch === "both" ? "Email + Text" : ch === "email" ? "Email" : "Text"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
