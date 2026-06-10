import { useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../styles/theme"
import {
  buildCustomReceiptPdfBytes,
  customReceiptDraftToFormState,
  defaultCustomReceiptFormState,
  formStateToCustomReceiptDraft,
  loadCustomReceiptsForCustomer,
  loadCustomersForCustomReceipt,
  loadReceiptTemplateSettings,
  newCustomReceiptLine,
  saveCustomReceiptToCustomerProfile,
  type CustomReceiptDraft,
  type CustomReceiptFormState,
  type CustomerReceiptPickerRow,
} from "../lib/customReceipt"
import { downloadPdfBlob } from "../lib/documentPdf"

export type CustomReceiptModalProps = {
  open: boolean
  onClose: () => void
  supabase: SupabaseClient | null
  userId: string | null
  initialCustomerId?: string | null
}

const LINE_KINDS = ["labor", "material", "misc", "fee", "other"] as const

export default function CustomReceiptModal({
  open,
  onClose,
  supabase,
  userId,
  initialCustomerId,
}: CustomReceiptModalProps) {
  const [form, setForm] = useState<CustomReceiptFormState>(() => defaultCustomReceiptFormState())
  const [customers, setCustomers] = useState<CustomerReceiptPickerRow[]>([])
  const [savedReceipts, setSavedReceipts] = useState<CustomReceiptDraft[]>([])
  const [loadedDraftId, setLoadedDraftId] = useState<string>("")
  const [newDesc, setNewDesc] = useState("")
  const [newQty, setNewQty] = useState("1")
  const [newUnit, setNewUnit] = useState("0")
  const [newKind, setNewKind] = useState<string>("misc")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNotice(null)
    setLoadedDraftId("")
    const base = defaultCustomReceiptFormState()
    if (initialCustomerId?.trim()) base.customerId = initialCustomerId.trim()
    setForm(base)
    setNewDesc("")
    setNewQty("1")
    setNewUnit("0")
    setNewKind("misc")
    if (!supabase || !userId) return
    void (async () => {
      try {
        const rows = await loadCustomersForCustomReceipt(supabase, userId)
        setCustomers(rows)
        if (initialCustomerId?.trim()) {
          const match = rows.find((c) => c.id === initialCustomerId.trim())
          if (match) applyCustomerRow(match)
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [open, supabase, userId, initialCustomerId])

  function applyCustomerRow(row: CustomerReceiptPickerRow) {
    setForm((prev) => ({
      ...prev,
      customerId: row.id,
      customerName: row.display_name,
      customerPhone: row.phone,
      customerEmail: row.email,
      customerAddress: row.service_address,
    }))
    setLoadedDraftId("")
    if (!supabase) return
    void loadCustomReceiptsForCustomer(supabase, row.id)
      .then(setSavedReceipts)
      .catch(() => setSavedReceipts([]))
  }

  const subtotal = useMemo(() => {
    let sum = 0
    for (const li of form.lineItems) {
      sum += (Number.isFinite(li.quantity) ? li.quantity : 0) * (Number.isFinite(li.unit_price) ? li.unit_price : 0)
    }
    return sum
  }, [form.lineItems])

  if (!open) return null

  async function handleDownload() {
    if (!supabase || !userId) return
    if (!form.customerName.trim()) {
      setNotice("Enter a customer name.")
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const template = await loadReceiptTemplateSettings(supabase, userId)
      const bytes = await buildCustomReceiptPdfBytes(form, template)
      const slug = form.customerName.trim().replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 24) || "receipt"
      downloadPdfBlob(bytes, `receipt-${slug}.pdf`)
      setNotice("PDF downloaded.")
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveToCustomer() {
    if (!supabase || !userId) return
    const cid = form.customerId.trim()
    if (!cid) {
      setNotice("Link a customer from the dropdown to save this receipt on their profile.")
      return
    }
    if (!form.customerName.trim()) {
      setNotice("Enter a customer name.")
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const { data } = await supabase.from("customers").select("metadata").eq("id", cid).maybeSingle()
      const existing = savedReceipts.find((r) => r.id === loadedDraftId) ?? null
      const draft = formStateToCustomReceiptDraft(form, existing)
      const next = await saveCustomReceiptToCustomerProfile(supabase, userId, cid, draft, data?.metadata)
      setSavedReceipts(next)
      setLoadedDraftId(draft.id)
      setNotice("Saved to customer profile.")
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function loadSavedReceipt(id: string) {
    const draft = savedReceipts.find((r) => r.id === id)
    if (!draft) return
    setForm(customReceiptDraftToFormState(draft))
    setLoadedDraftId(draft.id)
    setNotice("Loaded saved receipt.")
  }

  function addLineItem() {
    const qty = Number.parseFloat(newQty)
    const unit = Number.parseFloat(newUnit)
    if (!newDesc.trim()) {
      setNotice("Enter a line description.")
      return
    }
    setForm((prev) => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        newCustomReceiptLine({
          description: newDesc.trim(),
          quantity: Number.isFinite(qty) ? qty : 1,
          unit_price: Number.isFinite(unit) ? unit : 0,
          line_kind: newKind,
        }),
      ],
    }))
    setNewDesc("")
    setNewQty("1")
    setNewUnit("0")
    setNotice(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-receipt-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          padding: "20px 22px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h2 id="custom-receipt-title" style={{ margin: 0, fontSize: 20, color: theme.text }}>
              Custom Receipt
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
              Standalone receipt using your Receipt template settings. Link a customer to save on their profile, or enter details manually.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "#64748b", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Link customer (optional)
            <select
              value={form.customerId}
              onChange={(e) => {
                const id = e.target.value
                if (!id) {
                  setForm((prev) => ({ ...prev, customerId: "" }))
                  setSavedReceipts([])
                  setLoadedDraftId("")
                  return
                }
                const row = customers.find((c) => c.id === id)
                if (row) applyCustomerRow(row)
              }}
              style={{ ...theme.formInput, fontSize: 14 }}
            >
              <option value="">— Manual entry —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>

          {savedReceipts.length > 0 ? (
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Load saved receipt from profile
              <select
                value={loadedDraftId}
                onChange={(e) => {
                  const id = e.target.value
                  if (!id) return
                  loadSavedReceipt(id)
                }}
                style={{ ...theme.formInput, fontSize: 14 }}
              >
                <option value="">— Select —</option>
                {savedReceipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.receipt_date} · {r.job_title || r.customer_name} ·{" "}
                    {r.manual_amount != null ? `$${r.manual_amount.toFixed(2)}` : `${r.line_items.length} line(s)`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Customer name
              <input
                value={form.customerName}
                onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                style={{ ...theme.formInput, fontSize: 14 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Receipt date
              <input
                type="date"
                value={form.receiptDate}
                onChange={(e) => setForm((p) => ({ ...p, receiptDate: e.target.value }))}
                style={{ ...theme.formInput, fontSize: 14 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Phone
              <input
                value={form.customerPhone}
                onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))}
                style={{ ...theme.formInput, fontSize: 14 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Email
              <input
                type="email"
                value={form.customerEmail}
                onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))}
                style={{ ...theme.formInput, fontSize: 14 }}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
            Service address (optional)
            <input
              value={form.customerAddress}
              onChange={(e) => setForm((p) => ({ ...p, customerAddress: e.target.value }))}
              style={{ ...theme.formInput, fontSize: 14 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
            Description / job title
            <input
              value={form.jobTitle}
              onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
              placeholder="e.g. Service call, repair, materials"
              style={{ ...theme.formInput, fontSize: 14 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
            Notes (optional — appears on receipt)
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              style={{ ...theme.formInput, resize: "vertical", fontSize: 14 }}
            />
          </label>

          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, background: "#fafafa" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Line items</p>
            {form.lineItems.length === 0 ? (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>No lines yet — add below or set a manual total.</p>
            ) : (
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                {form.lineItems.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gap: 6,
                      paddingBottom: 8,
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <input
                      value={row.description}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          lineItems: p.lineItems.map((li) => (li.id === row.id ? { ...li, description: e.target.value } : li)),
                        }))
                      }
                      style={{ ...theme.formInput, fontSize: 13 }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <select
                        value={row.line_kind ?? "misc"}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            lineItems: p.lineItems.map((li) => (li.id === row.id ? { ...li, line_kind: e.target.value } : li)),
                          }))
                        }
                        style={{ ...theme.formInput, fontSize: 13, width: 110 }}
                      >
                        {LINE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={String(row.quantity)}
                        onChange={(e) => {
                          const n = Number.parseFloat(e.target.value)
                          setForm((p) => ({
                            ...p,
                            lineItems: p.lineItems.map((li) =>
                              li.id === row.id ? { ...li, quantity: Number.isFinite(n) ? n : 0 } : li,
                            ),
                          }))
                        }}
                        style={{ ...theme.formInput, width: 72, fontSize: 13 }}
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        step="any"
                        value={String(row.unit_price)}
                        onChange={(e) => {
                          const n = Number.parseFloat(e.target.value)
                          setForm((p) => ({
                            ...p,
                            lineItems: p.lineItems.map((li) =>
                              li.id === row.id ? { ...li, unit_price: Number.isFinite(n) ? n : 0 } : li,
                            ),
                          }))
                        }}
                        style={{ ...theme.formInput, width: 88, fontSize: 13 }}
                        placeholder="Unit $"
                      />
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, lineItems: p.lineItems.filter((li) => li.id !== row.id) }))}
                        style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="New line description"
                style={{ ...theme.formInput, fontSize: 13 }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <select value={newKind} onChange={(e) => setNewKind(e.target.value)} style={{ ...theme.formInput, fontSize: 13, width: 110 }}>
                  {LINE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input value={newQty} onChange={(e) => setNewQty(e.target.value)} type="number" step="any" placeholder="Qty" style={{ ...theme.formInput, width: 72, fontSize: 13 }} />
                <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} type="number" step="any" placeholder="Unit $" style={{ ...theme.formInput, width: 88, fontSize: 13 }} />
                <button
                  type="button"
                  onClick={addLineItem}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  Add line
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={form.useManualAmount}
                onChange={(e) => setForm((p) => ({ ...p, useManualAmount: e.target.checked }))}
              />
              Manual total override
            </label>
            {form.useManualAmount ? (
              <input
                value={form.manualAmount}
                onChange={(e) => setForm((p) => ({ ...p, manualAmount: e.target.value }))}
                placeholder="Total amount"
                style={{ ...theme.formInput, width: 140, fontSize: 14 }}
              />
            ) : (
              <span style={{ fontSize: 13, color: "#64748b" }}>
                Line items subtotal: <strong>${subtotal.toFixed(2)}</strong>
              </span>
            )}
          </div>

          {notice ? (
            <p style={{ margin: 0, fontSize: 13, color: notice.toLowerCase().includes("saved") || notice.includes("downloaded") ? "#15803d" : "#b45309" }}>
              {notice}
            </p>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDownload()}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "Working…" : "Download PDF"}
            </button>
            <button
              type="button"
              disabled={busy || !form.customerId.trim()}
              onClick={() => void handleSaveToCustomer()}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: form.customerId.trim() ? "#fff" : "#f1f5f9",
                color: theme.text,
                fontWeight: 600,
                cursor: busy || !form.customerId.trim() ? "not-allowed" : "pointer",
              }}
            >
              Save to customer profile
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
