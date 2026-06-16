import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { loadCustomersForCustomReceipt, type CustomerReceiptPickerRow } from "../../lib/customReceipt"
import {
  createPaymentRequestLink,
  fetchPaymentProviderStatus,
  formatPaymentAmount,
  loadPaymentRequests,
  loadPaymentSourceEvents,
  loadPaymentSourceQuotes,
  paymentStatusLabel,
  savePaymentProviderCredentials,
  sendPaymentRequest,
  type PaymentProviderId,
  type PaymentRequestRow,
  type PaymentSentVia,
} from "../../lib/paymentRequests"

const inputStyle: React.CSSProperties = {
  ...theme.formInput,
  fontSize: 14,
}

type Props = {
  onOpenProviderSettings?: () => void
}

export default function PaymentRequestsWorkspace({ onOpenProviderSettings }: Props) {
  const { user, session } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const accessToken = session?.access_token ?? null

  const [customers, setCustomers] = useState<CustomerReceiptPickerRow[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [quoteId, setQuoteId] = useState("")
  const [eventId, setEventId] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [provider, setProvider] = useState<PaymentProviderId>("helcim")
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof loadPaymentSourceQuotes>>>([])
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadPaymentSourceEvents>>>([])
  const [requests, setRequests] = useState<PaymentRequestRow[]>([])
  const [activeRequest, setActiveRequest] = useState<PaymentRequestRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [providerStatus, setProviderStatus] = useState<Record<PaymentProviderId, { connected: boolean }> | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsProvider, setSettingsProvider] = useState<PaymentProviderId>("helcim")
  const [settingsLabel, setSettingsLabel] = useState("")
  const [helcimToken, setHelcimToken] = useState("")
  const [squareToken, setSquareToken] = useState("")
  const [squareLocation, setSquareLocation] = useState("")
  const [manualUrl, setManualUrl] = useState("")
  const [fallbackPayUrl, setFallbackPayUrl] = useState("")
  const [autoReceipt, setAutoReceipt] = useState(true)

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.display_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    )
  }, [customers, customerSearch])

  const reloadRequests = useCallback(async () => {
    if (!userId) return
    try {
      setRequests(await loadPaymentRequests(userId))
    } catch {
      setRequests([])
    }
  }, [userId])

  const reloadProviderStatus = useCallback(async () => {
    if (!userId) return
    try {
      const s = await fetchPaymentProviderStatus(userId, accessToken)
      setProviderStatus(s.providers)
      setProvider(s.defaultProvider)
      setAutoReceipt(s.autoReceiptOnPaid)
      if (supabase && userId) {
        const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
        const meta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        const link = typeof meta.customer_pay_link_url === "string" ? meta.customer_pay_link_url.trim() : ""
        setFallbackPayUrl(link)
      }
    } catch {
      setProviderStatus(null)
    }
  }, [userId, accessToken])

  useEffect(() => {
    if (!userId) return
    if (!supabase) return
    void loadCustomersForCustomReceipt(supabase, userId)
      .then(setCustomers)
      .catch(() => setCustomers([]))
    void reloadRequests()
    void reloadProviderStatus()
  }, [userId, reloadRequests, reloadProviderStatus])

  useEffect(() => {
    if (!userId || !customerId) {
      setQuotes([])
      setEvents([])
      setQuoteId("")
      setEventId("")
      return
    }
    void loadPaymentSourceQuotes(userId, customerId).then(setQuotes)
    void loadPaymentSourceEvents(userId, customerId).then(setEvents)
  }, [userId, customerId])

  function applyQuoteSelection(id: string) {
    setQuoteId(id)
    const q = quotes.find((x) => x.id === id)
    if (!q) return
    if (q.amount != null) setAmount(formatPaymentAmount(q.amount))
    setDescription((prev) => prev.trim() || q.label)
  }

  function applyEventSelection(id: string) {
    setEventId(id)
    const ev = events.find((x) => x.id === id)
    if (!ev) return
    if (ev.quote_total != null && ev.quote_total > 0) setAmount(formatPaymentAmount(ev.quote_total))
    setDescription((prev) => prev.trim() || ev.title)
    if (ev.quote_id) setQuoteId(ev.quote_id)
  }

  async function handleGenerate() {
    if (!userId) return
    const amt = Number.parseFloat(amount)
    if (!customerId || !Number.isFinite(amt) || amt <= 0) {
      setNotice("Select a customer and enter a valid amount.")
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const { paymentRequest, paymentUrl } = await createPaymentRequestLink({
        userId,
        customerId,
        amount: amt,
        description: description.trim() || "Payment",
        provider,
        quoteId: quoteId || null,
        calendarEventId: eventId || null,
        accessToken,
      })
      setActiveRequest(paymentRequest)
      setNotice(`Payment link ready: ${paymentUrl}`)
      await reloadRequests()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSend(channel: PaymentSentVia) {
    if (!userId || !activeRequest?.id) return
    setBusy(true)
    setNotice(null)
    try {
      const updated = await sendPaymentRequest({
        userId,
        paymentRequestId: activeRequest.id,
        channel,
        accessToken,
      })
      setActiveRequest(updated)
      setNotice(`Payment link sent via ${channel}.`)
      await reloadRequests()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveSettings() {
    if (!userId) return
    setBusy(true)
    setNotice(null)
    try {
      const fields: Record<string, string> = {}
      if (settingsProvider === "helcim") fields.helcim_api_token = helcimToken
      if (settingsProvider === "square") {
        fields.square_access_token = squareToken
        fields.square_location_id = squareLocation
      }
      if (settingsProvider === "manual") fields.manual_payment_url = manualUrl
      await savePaymentProviderCredentials({
        userId,
        provider: settingsProvider,
        accountLabel: settingsLabel,
        fields,
        defaultProvider: settingsProvider,
        autoReceiptOnPaid: autoReceipt,
        customerPayLinkUrl: fallbackPayUrl.trim(),
        accessToken,
      })
      setHelcimToken("")
      setSquareToken("")
      setNotice("Provider settings saved securely on the server.")
      setSettingsOpen(false)
      await reloadProviderStatus()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="payment-requests-workspace" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.25rem", fontWeight: 800, color: theme.text }}>Collect from customers</h2>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5, maxWidth: 560 }}>
            Create per-job payment links and send them by SMS or email. Your Helcim API token and hosted pay page are configured under Provider settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSettingsOpen((v) => !v)
            onOpenProviderSettings?.()
          }}
          style={secondaryBtn}
        >
          Provider settings
        </button>
      </div>

      {providerStatus ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["helcim", "square", "manual"] as PaymentProviderId[]).map((p) => (
            <span
              key={p}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: providerStatus[p]?.connected ? "#f0fdf4" : "#f8fafc",
                color: providerStatus[p]?.connected ? "#15803d" : "#64748b",
                border: `1px solid ${providerStatus[p]?.connected ? "#86efac" : theme.border}`,
              }}
            >
              {p}: {providerStatus[p]?.connected ? "connected" : "not connected"}
            </span>
          ))}
        </div>
      ) : null}

      {settingsOpen ? (
        <section id="payment-provider-settings" style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Provider settings</h3>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
            API keys are saved server-only. Add your Helcim API token for invoice-style links, or a hosted pay URL as fallback when the API is unavailable.
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
            <label style={labelStyle}>
              Fallback hosted pay URL (your merchant page)
              <input
                value={fallbackPayUrl}
                onChange={(e) => setFallbackPayUrl(e.target.value)}
                style={inputStyle}
                placeholder="https://pay.myhelcim.com/..."
              />
            </label>
            <label style={labelStyle}>
              Provider
              <select value={settingsProvider} onChange={(e) => setSettingsProvider(e.target.value as PaymentProviderId)} style={inputStyle}>
                <option value="helcim">Helcim</option>
                <option value="square">Square</option>
                <option value="manual">Manual hosted link</option>
              </select>
            </label>
            <label style={labelStyle}>
              Account label (optional)
              <input value={settingsLabel} onChange={(e) => setSettingsLabel(e.target.value)} style={inputStyle} placeholder="Main merchant account" />
            </label>
            {settingsProvider === "helcim" ? (
              <label style={labelStyle}>
                Helcim API token
                <input type="password" value={helcimToken} onChange={(e) => setHelcimToken(e.target.value)} style={inputStyle} placeholder="Paste new token to update" />
              </label>
            ) : null}
            {settingsProvider === "square" ? (
              <>
                <label style={labelStyle}>
                  Square access token
                  <input type="password" value={squareToken} onChange={(e) => setSquareToken(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Square location ID
                  <input value={squareLocation} onChange={(e) => setSquareLocation(e.target.value)} style={inputStyle} />
                </label>
              </>
            ) : null}
            {settingsProvider === "manual" ? (
              <label style={labelStyle}>
                Hosted payment page URL
                <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} style={inputStyle} placeholder="https://pay.yourprocessor.com/..." />
              </label>
            ) : null}
            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={autoReceipt} onChange={(e) => setAutoReceipt(e.target.checked)} />
              Email receipt PDF when webhook marks payment paid
            </label>
            <button type="button" disabled={busy} onClick={() => void handleSaveSettings()} style={primaryBtn}>
              Save provider credentials
            </button>
          </div>
        </section>
      ) : null}

      <section style={card}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 800 }}>New payment request</h3>
        <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <label style={labelStyle}>
            Customer
            {customers.length > 12 ? (
              <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search…" style={inputStyle} />
            ) : null}
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
              <option value="">Select customer</option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          {customerId ? (
            <>
              <label style={labelStyle}>
                Estimate / quote (optional)
                <select
                  value={quoteId}
                  onChange={(e) => applyQuoteSelection(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— None —</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                      {q.amount != null ? ` · $${q.amount.toFixed(2)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Calendar job (optional)
                <select value={eventId} onChange={(e) => applyEventSelection(e.target.value)} style={inputStyle}>
                  <option value="">— None —</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {new Date(ev.start_at).toLocaleDateString()} — {ev.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <label style={labelStyle}>
            Amount (USD)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={inputStyle} placeholder="0.00" />
          </label>
          <label style={labelStyle}>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Deposit for kitchen remodel" />
          </label>
          <label style={labelStyle}>
            Payment provider
            <select value={provider} onChange={(e) => setProvider(e.target.value as PaymentProviderId)} style={inputStyle}>
              <option value="helcim">Helcim</option>
              <option value="square">Square</option>
              <option value="manual">Manual hosted link</option>
            </select>
          </label>

          <button type="button" disabled={busy || !customerId} onClick={() => void handleGenerate()} style={primaryBtn}>
            {busy ? "Working…" : "Generate payment link"}
          </button>
        </div>

        {activeRequest?.payment_url ? (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: theme.text }}>Hosted payment link</p>
            <a href={activeRequest.payment_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: theme.primary, wordBreak: "break-all" }}>
              {activeRequest.payment_url}
            </a>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <button type="button" disabled={busy} onClick={() => void handleSend("sms")} style={secondaryBtn}>
                Send SMS
              </button>
              <button type="button" disabled={busy} onClick={() => void handleSend("email")} style={secondaryBtn}>
                Send email
              </button>
              <button type="button" disabled={busy} onClick={() => void handleSend("both")} style={secondaryBtn}>
                Send both
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {notice ? (
        <p style={{ margin: 0, fontSize: 14, color: notice.startsWith("Payment link ready") ? "#15803d" : "#b91c1c", lineHeight: 1.5 }}>{notice}</p>
      ) : null}

      <section style={card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Recent requests</h3>
        {requests.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>No payment requests yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {requests.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "#fafafa",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ color: theme.text }}>${Number(r.amount).toFixed(2)} — {r.description}</strong>
                  <span style={{ fontWeight: 700, color: r.status === "paid" ? "#15803d" : "#64748b" }}>{paymentStatusLabel(r.status)}</span>
                </div>
                <div style={{ marginTop: 4, color: "#64748b" }}>
                  {new Date(r.created_at).toLocaleString()} · {r.provider}
                  {r.sent_via ? ` · sent via ${r.sent_via}` : ""}
                </div>
                {r.payment_url ? (
                  <a href={r.payment_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 6, color: theme.primary, fontWeight: 600 }}>
                    Open link
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const card: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  padding: "18px 20px",
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: theme.text,
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  justifySelf: "start",
}

const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}
