import { useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../styles/theme"
import type { CustomerPaymentProfileMetadata } from "../lib/customerPaymentMetadata"
import { loadCustomerPaymentPreflight } from "../lib/customerPaymentPreflight"
import {
  copyCustomerPaymentShareAndLog,
  markQuoteCustomerPaymentCollected,
  prepareCustomerPaymentShare,
  recordCustomerPaymentShareSent,
} from "../lib/customerPaymentsWorkflow"
import {
  customerPayWorkflowAgingBadge,
  customerPayWorkflowLabel,
  parseQuoteCustomerPayWorkflow,
} from "../lib/quoteCustomerPayWorkflow"
import type { CustomerPaymentQuoteOption } from "../lib/customerQuotePaymentOptions"
import { customerEmailFromIdentifiers, customerPhoneFromIdentifiers } from "../lib/customerIdentifiers"
import { listCustomerEmailValues, listCustomerPhoneValues, pickDefaultContactValue } from "../lib/customerContactList"
import { requiresManualSmsOptInRecord } from "../lib/smsFirstOutboundCompliance"
import { customerHasSmsConsent } from "../lib/customerSmsConsent"
import { useAuth } from "../contexts/AuthContext"
import { getFreshAccessToken } from "../lib/authPlatformApi"
import { outboundMessagesJsonBody } from "../lib/platformToolsJsonBody"
import { supabase as defaultSupabase } from "../lib/supabase"

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
  /** Latest `quotes.metadata` for this estimate — drives status chips when `quoteId` is set */
  quoteMetadata?: Record<string, unknown> | null
  /** When set (e.g. Customers tab), user picks which estimate to attach payment to. */
  quoteOptions?: CustomerPaymentQuoteOption[]
  /** After copy or manual mark updates metadata on server */
  onQuoteMetadataPatched?: (meta: Record<string, unknown>) => void
  /** Refresh customer comms after email/SMS send (e.g. Customers tab activity list). */
  onDeliverySent?: () => void
}

function formatFetchError(response: Response, raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as { error?: string; message?: string }
      return j.error?.trim() || j.message?.trim() || trimmed
    } catch {
      return trimmed || response.statusText
    }
  }
  return trimmed || response.statusText
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
  quoteMetadata,
  quoteOptions,
  onQuoteMetadataPatched,
  onDeliverySent,
}: CustomerPaymentRequestModalProps) {
  const { session } = useAuth()
  const [includeBarcode, setIncludeBarcode] = useState(false)
  const [preflightBusy, setPreflightBusy] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [acknowledgeRisk, setAcknowledgeRisk] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [smsBusy, setSmsBusy] = useState(false)
  const [markBusy, setMarkBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pickedQuoteId, setPickedQuoteId] = useState<string>("")
  const [emailTo, setEmailTo] = useState("")
  const [phoneTo, setPhoneTo] = useState("")
  const [smsBlocked, setSmsBlocked] = useState(false)

  const activeQuoteOption = useMemo(() => {
    if (!quoteOptions?.length) return null
    const id = pickedQuoteId.trim() || quoteId?.trim() || quoteOptions[0]?.quoteId || ""
    return quoteOptions.find((o) => o.quoteId === id) ?? quoteOptions[0] ?? null
  }, [quoteOptions, pickedQuoteId, quoteId])

  const resolvedQuoteId = activeQuoteOption?.quoteId ?? quoteId?.trim() ?? ""
  const resolvedEstimateLabel = activeQuoteOption?.estimateLabel ?? estimateLabel
  const resolvedAmountLabel = activeQuoteOption?.amountLabel ?? amountLabel
  const resolvedQuoteMetadata = activeQuoteOption?.metadata ?? quoteMetadata ?? null

  useEffect(() => {
    if (!open) return
    setIncludeBarcode(false)
    setAcknowledgeRisk(false)
    setNotice(null)
    setEmailTo("")
    setPhoneTo("")
    setSmsBlocked(false)
    if (quoteOptions?.length) {
      const initial = quoteId?.trim() && quoteOptions.some((o) => o.quoteId === quoteId.trim()) ? quoteId.trim() : quoteOptions[0].quoteId
      setPickedQuoteId(initial)
    } else {
      setPickedQuoteId(quoteId?.trim() ?? "")
    }
    if (!supabase || !userId || !customerId) {
      setShowReminder(false)
      return
    }
    setPreflightBusy(true)
    void (async () => {
      const [p, customerRes, eventsRes] = await Promise.all([
        loadCustomerPaymentPreflight(supabase, userId, customerId),
        supabase.from("customers").select("customer_identifiers, metadata").eq("id", customerId).maybeSingle(),
        supabase
          .from("communication_events")
          .select("event_type, direction, created_at")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
      setShowReminder(p.showEstimateOrSchedulingReminder)
      const identifiers = customerRes.data?.customer_identifiers ?? null
      const emails = listCustomerEmailValues(identifiers)
      const phones = listCustomerPhoneValues(identifiers)
      setEmailTo(
        customerEmailFromIdentifiers(identifiers) || pickDefaultContactValue(emails) || emails[0] || "",
      )
      setPhoneTo(customerPhoneFromIdentifiers(identifiers) || pickDefaultContactValue(phones) || phones[0] || "")
      const events = (eventsRes.data ?? []) as { event_type?: string; direction?: string; created_at?: string }[]
      const needsOptIn = requiresManualSmsOptInRecord(events)
      const hasConsent = customerHasSmsConsent(customerRes.data?.metadata)
      setSmsBlocked(needsOptIn && !hasConsent)
      setPreflightBusy(false)
    })()
  }, [open, supabase, userId, customerId, quoteOptions, quoteId])

  const payReady = Boolean(profile.customer_pay_link_url?.trim() || profile.customer_pay_barcode_url?.trim())
  const barcodeAvailable = Boolean(profile.customer_pay_barcode_url?.trim())
  const workflow = parseQuoteCustomerPayWorkflow(resolvedQuoteMetadata ?? null)
  const aging = customerPayWorkflowAgingBadge(workflow)
  const quoteIdTrim = resolvedQuoteId
  const canDeliver =
    payReady &&
    Boolean(customerId) &&
    Boolean(userId) &&
    (!showReminder || acknowledgeRisk) &&
    !preflightBusy &&
    !copyBusy &&
    !emailBusy &&
    !smsBusy

  function applyPatchedMetadata(patched?: Record<string, unknown>) {
    if (patched && onQuoteMetadataPatched) onQuoteMetadataPatched(patched)
  }

  async function handleCopy() {
    if (!userId || !customerId || !canDeliver) return
    setCopyBusy(true)
    setNotice(null)
    try {
      const res = await copyCustomerPaymentShareAndLog({
        supabase,
        userId,
        customerId,
        quoteId: resolvedQuoteId || null,
        calendarEventId: calendarEventId ?? null,
        profile,
        customerName: customerName ?? null,
        estimateLabel: resolvedEstimateLabel,
        amountLabel: resolvedAmountLabel,
        includeBarcodeInMessage: includeBarcode,
      })
      if (!res.ok) {
        setNotice(res.error ?? "Could not copy.")
        return
      }
      applyPatchedMetadata(res.patchedQuoteMetadata)
      setNotice("Copied to clipboard. Paste into text or email if you prefer manual delivery.")
    } finally {
      setCopyBusy(false)
    }
  }

  async function handleSendEmail() {
    if (!userId || !customerId || !canDeliver) return
    const to = emailTo.trim()
    if (!to) {
      setNotice("Enter an email address for this customer.")
      return
    }
    const prepared = prepareCustomerPaymentShare({
      profile,
      customerName: customerName ?? null,
      estimateLabel: resolvedEstimateLabel,
      amountLabel: resolvedAmountLabel,
      includeBarcodeInMessage: includeBarcode,
    })
    if (!prepared.ok) {
      setNotice(prepared.error)
      return
    }
    setEmailBusy(true)
    setNotice(null)
    try {
      const response = await fetch("/api/outbound-messages?__channel=email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: outboundMessagesJsonBody({
          to,
          subject: prepared.share.subject,
          body: prepared.share.body,
          userId,
          customerId,
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchError(response, raw))
      const recorded = await recordCustomerPaymentShareSent({
        supabase,
        userId,
        customerId,
        quoteId: resolvedQuoteId || null,
        calendarEventId: calendarEventId ?? null,
        profile,
        amountLabel: resolvedAmountLabel,
        includeBarcodeInMessage: includeBarcode,
        delivery: "email",
        share: prepared.share,
      })
      applyPatchedMetadata(recorded.patchedQuoteMetadata)
      setNotice(`Payment request emailed to ${to}.`)
      onDeliverySent?.()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not send email.")
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleSendSms() {
    if (!userId || !customerId || !canDeliver) return
    if (smsBlocked) {
      setNotice("SMS is blocked until you record SMS opt-in consent for this customer.")
      return
    }
    const to = phoneTo.trim()
    if (!to) {
      setNotice("Enter a phone number for this customer.")
      return
    }
    const prepared = prepareCustomerPaymentShare({
      profile,
      customerName: customerName ?? null,
      estimateLabel: resolvedEstimateLabel,
      amountLabel: resolvedAmountLabel,
      includeBarcodeInMessage: includeBarcode,
    })
    if (!prepared.ok) {
      setNotice(prepared.error)
      return
    }
    setSmsBusy(true)
    setNotice(null)
    try {
      let token = session?.access_token ?? null
      const sb = supabase ?? defaultSupabase
      if (sb && session) {
        token = (await getFreshAccessToken(sb, session)) ?? token
      }
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: outboundMessagesJsonBody({
          to,
          body: prepared.share.body,
          userId,
          customerId,
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchError(response, raw))
      const recorded = await recordCustomerPaymentShareSent({
        supabase,
        userId,
        customerId,
        quoteId: resolvedQuoteId || null,
        calendarEventId: calendarEventId ?? null,
        profile,
        amountLabel: resolvedAmountLabel,
        includeBarcodeInMessage: includeBarcode,
        delivery: "sms",
        share: prepared.share,
      })
      applyPatchedMetadata(recorded.patchedQuoteMetadata)
      setNotice(`Payment request sent by SMS to ${to}.`)
      onDeliverySent?.()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not send SMS.")
    } finally {
      setSmsBusy(false)
    }
  }

  async function handleMark(kind: "paid" | "waived") {
    if (!userId || !quoteIdTrim || !customerId) return
    setMarkBusy(true)
    setNotice(null)
    try {
      const res = await markQuoteCustomerPaymentCollected({
        supabase,
        quoteId: quoteIdTrim,
        userId,
        customerId,
        calendarEventId: calendarEventId ?? null,
        kind,
        amountLabel,
        note: null,
      })
      if (!res.ok || !res.metadata) {
        setNotice(res.error ?? "Could not update payment status.")
        return
      }
      onQuoteMetadataPatched?.(res.metadata)
      setNotice(kind === "paid" ? "Marked as paid (manual)." : "Marked as waived / paid offline.")
    } finally {
      setMarkBusy(false)
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
          width: "min(480px, calc(100vw - 28px))",
          maxHeight: "min(88vh, 640px)",
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
              Build a payment message from your saved pay links (Payments → Send Payment Information to Customer), then send
              by email or SMS, or copy to paste manually.
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
              background: "#fff",
              color: "#0f172a",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 800,
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
            {quoteOptions && quoteOptions.length > 0 ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, fontSize: 13, color: theme.text }}>
                <span style={{ fontWeight: 700 }}>Estimate for this payment</span>
                <select
                  value={pickedQuoteId || quoteOptions[0]?.quoteId || ""}
                  onChange={(e) => setPickedQuoteId(e.target.value)}
                  style={{ ...theme.formInput, padding: "8px 10px", fontSize: 13 }}
                >
                  {quoteOptions.map((opt) => (
                    <option key={opt.quoteId} value={opt.quoteId}>
                      {opt.estimateLabel}
                      {opt.amountLabel ? ` · ${opt.amountLabel}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {quoteIdTrim ? (
              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  fontSize: 12,
                  color: "#475569",
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: theme.text }}>Tracking:</strong> {customerPayWorkflowLabel(workflow)}
                {workflow.status === "sent" && workflow.last_sent_at ? (
                  <>
                    {" "}
                    · Sent {new Date(workflow.last_sent_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </>
                ) : null}
                {aging ? (
                  <span style={{ display: "block", marginTop: 4, color: "#b45309", fontWeight: 700 }}>{aging}</span>
                ) : null}
              </div>
            ) : null}
            {resolvedEstimateLabel ? (
              <p style={{ margin: "0 0 8px", fontSize: 13, color: theme.text }}>
                <strong>Context:</strong> {resolvedEstimateLabel}
                {resolvedAmountLabel ? (
                  <>
                    {" "}
                    · <strong>{resolvedAmountLabel}</strong>
                  </>
                ) : null}
              </p>
            ) : null}

            {preflightBusy ? (
              <p style={{ fontSize: 12, color: "#94a3b8" }}>Checking estimate, schedule, and contact info…</p>
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
                  <span>I understand — send payment request anyway</span>
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

            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
                Email
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="customer@email.com"
                    style={{ ...theme.formInput, flex: "1 1 180px", padding: "8px 10px", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    disabled={!canDeliver || !emailTo.trim()}
                    onClick={() => void handleSendEmail()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: canDeliver && emailTo.trim() ? theme.primary : "#94a3b8",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: canDeliver && emailTo.trim() ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {emailBusy ? "Sending…" : "Send email"}
                  </button>
                </div>
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
                SMS
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <input
                    value={phoneTo}
                    onChange={(e) => setPhoneTo(e.target.value)}
                    placeholder="(555) 555-5555"
                    style={{ ...theme.formInput, flex: "1 1 180px", padding: "8px 10px", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    disabled={!canDeliver || !phoneTo.trim() || smsBlocked}
                    onClick={() => void handleSendSms()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: canDeliver && phoneTo.trim() && !smsBlocked ? "#047857" : "#94a3b8",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: canDeliver && phoneTo.trim() && !smsBlocked ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {smsBusy ? "Sending…" : "Send SMS"}
                  </button>
                </div>
                {smsBlocked ? (
                  <span style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
                    Record SMS opt-in consent on this customer before sending texts.
                  </span>
                ) : null}
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                disabled={!canDeliver}
                onClick={() => void handleCopy()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  color: theme.text,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: canDeliver ? "pointer" : "not-allowed",
                }}
              >
                {copyBusy ? "Copying…" : "Copy message"}
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
            {quoteIdTrim && customerId ? (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: theme.text }}>
                  Received payment elsewhere?
                </p>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                  Cash, check, or another processor doesn&apos;t change your hosted link — record it here so your team sees Paid / waived on
                  this estimate.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    type="button"
                    disabled={markBusy || workflow.status === "paid"}
                    onClick={() => void handleMark("paid")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: workflow.status === "paid" ? "#cbd5e1" : "#047857",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: workflow.status === "paid" || markBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {markBusy ? "Saving…" : "Mark paid (manual)"}
                  </button>
                  <button
                    type="button"
                    disabled={markBusy || workflow.status === "waived"}
                    onClick={() => void handleMark("waived")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: workflow.status === "waived" || markBusy ? "not-allowed" : "pointer",
                      color: theme.text,
                    }}
                  >
                    Mark waived / offline
                  </button>
                </div>
              </div>
            ) : null}
            {notice ? (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: notice.includes("Could not") || notice.includes("blocked") || notice.includes("Enter") ? "#b91c1c" : "#047857" }}>
                {notice}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
