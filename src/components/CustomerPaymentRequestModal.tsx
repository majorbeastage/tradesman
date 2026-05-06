import { useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../styles/theme"
import type { CustomerPaymentProfileMetadata } from "../lib/customerPaymentMetadata"
import { loadCustomerPaymentPreflight } from "../lib/customerPaymentPreflight"
import { copyCustomerPaymentShareAndLog } from "../lib/customerPaymentsWorkflow"

export type CustomerPaymentRequestModalProps = {
  open: boolean
  onClose: () => void
  supabase: SupabaseClient | null
  userId: string | null
  customerId: string | null | undefined
  customerName: string | null | undefined
  profile: CustomerPaymentProfileMetadata
  estimateLabel: string | null
  amountLabel: string | null
  quoteId?: string | null
  calendarEventId?: string | null
}

export default function CustomerPaymentRequestModal({
  open,
  onClose,
  supabase,
  userId,
  customerId,
  customerName,
  profile,
  estimateLabel,
  amountLabel,
  quoteId,
  calendarEventId,
}: CustomerPaymentRequestModalProps) {
  const [includeBarcode, setIncludeBarcode] = useState(false)
  const [preflightBusy, setPreflightBusy] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [acknowledgeRisk, setAcknowledgeRisk] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setIncludeBarcode(false)
    setAcknowledgeRisk(false)
    setNotice(null)
    if (!supabase || !userId || !customerId) {
      setShowReminder(false)
      return
    }
    setPreflightBusy(true)
    void (async () => {
      const p = await loadCustomerPaymentPreflight(supabase, userId, customerId)
      setShowReminder(p.showEstimateOrSchedulingReminder)
      setPreflightBusy(false)
    })()
  }, [open, supabase, userId, customerId])

  const payReady = Boolean(profile.customer_pay_link_url?.trim() || profile.customer_pay_barcode_url?.trim())
  const barcodeAvailable = Boolean(profile.customer_pay_barcode_url?.trim())
  const canCopy =
    payReady &&
    Boolean(customerId) &&
    (!showReminder || acknowledgeRisk) &&
    !preflightBusy &&
    !copyBusy

  async function handleCopy() {
    if (!userId || !customerId || !canCopy) return
    setCopyBusy(true)
    setNotice(null)
    try {
      const res = await copyCustomerPaymentShareAndLog({
        supabase,
        userId,
        customerId,
        quoteId: quoteId ?? null,
        calendarEventId: calendarEventId ?? null,
        profile,
        customerName: customerName ?? null,
        estimateLabel,
        amountLabel,
        includeBarcodeInMessage: includeBarcode,
      })
      if (!res.ok) {
        setNotice(res.error ?? "Could not copy.")
        return
      }
      setNotice("Copied to clipboard. Paste into text or email to your customer.")
    } finally {
      setCopyBusy(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10060 }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="customer-pay-modal-title"
        style={{
          position: "fixed",
          zIndex: 10061,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(440px, calc(100vw - 28px))",
          maxHeight: "min(88vh, 560px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.18)",
          padding: "18px 18px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 id="customer-pay-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: theme.text }}>
              Customer payment
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
              Build a payment message from your saved pay links (Payments → Send Payment Information to Customer) and copy it to send by
              text or email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!customerId ? (
          <p style={{ fontSize: 13, color: "#b45309" }}>Link a customer first.</p>
        ) : !payReady ? (
          <p style={{ fontSize: 13, color: "#b45309" }}>
            Set your hosted pay link (and optional barcode link) under{" "}
            <strong style={{ color: theme.text }}>Payments → Send Payment Information to Customer</strong>.
          </p>
        ) : (
          <>
            {estimateLabel ? (
              <p style={{ margin: "0 0 8px", fontSize: 13, color: theme.text }}>
                <strong>Context:</strong> {estimateLabel}
                {amountLabel ? (
                  <>
                    {" "}
                    · <strong>{amountLabel}</strong>
                  </>
                ) : null}
              </p>
            ) : null}

            {preflightBusy ? (
              <p style={{ fontSize: 12, color: "#94a3b8" }}>Checking estimate & schedule history…</p>
            ) : showReminder ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #f59e0b",
                  background: "#fffbeb",
                  fontSize: 13,
                  color: "#92400e",
                  lineHeight: 1.5,
                }}
              >
                <strong>Reminder:</strong> we don&apos;t see an estimate-style email logged for this customer yet, and they don&apos;t have a
                job on your calendar. Are you sure you want to send payment without sending an estimate or scheduling?
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={acknowledgeRisk}
                    onChange={(e) => setAcknowledgeRisk(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>I understand — copy payment request anyway</span>
                </label>
              </div>
            ) : (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
                We see an estimate-style email or a calendar job for this customer — no extra confirmation needed.
              </p>
            )}

            {barcodeAvailable ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={includeBarcode} onChange={(e) => setIncludeBarcode(e.target.checked)} />
                Include barcode / QR line in the message
              </label>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                disabled={!canCopy}
                onClick={() => void handleCopy()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: canCopy ? theme.primary : "#94a3b8",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: canCopy ? "pointer" : "not-allowed",
                }}
              >
                {copyBusy ? "Copying…" : "Copy payment request"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: theme.text,
                }}
              >
                Close
              </button>
            </div>
            {notice ? (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: notice.includes("Copied") ? "#047857" : "#b91c1c" }}>{notice}</p>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
