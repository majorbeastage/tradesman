import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import {
  appendHelcimCustomerQueryToPayPortalUrl,
  helcimPayPortalUrlAllowsIframe,
  normalizeHelcimPayPortalUrl,
  parseBillingMetadata,
  resolveHelcimPayPortalBaseUrl,
} from "../../lib/billingProfileMetadata"
import { isHelcimJsReturnMessage, type HelcimJsReturnMessage } from "../../lib/helcimJsReturnMessage"

declare global {
  interface Window {
    helcimProcess?: () => void
  }
}

const ENV_PORTAL = (import.meta as { env?: Record<string, string> }).env?.VITE_HELCIM_PAYMENT_PORTAL_URL ?? ""
const ENV_JS_TOKEN = ((import.meta as { env?: Record<string, string> }).env?.VITE_HELCIM_JS_TOKEN ?? "").trim()
const HELCIM_SCRIPT_SRC = "https://secure.myhelcim.com/js/version2.js"
const HELCIM_RETURN_IFRAME_NAME = "tradesmanHelcimJsReturn"

/** Long-form builder / env notes on Payments — only when signed in as this account. */
const PAYMENTS_DEV_NOTES_EMAILS = new Set(["joe@tradesman-us.com"])

function showPaymentsDevNotes(email: string | null | undefined): boolean {
  return PAYMENTS_DEV_NOTES_EMAILS.has((email ?? "").trim().toLowerCase())
}

const inputStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#0f172a",
  color: "#f9fafb",
  fontSize: 15,
}

export default function PaymentsPage() {
  const { user: authUser } = useAuth()
  const profileUserId = useScopedUserId()
  const devNotes = showPaymentsDevNotes(authUser?.email)
  const [portalBaseUrl, setPortalBaseUrl] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState("")
  const [scriptReady, setScriptReady] = useState(false)
  const [lastResult, setLastResult] = useState<HelcimJsReturnMessage | null>(null)

  const useHelcimJs = Boolean(ENV_JS_TOKEN)

  const formAction = useMemo(() => {
    const envOrigin = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)?.replace(/\/+$/, "").trim()
    const base = envOrigin || origin
    return base ? `${base}/api/helcim-js-return` : ""
  }, [origin])

  /** Origin that loads in the hidden iframe after POST (must match postMessage `ev.origin`). */
  const helcimReturnOrigin = useMemo(() => {
    if (!formAction) return ""
    try {
      return new URL(formAction).origin
    } catch {
      return ""
    }
  }, [formAction])

  useEffect(() => {
    if (typeof window === "undefined") return
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!supabase || !profileUserId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (cancelled) return
      setLoading(false)
      if (error || !data) {
        setPortalBaseUrl(ENV_PORTAL.trim() || null)
        setCustomerCode(null)
        return
      }
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      setPortalBaseUrl(resolveHelcimPayPortalBaseUrl(ENV_PORTAL, billing.helcim_pay_portal_url ?? null))
      setCustomerCode(billing.billing_helcim_customer_code?.trim() || null)
    })()
    return () => {
      cancelled = true
    }
  }, [profileUserId])

  useEffect(() => {
    if (!useHelcimJs) return
    const sel = "script[data-tradesman-helcim-js]"
    const existing = document.querySelector(sel) as HTMLScriptElement | null
    if (existing) {
      setScriptReady(typeof window.helcimProcess === "function")
      return
    }
    const s = document.createElement("script")
    s.src = HELCIM_SCRIPT_SRC
    s.async = true
    s.dataset.tradesmanHelcimJs = "1"
    s.onload = () => {
      setScriptReady(typeof window.helcimProcess === "function")
    }
    document.body.appendChild(s)
  }, [useHelcimJs])

  useEffect(() => {
    if (!useHelcimJs || !helcimReturnOrigin) return
    const onHelcimMessage = (ev: MessageEvent) => {
      if (ev.origin !== helcimReturnOrigin) return
      if (!isHelcimJsReturnMessage(ev.data)) return
      setLastResult(ev.data)
    }
    window.addEventListener("message", onHelcimMessage)
    return () => window.removeEventListener("message", onHelcimMessage)
  }, [useHelcimJs, helcimReturnOrigin])

  const withCustomer = portalBaseUrl ? appendHelcimCustomerQueryToPayPortalUrl(portalBaseUrl, customerCode) : null
  const normalizedPortal = withCustomer ? normalizeHelcimPayPortalUrl(withCustomer) : null
  const iframeUrl = normalizedPortal && helcimPayPortalUrlAllowsIframe(normalizedPortal) ? normalizedPortal : null
  const openInTabUrl = normalizedPortal && !iframeUrl ? normalizedPortal : null
  const invalidPortal = Boolean(portalBaseUrl?.trim()) && !normalizedPortal

  const helcimJsHttpsOk = typeof window !== "undefined" && window.location.protocol === "https:"

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Payments</h1>

      {useHelcimJs ? (
        <>
          {devNotes ? (
            <>
              <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
                Checkout uses <strong>Helcim.js</strong> on this page: card fields stay in your browser, Helcim tokenizes over CORS, then
                posts results to our server inside a <strong>hidden iframe</strong> so you are not redirected away from the app. Configure
                your <strong>Helcim.js configuration token</strong> as <code style={{ color: theme.primary }}>VITE_HELCIM_JS_TOKEN</code>{" "}
                (from Helcim → Integrations → Helcim.js). Live processing requires <strong>HTTPS</strong> on this origin.
              </p>
              <p style={{ color: "#9ca3af", marginBottom: 16, lineHeight: 1.45, fontSize: 13 }}>
                Success or decline shown here is for convenience; billing automation still follows Helcim <strong>webhooks</strong> into
                Supabase (<code>billing-webhook</code>).
              </p>
            </>
          ) : (
            <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
              Pay securely with your card below. You&apos;ll see whether your payment was approved right on this page.
            </p>
          )}
          {!helcimJsHttpsOk ? (
            <div
              style={{
                marginBottom: 16,
                padding: 14,
                borderRadius: 10,
                border: "1px solid #92400e",
                background: "#451a03",
                color: "#fde68a",
                fontSize: 14,
              }}
            >
              {devNotes
                ? "Helcim.js live mode expects HTTPS. Use a secure preview URL or production host for real cards; localhost may be limited depending on your Helcim.js settings."
                : "Card payments need a secure (https) connection. Open this app from your production link, not plain http://localhost, when using a live card."}
            </div>
          ) : null}
          {loading ? (
            <p style={{ color: "#9ca3af" }}>Loading…</p>
          ) : !formAction ? (
            <p style={{ color: "#9ca3af" }}>Preparing checkout…</p>
          ) : (
            <>
              {lastResult ? (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 14,
                    borderRadius: 10,
                    border: `1px solid ${lastResult.response === 1 ? "#047857" : "#b91c1c"}`,
                    background: lastResult.response === 1 ? "#064e3b" : "#450a0a",
                    color: lastResult.response === 1 ? "#d1fae5" : "#fecaca",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  <strong>{lastResult.response === 1 ? "Approved" : "Not approved"}</strong>
                  {lastResult.responseMessage ? ` — ${lastResult.responseMessage}` : ""}
                  {lastResult.transactionId ? (
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95 }}>
                      {devNotes ? (
                        <>
                          Transaction id: <code>{lastResult.transactionId}</code>
                        </>
                      ) : (
                        <>Reference: {lastResult.transactionId}</>
                      )}
                      {lastResult.amount ? (
                        <>
                          {" "}
                          · Amount: {lastResult.amount} {lastResult.currency || ""}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {lastResult.noticeMessage ? (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{lastResult.noticeMessage}</div>
                  ) : null}
                </div>
              ) : null}

              <iframe
                name={HELCIM_RETURN_IFRAME_NAME}
                title="Helcim payment result"
                style={{ position: "absolute", width: 0, height: 0, border: "none", visibility: "hidden" }}
                aria-hidden
              />

              <form
                name="helcimForm"
                id="helcimForm"
                method="POST"
                action={formAction}
                target={HELCIM_RETURN_IFRAME_NAME}
                style={{
                  maxWidth: 520,
                  padding: 20,
                  borderRadius: 12,
                  border: "1px solid #374151",
                  background: "#111827",
                }}
              >
                <div id="helcimResults" style={{ marginBottom: 16, minHeight: 4, fontSize: 13, color: "#fca5a5" }} />

                <input type="hidden" id="token" value={ENV_JS_TOKEN} />

                <div style={{ display: "grid", gap: 14 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
                    Amount
                    <input type="text" id="amount" defaultValue="" placeholder="0.00" autoComplete="off" style={inputStyle} />
                    <span style={{ fontWeight: 400, fontSize: 12, color: "#9ca3af" }}>
                      For Verify-only flows your Helcim.js config may ignore amount.
                    </span>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
                    Cardholder name
                    <input type="text" id="cardHolderName" defaultValue="" autoComplete="cc-name" style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
                    Billing street address
                    <input
                      type="text"
                      id="cardHolderAddress"
                      defaultValue=""
                      placeholder="Street address (AVS)"
                      autoComplete="street-address"
                      style={inputStyle}
                    />
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb", flex: "1 1 180px" }}>
                      Billing city
                      <input
                        type="text"
                        id="billing_city"
                        defaultValue=""
                        placeholder="City"
                        autoComplete="address-level2"
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb", flex: "1 1 140px" }}>
                      Billing state / province
                      <input
                        type="text"
                        id="billing_province"
                        defaultValue=""
                        placeholder="State or province"
                        autoComplete="address-level1"
                        style={inputStyle}
                      />
                    </label>
                  </div>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
                    Billing postal / ZIP code
                    <input
                      type="text"
                      id="cardHolderPostalCode"
                      defaultValue=""
                      placeholder="Postal or ZIP"
                      autoComplete="postal-code"
                      style={inputStyle}
                    />
                  </label>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", lineHeight: 1.45 }}>
                    {devNotes
                      ? "Your Helcim.js terminal can require these for AVS. Use the same address the card issuer has on file."
                      : "Use the same billing address your bank has on file for this card."}
                  </p>

                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
                    Card number
                    <input type="text" id="cardNumber" defaultValue="" inputMode="numeric" autoComplete="cc-number" style={inputStyle} />
                  </label>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb", flex: "1 1 100px" }}>
                      Expiry (MM)
                      <input type="text" id="cardExpiryMonth" defaultValue="" placeholder="MM" autoComplete="cc-exp-month" style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb", flex: "1 1 100px" }}>
                      Expiry (YY)
                      <input type="text" id="cardExpiryYear" defaultValue="" placeholder="YY" autoComplete="cc-exp-year" style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#e5e7eb", flex: "1 1 100px" }}>
                      CVV
                      <input type="text" id="cardCVV" defaultValue="" inputMode="numeric" autoComplete="cc-csc" style={inputStyle} />
                    </label>
                  </div>

                  <input type="hidden" id="customerCode" value={customerCode ?? ""} />
                  <input type="hidden" id="orderNumber" value={profileUserId ? `TM-${profileUserId}` : ""} />

                  <input
                    type="button"
                    id="buttonProcess"
                    value={scriptReady ? "Pay with Helcim" : "Loading Helcim…"}
                    disabled={!scriptReady}
                    onClick={() => {
                      setLastResult(null)
                      window.helcimProcess?.()
                    }}
                    style={{
                      marginTop: 4,
                      padding: "12px 20px",
                      borderRadius: 8,
                      border: "none",
                      background: scriptReady ? theme.primary : "#4b5563",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: scriptReady ? "pointer" : "not-allowed",
                      width: "fit-content",
                    }}
                  />
                </div>
              </form>

              {devNotes ? (
                <p style={{ color: "#6b7280", fontSize: 12, marginTop: 20, lineHeight: 1.45 }}>
                  Optional: keep <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> for a hosted Helcim Pay fallback (not shown while Helcim.js
                  token is set). If your mobile webview posts to a different API host than the page origin, set{" "}
                  <code>VITE_PUBLIC_APP_ORIGIN</code> to that HTTPS origin.
                </p>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          {devNotes ? (
            <>
              <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
                This tab can load <strong>Helcim&apos;s hosted payment page</strong> in an iframe when no Helcim.js token is configured.
                For an embedded checkout on this domain, set <code style={{ color: theme.primary }}>VITE_HELCIM_JS_TOKEN</code> (see Helcim →
                Integrations → Helcim.js).
              </p>
              <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
                <strong>Hosted Pay setup:</strong> set one pay/portal URL on the app build as{" "}
                <code style={{ color: theme.primary }}>VITE_HELCIM_PAYMENT_PORTAL_URL</code> (Vercel / mobile env — not Supabase). Your{" "}
                <strong>Helcim customer code</strong> from Admin → Billing &amp; Helcim is appended as <code>customerCode</code> when missing
                from the URL (confirm with Helcim for your page template). Per-user portal URL overrides are optional.
              </p>
            </>
          ) : (
            <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
              Your secure payment window loads below when your organization has turned on online payments.
            </p>
          )}
          {iframeUrl && !customerCode ? (
            <p style={{ color: "#9ca3af", fontSize: 12, marginTop: -8, marginBottom: 12 }}>
              No Helcim customer code on file — the shared portal may not pre-select your account. Ask your admin to add it under Billing
              &amp; Helcim.
            </p>
          ) : null}
          {loading ? (
            <p style={{ color: "#9ca3af" }}>Loading…</p>
          ) : iframeUrl ? (
            <div
              style={{
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid #374151",
                background: "#111827",
                minHeight: 560,
              }}
            >
              <iframe
                title="Helcim payments"
                src={iframeUrl}
                style={{ width: "100%", height: "min(78vh, 720px)", border: "none", display: "block" }}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : openInTabUrl ? (
            <div
              style={{
                padding: 20,
                borderRadius: 10,
                border: "1px solid #1d4ed8",
                background: "#172554",
                color: "#bfdbfe",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              <p style={{ margin: "0 0 12px" }}>
                This payment portal link is not <strong>https</strong>, so it cannot be embedded here (browser security). Open it in a
                new tab:
              </p>
              <a
                href={openInTabUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#93c5fd", fontWeight: 600, wordBreak: "break-all" }}
              >
                {openInTabUrl}
              </a>
            </div>
          ) : invalidPortal ? (
            <div
              style={{
                padding: 20,
                borderRadius: 10,
                border: "1px solid #92400e",
                background: "#451a03",
                color: "#fde68a",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              <strong>Payment portal URL is not valid.</strong> Use a full URL such as{" "}
              <code style={{ color: "#fef3c7" }}>https://pay.helcim.com/v2/pay/…</code> in Admin → Billing &amp; Helcim, or set{" "}
              <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> for the app build.
            </div>
          ) : (
            <div
              style={{
                padding: 20,
                borderRadius: 10,
                border: "1px solid #92400e",
                background: "#451a03",
                color: "#fde68a",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              <strong>Online payments aren&apos;t set up for this app yet.</strong>{" "}
              {devNotes ? (
                <>
                  Set <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> once on the web or mobile build (recommended — same Helcim page for
                  everyone), or add a per-user URL in <strong>Admin → Billing &amp; Helcim</strong>. Map each user&apos;s{" "}
                  <strong>Helcim customer code</strong> there so webhooks and the pay link can tie activity to the right account. Or set{" "}
                  <code>VITE_HELCIM_JS_TOKEN</code> for Helcim.js on this page.
                </>
              ) : (
                <>
                  Your administrator still needs to finish payment setup for this site.
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
