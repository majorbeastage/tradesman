import { useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../styles/theme"
import {
  DOCUMENT_NUMBER_DIGIT_OPTIONS,
  applyDocumentNumberSettingsToMeta,
  buildDocumentNumberFormat,
  clampDocumentNumberDigits,
  formatDocumentNumber,
  parseDocumentNumberSettings,
} from "../lib/documentNumberFormat"
import {
  applyDocumentVisualTemplate,
  parseDocumentVisualTemplate,
  type DocumentVisualStyle,
} from "../lib/documentVisualTemplate"
import { CustomerAccountNumberFields, DocumentVisualTemplateFields } from "./DocumentTemplateSettingFields"

type Props = {
  open: boolean
  onClose: () => void
  supabase: SupabaseClient | null
  userId: string | null
  onSaved?: (message: string) => void
}

export default function ReceiptSettingsDialog({ open, onClose, supabase, userId, onSaved }: Props) {
  const [receiptNumberEnabled, setReceiptNumberEnabled] = useState(false)
  const [receiptNumberPrefix, setReceiptNumberPrefix] = useState("REC")
  const [receiptNumberDigits, setReceiptNumberDigits] = useState("4")
  const [accountEnabled, setAccountEnabled] = useState(false)
  const [accountPrefix, setAccountPrefix] = useState("ACCT")
  const [accountDigits, setAccountDigits] = useState("4")
  const [accountPreviewSeq, setAccountPreviewSeq] = useState(1)
  const [includeDate, setIncludeDate] = useState(true)
  const [includeJob, setIncludeJob] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includePaymentMethod, setIncludePaymentMethod] = useState(true)
  const [layout, setLayout] = useState<DocumentVisualStyle>("basic")
  const [primaryColor, setPrimaryColor] = useState("#1B4F72")
  const [secondaryColor, setSecondaryColor] = useState("#5DADE2")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const rec = parseDocumentNumberSettings(meta, "receipt")
      const acct = parseDocumentNumberSettings(meta, "account")
      const visual = parseDocumentVisualTemplate(meta, "receipt")
      setReceiptNumberEnabled(rec.enabled === true)
      setReceiptNumberPrefix(rec.prefix)
      setReceiptNumberDigits(String(rec.sequenceDigits))
      setAccountEnabled(acct.enabled === true)
      setAccountPrefix(acct.prefix)
      setAccountDigits(String(acct.sequenceDigits))
      setAccountPreviewSeq(acct.nextSequence)
      setIncludeDate(meta.receipt_template_include_date !== false)
      setIncludeJob(meta.receipt_template_include_job !== false)
      setIncludeNotes(meta.receipt_template_include_notes !== false)
      setIncludePaymentMethod(meta.receipt_template_include_payment_method !== false)
      setLayout(visual.style)
      setPrimaryColor(visual.primaryColor)
      setSecondaryColor(visual.secondaryColor)
      setError(null)
    })()
    return () => {
      cancelled = true
    }
  }, [open, supabase, userId])

  if (!open) return null

  const inputStyle = { ...theme.formInput, width: "100%", boxSizing: "border-box" as const }
  const accountPreview = formatDocumentNumber({
    format: buildDocumentNumberFormat(accountPrefix.trim() || "ACCT", clampDocumentNumberDigits(accountDigits, 4)),
    prefix: accountPrefix.trim() || "ACCT",
    sequenceDigits: clampDocumentNumberDigits(accountDigits, 4),
    nextSequence: accountPreviewSeq,
  })
  const receiptPreview = formatDocumentNumber({
    format: buildDocumentNumberFormat(receiptNumberPrefix.trim() || "REC", clampDocumentNumberDigits(receiptNumberDigits, 4)),
    prefix: receiptNumberPrefix.trim() || "REC",
    sequenceDigits: clampDocumentNumberDigits(receiptNumberDigits, 4),
    nextSequence: 1,
  })

  async function save() {
    if (!supabase || !userId) return
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      const prev =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      let next = applyDocumentNumberSettingsToMeta(prev, "receipt", {
        prefix: receiptNumberPrefix,
        sequenceDigits: clampDocumentNumberDigits(receiptNumberDigits, 4),
        enabled: receiptNumberEnabled,
      })
      next = applyDocumentNumberSettingsToMeta(next, "account", {
        prefix: accountPrefix,
        sequenceDigits: clampDocumentNumberDigits(accountDigits, 4),
        enabled: accountEnabled,
      })
      next = applyDocumentVisualTemplate(next, "receipt", { style: layout, primaryColor, secondaryColor })
      next.receipt_template_include_date = includeDate
      next.receipt_template_include_job = includeJob
      next.receipt_template_include_notes = includeNotes
      next.receipt_template_include_payment_method = includePaymentMethod
      const { error: upErr } = await supabase.from("profiles").update({ metadata: next }).eq("id", userId)
      if (upErr) throw upErr
      onSaved?.("Receipt settings saved.")
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13000,
        background: "rgba(15,23,42,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
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
          <h3 style={{ margin: 0, fontSize: 16 }}>Receipt settings</h3>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${theme.border}`, background: "#fff", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
            ×
          </button>
        </div>

        <details open style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#f8fafc", padding: "10px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Receipt numbering</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={receiptNumberEnabled} onChange={(e) => setReceiptNumberEnabled(e.target.checked)} />
              Apply custom numbering on receipts
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Prefix
                <input value={receiptNumberPrefix} onChange={(e) => setReceiptNumberPrefix(e.target.value.slice(0, 24))} style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Digits
                <select value={receiptNumberDigits} onChange={(e) => setReceiptNumberDigits(e.target.value)} style={inputStyle}>
                  {DOCUMENT_NUMBER_DIGIT_OPTIONS.map((d) => (
                    <option key={d} value={String(d)}>
                      {d} digits
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
              Preview: <strong>{receiptPreview}</strong>
            </p>
            <CustomerAccountNumberFields
              enabled={accountEnabled}
              prefix={accountPrefix}
              digits={accountDigits}
              preview={accountPreview}
              onEnabled={setAccountEnabled}
              onPrefix={setAccountPrefix}
              onDigits={setAccountDigits}
            />
          </div>
        </details>

        <details style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Fields on receipts</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={includeDate} onChange={(e) => setIncludeDate(e.target.checked)} />
              Date
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={includeJob} onChange={(e) => setIncludeJob(e.target.checked)} />
              Job details
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
              Description
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={includePaymentMethod} onChange={(e) => setIncludePaymentMethod(e.target.checked)} />
              Payment method
            </label>
          </div>
        </details>

        <details style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Template</summary>
          <div style={{ marginTop: 10 }}>
            <DocumentVisualTemplateFields
              name="receipt-template-style"
              style={layout}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              onStyle={setLayout}
              onPrimary={setPrimaryColor}
              onSecondary={setSecondaryColor}
            />
          </div>
        </details>

        {error ? <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  )
}
