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
import {
  applyCustomerPaymentSettingsToProfileMetadata,
  parseCustomerPaymentMetadata,
} from "../../lib/customerPaymentMetadata"
import { platformToolsFetchOrigins, platformToolsJsonBody } from "../../lib/platformToolsJsonBody"
import {
  customerPaymentEventTypeLabel,
  customerPaymentMarkedDetail,
  fetchCustomerPaymentCollectionsHistory,
  formatCollectionsCalendarContext,
  formatCollectionsQuoteContext,
  formatUsdAmount,
  type CustomerPaymentCollectionsRow,
} from "../../lib/customerPaymentCollections"

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

const HELCIM_HOME = "https://www.helcim.com/"
const HELCIM_HELP_CENTER = "https://help.helcim.com/"

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

const textareaStyle: CSSProperties = {
  ...inputStyle,
  maxWidth: "100%",
  width: "100%",
  minHeight: 100,
  resize: "vertical" as const,
  fontFamily: "inherit",
}

const quickLinkCardBaseStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  textAlign: "left",
  minWidth: 220,
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  color: theme.text,
  cursor: "pointer",
}

const quickLinkCardAltActiveStyle: CSSProperties = {
  border: "1px solid #0ea5e9",
  background: "linear-gradient(160deg, #e0f2fe 0%, #f8fafc 75%)",
  boxShadow: "0 0 0 1px #bae6fd inset",
}

function formatProfilePaymentIso(iso: string | null | undefined): string {
  const s = typeof iso === "string" ? iso.trim() : ""
  if (!s) return "—"
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

type PaymentsHubTab = "tradesman" | "customer" | "history"

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
  /** Homeowner/GC-facing pay link — stored on `profiles.metadata`, not subscription Helcim checkout. */
  const [customerPayLinkDraft, setCustomerPayLinkDraft] = useState("")
  const [customerPayBarcodeLinkDraft, setCustomerPayBarcodeLinkDraft] = useState("")
  const [customerPayInstructionsDraft, setCustomerPayInstructionsDraft] = useState("")
  const [customerPayProvider, setCustomerPayProvider] = useState<"helcim" | "stripe" | "square" | "other">("helcim")
  const [customerPayProviderAccountLabel, setCustomerPayProviderAccountLabel] = useState("")
  const [customerPaySetupStatus, setCustomerPaySetupStatus] = useState<"not_started" | "onboarding" | "ready">("not_started")
  const [customerPaySendLinkEnabled, setCustomerPaySendLinkEnabled] = useState(true)
  const [customerPaySendBarcodeEnabled, setCustomerPaySendBarcodeEnabled] = useState(false)
  const [customerPayRequireReview, setCustomerPayRequireReview] = useState(true)
  const [customerPaySaving, setCustomerPaySaving] = useState(false)
  const [customerPayBanner, setCustomerPayBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [customerPayCopied, setCustomerPayCopied] = useState(false)
  const [paymentsHubTab, setPaymentsHubTab] = useState<PaymentsHubTab>("tradesman")
  const [collectionsBusy, setCollectionsBusy] = useState(false)
  const [collectionsRows, setCollectionsRows] = useState<CustomerPaymentCollectionsRow[]>([])
  const [collectionsError, setCollectionsError] = useState<string | null>(null)
  const [collectionsRefreshNonce, setCollectionsRefreshNonce] = useState(0)

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
      const sb = supabase
      if (!sb) return
      let portalFromEdge = ""
      if (!cancelled) setBillingPortalConfigError(null)
      if (!ENV_PORTAL.trim()) {
        let accessTok = (await sb.auth.getSession()).data.session?.access_token
        if (!accessTok) {
          const r = await sb.auth.refreshSession()
          accessTok = r.data.session?.access_token ?? undefined
        }

        /** Same-origin Vercel route and Supabase Edge often both work; race them and take the first valid URL. */
        if (accessTok) {
          const portalBody = platformToolsJsonBody({})
          const fetchFromHost = async (): Promise<string> => {
            const bases = platformToolsFetchOrigins()
            let lastDetail = ""
            for (const originBase of bases) {
              if (!originBase) continue
              try {
                const r = await fetch(`${originBase.replace(/\/+$/, "")}/api/billing-portal-config`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessTok}`, "Content-Type": "application/json" },
                  body: portalBody,
                })
                const raw = await r.text()
                if (r.ok && raw.trim()) {
                  try {
                    const j = JSON.parse(raw) as { portalUrl?: string | null; error?: string }
                    if (typeof j.portalUrl === "string" && j.portalUrl.trim()) return j.portalUrl.trim()
                    if (typeof j.error === "string" && j.error.trim()) lastDetail = j.error.trim()
                  } catch {
                    lastDetail = "Non-JSON response from billing-portal-config"
                  }
                } else {
                  lastDetail = raw.trim() ? raw.trim().slice(0, 200) : `HTTP ${r.status} (empty body)`
                }
              } catch (e) {
                lastDetail = e instanceof Error ? e.message : String(e)
              }
            }
            if (lastDetail && typeof window !== "undefined" && !import.meta.env.PROD) {
              console.warn("[billing-portal-config]", lastDetail)
            }
            return ""
          }
          const fetchFromEdge = async (): Promise<string> => {
            try {
              const { data: cfg, error: cfgErr } = await sb.functions.invoke("billing-portal-config", {
                body: {},
                headers: { Authorization: `Bearer ${accessTok}` },
              })
              let edgeBody: { error?: string; portalUrl?: string | null } | null =
                cfg && typeof cfg === "object" ? (cfg as { error?: string; portalUrl?: string | null }) : null
              if (cfgErr instanceof FunctionsHttpError) {
                try {
                  const errRaw = await cfgErr.context.text()
                  if (errRaw.trim()) {
                    const parsed = JSON.parse(errRaw) as Record<string, unknown>
                    edgeBody = { ...edgeBody, ...parsed }
                  }
                } catch {
                  /* ignore */
                }
              }
              if (edgeBody && typeof edgeBody.portalUrl === "string" && edgeBody.portalUrl.trim()) {
                return edgeBody.portalUrl.trim()
              }
            } catch {
              /* ignore — host may have succeeded */
            }
            return ""
          }
          const [fromHost, fromEdge] = await Promise.all([fetchFromHost(), fetchFromEdge()])
          portalFromEdge = (fromHost || fromEdge).trim()
          if (!cancelled && portalFromEdge) {
            setBillingPortalConfigError(null)
          } else if (!cancelled && !portalFromEdge) {
            setBillingPortalConfigError(
              "Could not load the payment portal link. Try refreshing. If it only fails on the live site: in Vercel set HELCIM_PAYMENT_PORTAL_URL (or VITE_HELCIM_PAYMENT_PORTAL_URL) and redeploy; Supabase URL/anon can come from server env or the app request body.",
            )
          }
        } else if (!cancelled) {
          setBillingPortalConfigError("Sign in again to load the payment portal.")
        }
      }
      const { data, error } = await sb.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (cancelled) return
      setLoading(false)
      if (error || !data) {
        setBillingForPayments({})
        setPortalBaseUrl(resolveHelcimPayPortalBaseUrl(ENV_PORTAL.trim() || portalFromEdge || null, null))
        setCustomerCode(null)
        setCustomerPayLinkDraft("")
        setCustomerPayBarcodeLinkDraft("")
        setCustomerPayInstructionsDraft("")
        setCustomerPayProvider("helcim")
        setCustomerPayProviderAccountLabel("")
        setCustomerPaySetupStatus("not_started")
        setCustomerPaySendLinkEnabled(true)
        setCustomerPaySendBarcodeEnabled(false)
        setCustomerPayRequireReview(true)
        return
      }
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      setBillingForPayments(billing)
      const cp = parseCustomerPaymentMetadata(meta)
      setCustomerPayLinkDraft(cp.customer_pay_link_url ?? "")
      setCustomerPayBarcodeLinkDraft(cp.customer_pay_barcode_url ?? "")
      setCustomerPayInstructionsDraft(cp.customer_pay_instructions ?? "")
      setCustomerPayProvider(cp.customer_pay_provider ?? "helcim")
      setCustomerPayProviderAccountLabel(cp.customer_pay_provider_account_label ?? "")
      setCustomerPaySetupStatus(cp.customer_pay_setup_status ?? "not_started")
      setCustomerPaySendLinkEnabled(cp.customer_pay_send_link_enabled !== false)
      setCustomerPaySendBarcodeEnabled(cp.customer_pay_send_barcode_enabled === true)
      setCustomerPayRequireReview(cp.customer_pay_require_review_before_send !== false)
      const envOrEdge = (ENV_PORTAL.trim() || portalFromEdge || "").trim() || null
      setPortalBaseUrl(resolveHelcimPayPortalBaseUrl(envOrEdge, billing.helcim_pay_portal_url ?? null))
      setCustomerCode(billing.billing_helcim_customer_code?.trim() || null)
    })()
    return () => {
      cancelled = true
    }
  }, [profileUserId])

  useEffect(() => {
    if (paymentsHubTab !== "history" || !profileUserId || !supabase) return
    let cancelled = false
    setCollectionsBusy(true)
    setCollectionsError(null)
    void (async () => {
      const res = await fetchCustomerPaymentCollectionsHistory({
        supabase,
        userId: profileUserId,
        limit: 100,
      })
      if (cancelled) return
      setCollectionsBusy(false)
      if (res.error) setCollectionsError(res.error)
      setCollectionsRows(res.rows)
    })()
    return () => {
      cancelled = true
    }
  }, [paymentsHubTab, profileUserId, collectionsRefreshNonce])

  useEffect(() => {
    const scrollToCustomerPay = () => {
      try {
        if (window.location.hash.replace(/^#/, "") !== "customer-pay") return
      } catch {
        return
      }
      setPaymentsHubTab("customer")
      window.setTimeout(() => {
        document.getElementById("customer-pay-collection")?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 320)
    }
    scrollToCustomerPay()
    const tid = window.setTimeout(scrollToCustomerPay, 600)
    return () => window.clearTimeout(tid)
  }, [])

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

  async function persistCustomerPayments() {
    if (!supabase || !profileUserId) return
    setCustomerPaySaving(true)
    setCustomerPayBanner(null)
    try {
      const { data: row, error: fe } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (fe) throw fe
      const prevMeta =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      const applied = applyCustomerPaymentSettingsToProfileMetadata(prevMeta, {
        provider: customerPayProvider,
        providerAccountLabel: customerPayProviderAccountLabel,
        setupStatus: customerPaySetupStatus,
        linkUrlRaw: customerPayLinkDraft,
        barcodeUrlRaw: customerPayBarcodeLinkDraft,
        sendLinkEnabled: customerPaySendLinkEnabled,
        sendBarcodeEnabled: customerPaySendBarcodeEnabled,
        requireReviewBeforeSend: customerPayRequireReview,
        instructionsRaw: customerPayInstructionsDraft,
      })
      if (applied.error) {
        setCustomerPayBanner({ kind: "err", text: applied.error })
        return
      }
      const { error: ue } = await supabase.from("profiles").update({ metadata: applied.metadata }).eq("id", profileUserId)
      if (ue) throw ue
      const reread = parseCustomerPaymentMetadata(applied.metadata)
      setCustomerPayLinkDraft(reread.customer_pay_link_url ?? "")
      setCustomerPayBarcodeLinkDraft(reread.customer_pay_barcode_url ?? "")
      setCustomerPayInstructionsDraft(reread.customer_pay_instructions ?? "")
      setCustomerPayProvider(reread.customer_pay_provider ?? "helcim")
      setCustomerPayProviderAccountLabel(reread.customer_pay_provider_account_label ?? "")
      setCustomerPaySetupStatus(reread.customer_pay_setup_status ?? "not_started")
      setCustomerPaySendLinkEnabled(reread.customer_pay_send_link_enabled !== false)
      setCustomerPaySendBarcodeEnabled(reread.customer_pay_send_barcode_enabled === true)
      setCustomerPayRequireReview(reread.customer_pay_require_review_before_send !== false)
      setCustomerPayBanner({ kind: "ok", text: "Saved customer-payment setup, share methods, and notes." })
    } catch {
      setCustomerPayBanner({
        kind: "err",
        text: "Could not save customer payment preferences. Refresh and try again, or contact support.",
      })
    } finally {
      setCustomerPaySaving(false)
    }
  }

  function copyCustomerPayLink() {
    const normalized = normalizeHelcimPayPortalUrl(customerPayLinkDraft)
    if (!normalized || typeof navigator.clipboard?.writeText !== "function") return
    void navigator.clipboard.writeText(normalized).then(() => {
      setCustomerPayCopied(true)
      window.setTimeout(() => setCustomerPayCopied(false), 2400)
    })
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: theme.text, marginBottom: 8 }}>Payments</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setPaymentsHubTab("tradesman")}
          style={{
            ...quickLinkCardBaseStyle,
            ...(paymentsHubTab === "tradesman" ? quickLinkCardAltActiveStyle : {}),
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>Manage Payments to Tradesman</span>
          <span style={{ fontWeight: 500, fontSize: 12, color: "#475569" }}>Pay your Tradesman subscription</span>
        </button>
        <button
          type="button"
          onClick={() => setPaymentsHubTab("customer")}
          style={{
            ...quickLinkCardBaseStyle,
            ...(paymentsHubTab === "customer" ? quickLinkCardAltActiveStyle : {}),
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>Send Payment Information to Customer</span>
          <span style={{ fontWeight: 500, fontSize: 12, color: "#475569" }}>Save links and share settings</span>
        </button>
        <button
          type="button"
          onClick={() => setPaymentsHubTab("history")}
          style={{
            ...quickLinkCardBaseStyle,
            ...(paymentsHubTab === "history" ? quickLinkCardAltActiveStyle : {}),
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>View Previous Payments</span>
          <span style={{ fontWeight: 500, fontSize: 12, color: "#475569" }}>Review billing history and signals</span>
        </button>
      </div>

      {paymentsHubTab !== "customer" ? (
        <p style={{ color: "#475569", margin: "0 0 18px", lineHeight: 1.55, fontSize: 14 }}>
          {paymentsHubTab === "tradesman" ? (
            <>
              <strong style={{ color: theme.text }}>Tradesman subscription billing</strong> — your office pays Tradesman through the processor
              below; separate from homeowner payments.
            </>
          ) : (
            <>
              <strong style={{ color: theme.text }}>Payment history &amp; signals</strong> — your Tradesman subscription metadata, homeowner
              payment activity you logged in-app, plus this browser &apos;s latest embedded checkout attempt.
            </>
          )}
        </p>
      ) : null}

      {paymentsHubTab === "customer" ? (
      <section
        id="customer-pay-collection"
        style={{
          marginBottom: 28,
          padding: 22,
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 10,
            border: "1px solid #bae6fd",
            background: "linear-gradient(160deg, #ecfeff 0%, #ffffff 70%)",
            color: theme.text,
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>Helcim hosted pay (quick setup)</h3>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
            Tradesman never stores your merchant API keys in the browser — you paste only the <strong>hosted pay / customer link</strong> you
            configure in your processor. Subscription billing to Tradesman is separate from homeowner payments.
          </p>
          <ol style={{ margin: "0 0 12px", paddingLeft: 22, fontSize: 13, color: theme.text, lineHeight: 1.6 }}>
            <li>Open or create a merchant account with Helcim ({HELCIM_HOME}).</li>
            <li>
              Configure a <strong>hosted payment page</strong> or shareable pay link in Helcim (exact menu names vary — use their{" "}
              <a href={HELCIM_HELP_CENTER} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontWeight: 700 }}>
                Help Center
              </a>
              ).
            </li>
            <li>Copy the HTTPS link Helcim gives you and paste it into <strong>Customer pay link</strong> below.</li>
            <li>
              Optionally add a barcode/QR landing URL if Helcim exposes one separately, then toggle share options and save settings.
            </li>
          </ol>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a
              href={HELCIM_HOME}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                background: "#0ea5e9",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Helcim — open signup
            </a>
            <a
              href={HELCIM_HELP_CENTER}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Helcim Help Center
            </a>
          </div>
        </div>

        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: theme.text,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>
              Processor
              <select
                value={customerPayProvider}
                onChange={(e) => setCustomerPayProvider(e.target.value as "helcim" | "stripe" | "square" | "other")}
                style={{ ...inputStyle, maxWidth: 200, fontSize: 14 }}
              >
                <option value="helcim">Helcim</option>
                <option value="stripe">Stripe</option>
                <option value="square">Square</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>
              Setup status
              <select
                value={customerPaySetupStatus}
                onChange={(e) => setCustomerPaySetupStatus(e.target.value as "not_started" | "onboarding" | "ready")}
                style={{ ...inputStyle, maxWidth: 200, fontSize: 14 }}
              >
                <option value="not_started">Not started</option>
                <option value="onboarding">Onboarding</option>
                <option value="ready">Ready</option>
              </select>
            </label>
          </div>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Merchant account label (team reference)
            <input
              type="text"
              value={customerPayProviderAccountLabel}
              onChange={(e) => setCustomerPayProviderAccountLabel(e.target.value)}
              placeholder="Example: Helcim Main Merchant - Tradesman Roofing"
              style={{ ...inputStyle, maxWidth: "100%" }}
            />
          </label>
        </div>
        {customerPayBanner ? (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${customerPayBanner.kind === "ok" ? "#047857" : "#b91c1c"}`,
              background: customerPayBanner.kind === "ok" ? "#064e3b" : "#450a0a",
              color: customerPayBanner.kind === "ok" ? "#d1fae5" : "#fecaca",
              fontSize: 14,
            }}
          >
            {customerPayBanner.text}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 14, maxWidth: 620 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Customer pay link
              <input
                type="url"
                value={customerPayLinkDraft}
                onChange={(e) => setCustomerPayLinkDraft(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
                style={{ ...inputStyle, maxWidth: "100%" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Optional barcode / QR destination link
              <input
                type="url"
                value={customerPayBarcodeLinkDraft}
                onChange={(e) => setCustomerPayBarcodeLinkDraft(e.target.value)}
                placeholder="https://... (optional)"
                autoComplete="off"
                style={{ ...inputStyle, maxWidth: "100%" }}
              />
            </label>
          </div>
          <div
            style={{
              padding: "12px 0 0",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={customerPaySendLinkEnabled}
                onChange={(e) => setCustomerPaySendLinkEnabled(e.target.checked)}
              />
              Allow sending link
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={customerPaySendBarcodeEnabled}
                onChange={(e) => setCustomerPaySendBarcodeEnabled(e.target.checked)}
              />
              Allow sending barcode / QR
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={customerPayRequireReview}
                onChange={(e) => setCustomerPayRequireReview(e.target.checked)}
              />
              Require estimate/receipt review before share
            </label>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Short instructions (deposit terms, ACH reminder, surcharge policy…)
              <textarea
                value={customerPayInstructionsDraft}
                onChange={(e) => setCustomerPayInstructionsDraft(e.target.value)}
                placeholder="Example: Deposits are 50%. Pay at the link below. Include your job ID in checkout notes."
                style={textareaStyle}
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                disabled={customerPaySaving || !profileUserId}
                onClick={() => void persistCustomerPayments()}
                style={{
                  padding: "11px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: customerPaySaving || !profileUserId ? "#4b5563" : theme.primary,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: customerPaySaving || !profileUserId ? "not-allowed" : "pointer",
                }}
              >
                {customerPaySaving ? "Saving…" : "Save customer-pay settings"}
              </button>
              <button
                type="button"
                disabled={!normalizeHelcimPayPortalUrl(customerPayLinkDraft)}
                onClick={copyCustomerPayLink}
                style={{
                  padding: "11px 16px",
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: normalizeHelcimPayPortalUrl(customerPayLinkDraft) ? "pointer" : "not-allowed",
                }}
              >
                {customerPayCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {paymentsHubTab === "tradesman" ? (
      <>
      <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#94a3b8", letterSpacing: 0.03, margin: "0 0 14px", textTransform: "uppercase" }}>
        Subscription &amp; Tradesman billing
      </h2>

      {useHelcimJs ? (
        <>
          <p style={{ color: theme.text, marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
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
          <p style={{ color: theme.text, marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
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
              <strong>Your billing plan is on file, but we couldn&apos;t open the payment portal this session.</strong>
              {billingPortalConfigError ? (
                <p style={{ margin: "10px 0 0", fontSize: 13, opacity: 0.95 }}>
                  {billingPortalConfigError}
                </p>
              ) : null}
              <p style={{ margin: "12px 0 0", fontSize: 13, opacity: 0.95, lineHeight: 1.5 }}>
                Try refreshing the page. Your administrator can confirm the pay link under <strong>Admin → Billing &amp; Helcim</strong>, or
                set a <strong>Pay portal URL</strong> on your profile there if your office uses a custom link.
              </p>
              {monthlyPlanTotal > 0 ? (
                <p style={{ margin: "14px 0 0", fontWeight: 600 }}>
                  Catalog monthly total (before tax): {formatUsdMonthly(monthlyPlanTotal)}
                  {billingForPayments.billing_payment_due_date ? (
                    <> · Next due date on file: {billingForPayments.billing_payment_due_date}</>
                  ) : null}
                </p>
              ) : null}
              <p style={{ margin: "12px 0 0", fontSize: 13, opacity: 0.95 }}>
                When your <strong>Helcim customer code</strong> is on file, matching charges can update <strong>Last paid</strong>{" "}
                automatically. Your administrator can also record cash or check payments from Admin → Billing.
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
      </>
      ) : null}

      {paymentsHubTab === "history" ? (
        <>
          <section
            style={{
              padding: 22,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1.1rem", fontWeight: 800, color: theme.text }}>
              Previous payments (subscription)
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
              This page reflects metadata we store on your profile. Use Admin → Billing &amp; Helcim and your processor &apos;s dashboard for a
              full statement.
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: theme.text, lineHeight: 1.65 }}>
              <li>
                <strong>Last successful sync</strong> (Tradesman billing): {formatProfilePaymentIso(billingForPayments.billing_last_success_at)}
              </li>
              <li>
                <strong>Next due date on file</strong>: {billingForPayments.billing_payment_due_date?.trim() || "—"}
              </li>
              <li>
                <strong>Catalog monthly total</strong> (before tax):{" "}
                {monthlyPlanTotal > 0 ? formatUsdMonthly(monthlyPlanTotal) : "—"}
              </li>
              <li>
                <strong>Helcim customer code</strong>: {customerCode?.trim() || "—"}
              </li>
            </ul>
            {lastResult ? (
              <div
                style={{
                  marginTop: 18,
                  padding: 14,
                  borderRadius: 10,
                  border: `1px solid ${lastResult.response === 1 ? "#047857" : "#b91c1c"}`,
                  background: lastResult.response === 1 ? "#ecfdf5" : "#fef2f2",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ display: "block", marginBottom: 6 }}>Latest attempt this session (embedded checkout)</strong>
                <span>{lastResult.response === 1 ? "Approved" : "Not approved"}</span>
                {lastResult.responseMessage ? ` — ${lastResult.responseMessage}` : ""}
                {lastResult.transactionId ? (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    Reference: {lastResult.transactionId}
                    {lastResult.amount ? (
                      <>
                        {" "}
                        · Amount: {lastResult.amount} {lastResult.currency || ""}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p style={{ margin: "16px 0 0", fontSize: 13, color: "#64748b" }}>
                Pay from the <strong>Manage Payments to Tradesman</strong> tab to see a live result here after you submit a card in this
                browser.
              </p>
            )}
          </section>

          <section
            style={{
              marginTop: 22,
              padding: 22,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: theme.text }}>
                Customer collections activity
              </h2>
              <button
                type="button"
                disabled={collectionsBusy || !profileUserId}
                onClick={() => setCollectionsRefreshNonce((n) => n + 1)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  color: theme.text,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: collectionsBusy || !profileUserId ? "not-allowed" : "pointer",
                }}
              >
                {collectionsBusy ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
              Logged when you <strong>Copy payment request</strong> from an estimate, job, or customer card — and when you mark an estimate Paid
              or waived. Use your processor dashboard for authoritative settlement reporting.
            </p>
            {collectionsBusy ? (
              <p style={{ fontSize: 14, color: "#64748b" }}>Loading activity…</p>
            ) : collectionsError ? (
              <p style={{ fontSize: 14, color: "#b91c1c" }}>{collectionsError}</p>
            ) : collectionsRows.length === 0 ? (
              <p style={{ fontSize: 14, color: "#64748b" }}>
                No customer payment activity yet — or the activity table hasn&apos;t been created in Supabase (<code style={{ fontSize: 13 }}>customer_payment_events</code>
                ).
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", minWidth: 520 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: `2px solid ${theme.border}`, color: "#64748b" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>When</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Activity</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Amount</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Customer</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectionsRows.map((r) => {
                      let ageNote: string | null = null
                      if (r.event_type === "payment_link_sent" || r.event_type === "payment_barcode_sent") {
                        const sent = Date.parse(r.created_at)
                        if (Number.isFinite(sent)) {
                          const days = Math.floor((Date.now() - sent) / 86_400_000)
                          if (days >= 30) ageNote = `Open ${days} days — follow up`
                          else if (days >= 7) ageNote = `Open ${days} days`
                        }
                      }
                      const marked = customerPaymentMarkedDetail(r.metadata)
                      const qCtx = formatCollectionsQuoteContext(r)
                      const cCtx = formatCollectionsCalendarContext(r)
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid #e2e8f0` }}>
                          <td style={{ padding: "6px 8px", verticalAlign: "top", whiteSpace: "nowrap", color: "#475569" }}>
                            {formatProfilePaymentIso(r.created_at)}
                          </td>
                          <td style={{ padding: "6px 8px", verticalAlign: "top", color: theme.text }}>
                            <span style={{ fontWeight: 600 }}>{customerPaymentEventTypeLabel(r.event_type)}</span>
                            {marked ? (
                              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{marked}</span>
                            ) : null}
                            {ageNote ? (
                              <span style={{ display: "block", fontSize: 11, color: "#b45309", fontWeight: 600, marginTop: marked ? 4 : 2 }}>
                                {ageNote}
                              </span>
                            ) : null}
                          </td>
                          <td style={{ padding: "6px 8px", verticalAlign: "top", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                            {formatUsdAmount(r.amount)}
                          </td>
                          <td style={{ padding: "6px 8px", verticalAlign: "top", maxWidth: 140 }}>{r.customer_name?.trim() || "—"}</td>
                          <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                            {qCtx || cCtx ? (
                              <>
                                {qCtx ? <span style={{ color: theme.text }}>{qCtx}</span> : null}
                                {qCtx && cCtx ? <span style={{ display: "block", marginTop: 4 }}>{cCtx}</span> : null}
                                {!qCtx && cCtx ? <span style={{ color: theme.text }}>{cCtx}</span> : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
