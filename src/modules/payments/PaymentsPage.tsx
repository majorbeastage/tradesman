import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "../../lib/supabase"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import {
  appendHelcimCustomerQueryToPayPortalUrl,
  helcimPayPortalUrlAllowsIframe,
  normalizeHelcimPayPortalUrl,
  parseBillingMetadata,
  resolveHelcimPayPortalBaseUrl,
  type BillingProfileMetadata,
} from "../../lib/billingProfileMetadata"
import { formatUsdMonthly, sumMonthlyBillingUsd } from "../../lib/billingProductTypes"
import { isHelcimJsReturnMessage, type HelcimJsReturnMessage } from "../../lib/helcimJsReturnMessage"

declare global {
  interface Window {
    helcimProcess?: () => void
  }
}

/** Must use `import.meta.env.VITE_*` directly so Vite inlines values at build time (cast/indirect access is left empty in production). */
const ENV_PORTAL = String(import.meta.env.VITE_HELCIM_PAYMENT_PORTAL_URL ?? "").trim()
const ENV_JS_TOKEN = String(import.meta.env.VITE_HELCIM_JS_TOKEN ?? "").trim()
const HELCIM_SCRIPT_SRC = "https://secure.myhelcim.com/js/version2.js"
const HELCIM_RETURN_IFRAME_NAME = "tradesmanHelcimJsReturn"

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
  const profileUserId = useScopedUserId()
  const [portalBaseUrl, setPortalBaseUrl] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState("")
  const [scriptReady, setScriptReady] = useState(false)
  const [lastResult, setLastResult] = useState<HelcimJsReturnMessage | null>(null)
  const [billingForPayments, setBillingForPayments] = useState<BillingProfileMetadata>({})
  /** Set when `billing-portal-config` fails (deploy, secret, or network) so we can explain beyond “missing Vite env”. */
  const [billingPortalConfigError, setBillingPortalConfigError] = useState<string | null>(null)

  const useHelcimJs = Boolean(ENV_JS_TOKEN)

  const suggestedPaymentAmount = useMemo(() => {
    const s = sumMonthlyBillingUsd(billingForPayments.billing_product_type, billingForPayments.billing_additional_products)
    return s > 0 ? s.toFixed(2) : ""
  }, [billingForPayments.billing_product_type, billingForPayments.billing_additional_products])

  const monthlyPlanTotal = useMemo(
    () => sumMonthlyBillingUsd(billingForPayments.billing_product_type, billingForPayments.billing_additional_products),
    [billingForPayments.billing_product_type, billingForPayments.billing_additional_products],
  )
  const hasBillingPlanSignals =
    monthlyPlanTotal > 0 ||
    Boolean(billingForPayments.billing_helcim_customer_code?.trim()) ||
    Boolean(billingForPayments.billing_payment_due_date?.trim())

  const formAction = useMemo(() => {
    const fromWindow = typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : ""
    const fromState = origin.replace(/\/+$/, "")
    const envOrigin = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)?.replace(/\/+$/, "").trim()
    /** Prefer the page you are actually on (custom domain, www, etc.) so the iframe return URL matches `postMessage` origin. */
    const base = fromWindow || fromState || envOrigin
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
      let portalFromEdge = ""
      if (!cancelled) setBillingPortalConfigError(null)
      if (!ENV_PORTAL.trim()) {
        let accessTok = (await supabase.auth.getSession()).data.session?.access_token
        if (!accessTok) {
          const r = await supabase.auth.refreshSession()
          accessTok = r.data.session?.access_token ?? undefined
        }
        const originBase = typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : ""

        /** Prefer same-origin Vercel route (reliable CORS); Edge second for mobile / no server env. */
        if (accessTok && originBase) {
          try {
            const r = await fetch(`${originBase}/api/billing-portal-config`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessTok}`, "Content-Type": "application/json" },
              body: "{}",
            })
            if (r.ok) {
              const j = (await r.json()) as { portalUrl?: string | null }
              if (typeof j.portalUrl === "string" && j.portalUrl.trim()) {
                portalFromEdge = j.portalUrl.trim()
              }
            } else if (!cancelled) {
              const errText = await r.text().catch(() => "")
              setBillingPortalConfigError(
                `Vercel /api/billing-portal-config HTTP ${r.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
              )
            }
          } catch (e) {
            if (!cancelled) {
              setBillingPortalConfigError(e instanceof Error ? e.message : "Vercel billing-portal-config fetch failed")
            }
          }
        }

        if (!portalFromEdge.trim() && accessTok) {
          const { data: cfg, error: cfgErr } = await supabase.functions.invoke("billing-portal-config", {
            body: {},
            headers: { Authorization: `Bearer ${accessTok}` },
          })
          let edgeBody: { error?: string; portalUrl?: string | null } | null =
            cfg && typeof cfg === "object" ? (cfg as { error?: string; portalUrl?: string | null }) : null
          if (cfgErr instanceof FunctionsHttpError) {
            try {
              edgeBody = { ...edgeBody, ...(await cfgErr.context.json()) }
            } catch {
              /* ignore */
            }
          }
          if (!cancelled && cfgErr) {
            const parts = [edgeBody?.error, cfgErr.message].filter(Boolean) as string[]
            setBillingPortalConfigError(parts.filter(Boolean).join(" — ") || "Could not reach billing-portal-config Edge function.")
          }
          if (!cancelled && edgeBody && typeof edgeBody.portalUrl === "string" && edgeBody.portalUrl.trim()) {
            portalFromEdge = edgeBody.portalUrl.trim()
            setBillingPortalConfigError(null)
          }
        }

        if (!cancelled && portalFromEdge.trim()) {
          setBillingPortalConfigError(null)
        } else if (!cancelled && !ENV_PORTAL.trim() && !portalFromEdge.trim()) {
          setBillingPortalConfigError(
            (prev) =>
              prev?.trim() ||
              "No hosted pay URL returned. Set HELCIM_PAYMENT_PORTAL_URL on Vercel (Environment Variables → Redeploy) or on Supabase Edge secrets, then reload.",
          )
        }
      }
      const { data, error } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (cancelled) return
      setLoading(false)
      if (error || !data) {
        setBillingForPayments({})
        setPortalBaseUrl(resolveHelcimPayPortalBaseUrl(ENV_PORTAL.trim() || portalFromEdge || null, null))
        setCustomerCode(null)
        return
      }
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      setBillingForPayments(billing)
      const envOrEdge = (ENV_PORTAL.trim() || portalFromEdge || "").trim() || null
      setPortalBaseUrl(resolveHelcimPayPortalBaseUrl(envOrEdge, billing.helcim_pay_portal_url ?? null))
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
          <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
            Pay securely with your card below. You&apos;ll see whether your payment was approved right on this page.
          </p>
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
              Card payments need a secure (https) connection. Use your normal production link in the browser when paying with a live card.
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
                      <>Reference: {lastResult.transactionId}</>
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
                    <input
                      type="text"
                      id="amount"
                      key={`amt-${profileUserId}-${suggestedPaymentAmount}`}
                      defaultValue={suggestedPaymentAmount || ""}
                      placeholder="0.00"
                      autoComplete="off"
                      style={inputStyle}
                    />
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
                    Use the same billing address your bank has on file for this card.
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

            </>
          )}
        </>
      ) : (
        <>
          <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
            Your secure payment window loads below when your organization has turned on online payments.
          </p>
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
              <strong>Payment portal URL is not valid.</strong> Ask your administrator to update the payment link under Admin → Billing
              &amp; Helcim (it must be a full <code style={{ color: "#fef3c7" }}>https://</code> address).
            </div>
          ) : hasBillingPlanSignals ? (
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
              <strong>Your billing plan is on file, but no valid Helcim hosted pay URL was found for this session.</strong>
              {billingPortalConfigError ? (
                <p style={{ margin: "10px 0 0", fontSize: 13, opacity: 0.95 }}>
                  Portal config request: {billingPortalConfigError}
                </p>
              ) : null}
              <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                <li style={{ marginBottom: 8 }}>
                  <strong>Fastest for this website (no app rebuild):</strong> in Vercel → Project → Environment Variables, set{" "}
                  <code style={{ color: "#fef3c7" }}>HELCIM_PAYMENT_PORTAL_URL</code> to your full hosted pay{" "}
                  <code style={{ color: "#fef3c7" }}>https://…</code> link (same value you use in Helcim), apply to Production, then{" "}
                  <strong>Redeploy</strong>. The Payments tab reads it via <code style={{ color: "#fef3c7" }}>/api/billing-portal-config</code>.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Mobile / no Vercel env:</strong> set the same secret name on Supabase → Edge Functions → Secrets, deploy{" "}
                  <code style={{ color: "#fef3c7" }}>billing-portal-config</code>, reload.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Or</strong> set <code style={{ color: "#fef3c7" }}>VITE_HELCIM_PAYMENT_PORTAL_URL</code> at build time and redeploy
                  the app / mobile shell.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Or</strong> add a per-user <strong>Pay portal URL override</strong> in Admin → Billing &amp; Helcim (saved on this
                  profile).
                </li>
                <li>
                  Optional embedded card form: set <code style={{ color: "#fef3c7" }}>VITE_HELCIM_JS_TOKEN</code> and keep the return URL
                  on the same origin as the app.
                </li>
              </ul>
              {monthlyPlanTotal > 0 ? (
                <p style={{ margin: "14px 0 0", fontWeight: 600 }}>
                  Catalog monthly total (before tax): {formatUsdMonthly(monthlyPlanTotal)}
                  {billingForPayments.billing_payment_due_date ? (
                    <> · Next due date on file: {billingForPayments.billing_payment_due_date}</>
                  ) : null}
                </p>
              ) : null}
              <p style={{ margin: "12px 0 0", fontSize: 13, opacity: 0.95 }}>
                Helcim charges that match your <strong>Helcim customer code</strong> should call the Supabase{" "}
                <code style={{ color: "#fef3c7" }}>billing-webhook</code> (see Admin → Billing copy) so <strong>Last paid</strong> updates
                automatically. Admin can also use <strong>Record payment received (now)</strong> for offline payments.
              </p>
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
              <strong>Online payments aren&apos;t set up for this app yet.</strong> Your administrator still needs to finish payment setup
              for this site (Helcim portal URL on the host + customer codes in Admin).
            </div>
          )}
        </>
      )}
    </div>
  )
}
