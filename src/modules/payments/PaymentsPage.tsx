import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import {
  clampBillingCoverMonths,
  mergeBillingIntoProfileMetadata,
  parseBillingMetadata,
  subscriptionBillAmountUsd,
  type BillingProfileMetadata,
} from "../../lib/billingProfileMetadata"
import { formatUsdMonthly, sumMonthlyBillingUsd } from "../../lib/billingProductTypes"
import {
  AD_CAMPAIGN_FEE_DISCLOSURE,
  AD_CAMPAIGN_SPEND_DISCLAIMER,
  AD_PAYMENT_LOAD_STORAGE_KEY,
  adBalanceDueCents,
  formatUsdFromCents,
  parseAdBillingMetadata,
  type AdCampaignPaymentRow,
  type AdCampaignRow,
} from "../../lib/adCampaigns"
import { nextHelcimJsOrderNumber } from "../../lib/helcimJsOrderNumber"
import {
  customerPaymentEventTypeLabel,
  customerPaymentMarkedDetail,
  fetchCustomerPaymentCollectionsHistory,
  formatCollectionsCalendarContext,
  formatCollectionsQuoteContext,
  formatUsdAmount,
  type CustomerPaymentCollectionsRow,
} from "../../lib/customerPaymentCollections"
import PaymentRequestsWorkspace from "./PaymentRequestsWorkspace"
import { isIosNativeApp } from "../../lib/publicSite"

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

type PaymentsHubTab = "subscription" | "collect" | "history"

export default function PaymentsPage() {
  const profileUserId = useScopedUserId()
  const [billingForPayments, setBillingForPayments] = useState<BillingProfileMetadata>({})
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([])
  const [adBalanceFromMetaCents, setAdBalanceFromMetaCents] = useState(0)
  /** Set when `billing-portal-config` fails (deploy, secret, or network) so we can explain beyond “missing Vite env”. */
  const iosWebBilling = isIosNativeApp()
  const [paymentsHubTab, setPaymentsHubTab] = useState<PaymentsHubTab>(iosWebBilling ? "collect" : "subscription")
  const [collectionsBusy, setCollectionsBusy] = useState(false)
  const [collectionsRows, setCollectionsRows] = useState<CustomerPaymentCollectionsRow[]>([])
  const [collectionsError, setCollectionsError] = useState<string | null>(null)
  const [billingRefreshNonce, setBillingRefreshNonce] = useState(0)
  const [collectionsRefreshNonce, setCollectionsRefreshNonce] = useState(0)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMode, setPaymentMode] = useState<"suggested" | "advertising" | "custom">("suggested")
  const [paymentCampaignIds, setPaymentCampaignIds] = useState<string[]>([])
  const [adPaymentHistory, setAdPaymentHistory] = useState<AdCampaignPaymentRow[]>([])
  const [enrollAutopay, setEnrollAutopay] = useState(false)
  const [autopayBusy, setAutopayBusy] = useState(false)
  const [coverMonths, setCoverMonths] = useState(1)
  const [stripePayBusy, setStripePayBusy] = useState(false)
  const [stripePayError, setStripePayError] = useState("")
  const [stripeNotice, setStripeNotice] = useState("")
  const enrollAutopayRef = useRef(false)
  const coverMonthsRef = useRef(1)
  const paymentModeRef = useRef(paymentMode)
  const checkoutRef = useRef<HTMLDivElement | null>(null)
  const orderKind = paymentMode === "advertising" ? "TMAD" : "TM"

  useEffect(() => {
    enrollAutopayRef.current = enrollAutopay
  }, [enrollAutopay])

  useEffect(() => {
    coverMonthsRef.current = coverMonths
    paymentModeRef.current = paymentMode
  }, [coverMonths, paymentMode])

  async function saveAutopayPreference(enabled: boolean) {
    if (!supabase || !profileUserId) return
    setAutopayBusy(true)
    try {
      const { data: row, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (fetchErr) throw fetchErr
      const prev =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      const nextMeta = mergeBillingIntoProfileMetadata(prev, {
        billing_autopay_enabled: enabled,
        ...(enabled && !parseBillingMetadata(prev).billing_autopay_enrolled_at
          ? { billing_autopay_enrolled_at: new Date().toISOString() }
          : {}),
        ...(enabled ? { billing_autopay_last_error: "" } : {}),
      })
      const { error: upErr } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", profileUserId)
      if (upErr) throw upErr
      setEnrollAutopay(enabled)
      setBillingRefreshNonce((n) => n + 1)
    } catch (e) {
      console.warn("[autopay] could not save preference", e instanceof Error ? e.message : e)
    } finally {
      setAutopayBusy(false)
    }
  }

  async function saveCheckoutCover(orderNumber: string, months: number, expectedUsd: number) {
    if (!supabase || !profileUserId) return
    const { data: row, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    if (fetchErr) throw fetchErr
    const prev =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    if (months <= 1) {
      delete prev.billing_checkout_cover_months
      delete prev.billing_checkout_cover_order
      delete prev.billing_checkout_cover_expected_usd
    } else {
      prev.billing_checkout_cover_months = months
      prev.billing_checkout_cover_order = orderNumber
      prev.billing_checkout_cover_expected_usd = expectedUsd
    }
    const { error } = await supabase.from("profiles").update({ metadata: prev }).eq("id", profileUserId)
    if (error) throw error
  }

  async function startStripeCheckout() {
    if (!supabase) return
    const amountUsd = Number.parseFloat(paymentAmount)
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setStripePayError("Enter a payment amount greater than zero.")
      return
    }
    setStripePayBusy(true)
    setStripePayError("")
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("Sign in again to pay.")
      const billSubscription = paymentModeRef.current !== "advertising"
      const months =
        billSubscription && monthlyBillUsd > 0 ? clampBillingCoverMonths(coverMonthsRef.current) : 1
      const order = nextHelcimJsOrderNumber(orderKind, profileUserId)
      await saveCheckoutCover(order, months, amountUsd).catch((e) => console.warn("[billing] pay-ahead", e))
      const response = await fetch("/api/stripe-billing-checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd,
          coverMonths: months,
          billSubscription,
          autopay: enrollAutopayRef.current,
          campaignIds: paymentCampaignIds,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(payload.error || "Could not start Stripe checkout.")
      window.location.href = payload.url
    } catch (e) {
      setStripePayError(e instanceof Error ? e.message : "Could not start Stripe checkout.")
      setStripePayBusy(false)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const hash = window.location.hash
    if (!hash.includes("stripe=success") && !hash.includes("stripe=cancel")) return
    if (hash.includes("stripe=success")) {
      setStripePayError("")
      setStripeNotice("Stripe confirmed the return. Your due date updates as soon as the payment is recorded.")
      setBillingRefreshNonce((n) => n + 1)
    }
    if (hash.includes("stripe=cancel")) setStripePayError("Stripe checkout was canceled. No charge was made.")
  }, [])

  const adBalanceFromCampaignsCents = useMemo(
    () => adCampaigns.reduce((sum, c) => sum + adBalanceDueCents(c), 0),
    [adCampaigns],
  )
  const adBalanceDueCentsTotal = Math.max(adBalanceFromCampaignsCents, adBalanceFromMetaCents)

  const monthlyBillUsd = useMemo(
    () => subscriptionBillAmountUsd(billingForPayments),
    [billingForPayments],
  )

  const suggestedPaymentAmount = useMemo(() => {
    const months = paymentMode === "suggested" ? clampBillingCoverMonths(coverMonths) : 1
    const plan = monthlyBillUsd * (monthlyBillUsd > 0 ? months : 1)
    const ads = adBalanceDueCentsTotal / 100
    const total = plan + ads
    return total > 0 ? total.toFixed(2) : ""
  }, [paymentMode, coverMonths, monthlyBillUsd, adBalanceDueCentsTotal])

  const openAdCampaigns = useMemo(
    () => adCampaigns.filter((c) => adBalanceDueCents(c) > 0),
    [adCampaigns],
  )

  const monthlyPlanTotal = useMemo(
    () => sumMonthlyBillingUsd(billingForPayments.billing_product_type, billingForPayments.billing_additional_products),
    [billingForPayments.billing_product_type, billingForPayments.billing_additional_products],
  )
  useEffect(() => {
    if (iosWebBilling && paymentsHubTab === "subscription") setPaymentsHubTab("collect")
  }, [iosWebBilling, paymentsHubTab])

  useEffect(() => {
    if (paymentMode === "suggested") setPaymentAmount(suggestedPaymentAmount)
  }, [paymentMode, suggestedPaymentAmount])

  useEffect(() => {
    if (paymentMode !== "suggested") return
    if (adBalanceDueCentsTotal <= 0) {
      setPaymentCampaignIds([])
      return
    }
    setPaymentCampaignIds(openAdCampaigns.map((c) => c.id))
  }, [paymentMode, adBalanceDueCentsTotal, openAdCampaigns])

  const loadAdvertisingIntoCheckout = (campaign?: AdCampaignRow) => {
    const dueCents = campaign ? adBalanceDueCents(campaign) : adBalanceDueCentsTotal
    if (dueCents <= 0) return
    const ids = campaign
      ? [campaign.id]
      : adCampaigns.filter((row) => adBalanceDueCents(row) > 0).map((row) => row.id)
    setPaymentAmount((dueCents / 100).toFixed(2))
    setPaymentCampaignIds(ids)
    setPaymentMode("advertising")
    if (iosWebBilling) return
    setPaymentsHubTab("subscription")
    window.requestAnimationFrame(() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  useEffect(() => {
    if (adBalanceDueCentsTotal <= 0) return
    let shouldLoad = false
    try {
      shouldLoad = sessionStorage.getItem(AD_PAYMENT_LOAD_STORAGE_KEY) === "1"
      if (shouldLoad) sessionStorage.removeItem(AD_PAYMENT_LOAD_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    if (shouldLoad) loadAdvertisingIntoCheckout()
    // This is a one-shot navigation intent; campaign rows and balance are the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adBalanceDueCentsTotal])

  useEffect(() => {
    if (!supabase || !profileUserId) return
    let cancelled = false
    void (async () => {
      const sb = supabase
      if (!sb) return
      const { data, error } = await sb.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setBillingForPayments({})
        return
      }
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      setBillingForPayments(billing)
      setEnrollAutopay(billing.billing_autopay_enabled === true)
      const adMeta = parseAdBillingMetadata(meta)
      setAdBalanceFromMetaCents(adMeta?.balance_due_cents ?? 0)

      const [campaignResult, paymentResult] = await Promise.all([
        sb.from("ad_campaigns").select("*").eq("profile_id", profileUserId).order("updated_at", { ascending: false }),
        sb
          .from("ad_campaign_payments")
          .select("*")
          .eq("profile_id", profileUserId)
          .order("created_at", { ascending: false })
          .limit(100),
      ])
      if (!cancelled) {
        setAdCampaigns((campaignResult.data ?? []) as AdCampaignRow[])
        setAdPaymentHistory((paymentResult.data ?? []) as AdCampaignPaymentRow[])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileUserId, billingRefreshNonce])

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
      setPaymentsHubTab("collect")
      window.setTimeout(() => {
        document.getElementById("payment-provider-settings")?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 320)
    }
    scrollToCustomerPay()
    const tid = window.setTimeout(scrollToCustomerPay, 600)
    return () => window.clearTimeout(tid)
  }, [])

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: theme.text, marginBottom: 8 }}>Payments</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {iosWebBilling ? null : (
        <button
          type="button"
          onClick={() => setPaymentsHubTab("subscription")}
          style={{
            ...quickLinkCardBaseStyle,
            ...(paymentsHubTab === "subscription" ? quickLinkCardAltActiveStyle : {}),
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>Your Tradesman subscription</span>
          <span style={{ fontWeight: 500, fontSize: 12, color: "#475569" }}>Pay your office&apos;s Tradesman bill</span>
        </button>
        )}
        <button
          type="button"
          onClick={() => setPaymentsHubTab("collect")}
          style={{
            ...quickLinkCardBaseStyle,
            ...(paymentsHubTab === "collect" ? quickLinkCardAltActiveStyle : {}),
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>Collect from customers</span>
          <span style={{ fontWeight: 500, fontSize: 12, color: "#475569" }}>Payment requests · SMS & email</span>
        </button>
        <button
          type="button"
          onClick={() => setPaymentsHubTab("history")}
          style={{
            ...quickLinkCardBaseStyle,
            ...(paymentsHubTab === "history" ? quickLinkCardAltActiveStyle : {}),
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>Payment history</span>
          <span style={{ fontWeight: 500, fontSize: 12, color: "#475569" }}>
            {iosWebBilling ? "Customer activity" : "Subscription & customer activity"}
          </span>
        </button>
      </div>

      {paymentsHubTab === "collect" || paymentsHubTab === "history" ? (
        <p style={{ color: "#475569", margin: "0 0 18px", lineHeight: 1.55, fontSize: 14 }}>
          {paymentsHubTab === "collect" ? (
            <>
              <strong style={{ color: theme.text }}>Customer collections</strong> — send hosted payment links to homeowners and GCs. Configure your processor under Provider settings in this tab.
            </>
          ) : (
            <>
              <strong style={{ color: theme.text }}>History</strong> —{" "}
              {iosWebBilling
                ? "customer payment activity logged in Tradesman."
                : "your subscription billing signals plus customer payment activity logged in Tradesman."}
            </>
          )}
        </p>
      ) : null}

      {paymentsHubTab === "subscription" && !iosWebBilling ? (
      <>
      <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#94a3b8", letterSpacing: 0.03, margin: "0 0 14px", textTransform: "uppercase" }}>
        Subscription &amp; Tradesman billing
      </h2>

      {billingForPayments.billing_payment_due_date?.trim() ? (
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
          <strong>Payment due:</strong> {billingForPayments.billing_payment_due_date}
          {typeof billingForPayments.billing_custom_charge_usd === "number" ? (
            <>
              {" "}
              · <strong>Amount on file:</strong> ${billingForPayments.billing_custom_charge_usd.toFixed(2)}
            </>
          ) : monthlyPlanTotal > 0 ? (
            <>
              {" "}
              · <strong>Monthly plan:</strong> {formatUsdMonthly(monthlyPlanTotal)}
            </>
          ) : null}
        </p>
      ) : null}

      {iosWebBilling ? (
        <div
          style={{
            margin: "0 0 16px",
            padding: "14px 16px",
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: "#f8fafc",
          }}
        >
          <strong style={{ display: "block", fontSize: 14, color: theme.text }}>Pay your Tradesman bill on the website</strong>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
            Tradesman is billed to the contracting business that owns this workspace. Subscription payment is not
            collected in the App Store app and is not offered to consumers or families here.
          </p>
        </div>
      ) : null}

      <div ref={checkoutRef} style={{ padding: 16, borderRadius: 12, border: "1px solid #1d4ed8", background: "#f8fafc", display: "grid", gap: 10 }}>
        <strong style={{ fontSize: 15, color: theme.text }}>Pay with Stripe</strong>
        <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          Tradesman subscription and advertising charges are collected by Stripe. Autopay still charges one month on the due date after a card is saved.
        </p>
        {paymentMode === "suggested" && monthlyBillUsd > 0 ? (
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: theme.text }}>
            Months to pay
            <select
              value={coverMonths}
              onChange={(e) => setCoverMonths(clampBillingCoverMonths(e.target.value))}
              style={{ maxWidth: 220, padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }}
            >
              {[1, 2, 3, 6, 12].map((months) => (
                <option key={months} value={months}>
                  {months === 1 ? "1 month" : `${months} months`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {coverMonths > 1 && typeof billingForPayments.billing_custom_charge_usd === "number" && billingForPayments.billing_custom_charge_usd > 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#92400e", lineHeight: 1.45 }}>
            The custom bill amount is one month and will be multiplied. If that number was already a multi-month total, set it back to one month before paying.
          </p>
        ) : null}
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: theme.text }}>
          <input
            type="checkbox"
            checked={enrollAutopay}
            disabled={autopayBusy}
            onChange={(e) => void saveAutopayPreference(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>Turn on Autopay. Stripe saves the card from this checkout and charges one month when the due date arrives.</span>
        </label>
        <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>
          {paymentAmount ? `Amount: $${Number.parseFloat(paymentAmount).toFixed(2)}` : "No amount due right now"}
        </div>
        {adBalanceDueCentsTotal > 0 ? (
          <>
            <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>{AD_CAMPAIGN_FEE_DISCLOSURE}</p>
            <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>{AD_CAMPAIGN_SPEND_DISCLAIMER}</p>
          </>
        ) : null}
        {stripeNotice ? <p style={{ margin: 0, fontSize: 13, color: "#047857" }}>{stripeNotice}</p> : null}
        {stripePayError ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{stripePayError}</p> : null}
        <button
          type="button"
          disabled={stripePayBusy || !paymentAmount}
          onClick={() => void startStripeCheckout()}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            width: "fit-content",
            cursor: stripePayBusy ? "wait" : "pointer",
          }}
        >
          {stripePayBusy ? "Opening Stripe…" : "Pay with Stripe"}
        </button>
      </div>
      </>
      ) : null}

      {paymentsHubTab === "collect" ? (
        <PaymentRequestsWorkspace />
      ) : null}

      {paymentsHubTab === "history" ? (
        <>
          {iosWebBilling ? null : (
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
              This page reflects payments stored on your profile. Stripe is the processor for Tradesman billing. Use the Stripe dashboard for the bank deposit.
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: theme.text, lineHeight: 1.65 }}>
              {(billingForPayments.billing_payment_history_v1 ?? []).filter((entry) => !entry.revertedAt).length > 0 ? (
                (billingForPayments.billing_payment_history_v1 ?? [])
                  .filter((entry) => !entry.revertedAt)
                  .map((entry, i) => (
                  <li key={`${entry.at}-${i}`}>
                    <strong>{formatProfilePaymentIso(entry.at)}</strong>
                    {typeof entry.amountUsd === "number" ? ` · $${entry.amountUsd.toFixed(2)}` : ""}
                    {entry.transactionId ? ` · Ref ${entry.transactionId}` : ""}
                    {entry.orderNumber ? ` · Invoice ${entry.orderNumber}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </li>
                ))
              ) : (
                <li>
                  <strong>Last successful sync</strong> (Tradesman billing): {formatProfilePaymentIso(billingForPayments.billing_last_success_at)}
                </li>
              )}
              <li>
                <strong>Next due date on file</strong>: {billingForPayments.billing_payment_due_date?.trim() || "—"}
              </li>
              <li>
                <strong>Catalog monthly total</strong> (before tax):{" "}
                {monthlyPlanTotal > 0 ? formatUsdMonthly(monthlyPlanTotal) : "—"}
              </li>
            </ul>
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
            <h2 style={{ margin: "0 0 10px", fontSize: "1.1rem", fontWeight: 800, color: theme.text }}>
              Advertising payment history
            </h2>
            {adPaymentHistory.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>No verified advertising payments yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: `2px solid ${theme.border}`, color: "#64748b" }}>
                      <th style={{ padding: "7px 8px" }}>Paid</th>
                      <th style={{ padding: "7px 8px" }}>Amount</th>
                      <th style={{ padding: "7px 8px" }}>Provider</th>
                      <th style={{ padding: "7px 8px" }}>Reference</th>
                      <th style={{ padding: "7px 8px" }}>Campaigns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adPaymentHistory.map((payment) => (
                      <tr key={payment.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: "8px" }}>{formatProfilePaymentIso(payment.created_at)}</td>
                        <td style={{ padding: "8px", fontWeight: 800 }}>{formatUsdFromCents(payment.amount_cents)}</td>
                        <td style={{ padding: "8px", textTransform: "capitalize" }}>{payment.provider}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace" }}>{payment.provider_transaction_id}</td>
                        <td style={{ padding: "8px" }}>{payment.campaign_ids.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          </>
          )}

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
