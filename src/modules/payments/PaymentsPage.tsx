import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import {
  appendHelcimCustomerQueryToPayPortalUrl,
  helcimPayPortalUrlAllowsIframe,
  normalizeHelcimPayPortalUrl,
  parseBillingMetadata,
  resolveHelcimPayPortalBaseUrl,
} from "../../lib/billingProfileMetadata"

const ENV_PORTAL = (import.meta as { env?: Record<string, string> }).env?.VITE_HELCIM_PAYMENT_PORTAL_URL ?? ""

export default function PaymentsPage() {
  /** In the office manager portal, use the "Working as" user so their Helcim URL is shown. */
  const profileUserId = useScopedUserId()
  const [portalBaseUrl, setPortalBaseUrl] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  const withCustomer = portalBaseUrl ? appendHelcimCustomerQueryToPayPortalUrl(portalBaseUrl, customerCode) : null
  const normalizedPortal = withCustomer ? normalizeHelcimPayPortalUrl(withCustomer) : null
  const iframeUrl = normalizedPortal && helcimPayPortalUrlAllowsIframe(normalizedPortal) ? normalizedPortal : null
  const openInTabUrl = normalizedPortal && !iframeUrl ? normalizedPortal : null
  const invalidPortal = Boolean(portalBaseUrl?.trim()) && !normalizedPortal

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Payments</h1>
      <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
        This tab loads <strong>Helcim&apos;s hosted payment page</strong> (card fields and processing live on Helcim&apos;s domain), not{" "}
        <strong>Helcim.js</strong> on our own HTML form. Helcim.js is a different integration: you add named inputs on your site, their script
        tokenizes cards via CORS, then typically <strong>POSTs results back to a URL you control</strong> — useful for fully custom checkout;
        here we avoid maintaining that surface and PCI scope inside Tradesman.
      </p>
      <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
        <strong>Setup:</strong> set one pay/portal URL on the app build as{" "}
        <code style={{ color: theme.primary }}>VITE_HELCIM_PAYMENT_PORTAL_URL</code> (Vercel / mobile env — not Supabase). Your{" "}
        <strong>Helcim customer code</strong> from Admin → Billing &amp; Helcim is appended as <code>customerCode</code> when missing from the
        URL (confirm the parameter name with Helcim for your exact page template). Per-user portal URL overrides are optional.
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
          <strong>No payment portal URL configured.</strong> Set <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> once on the web or
          mobile build (recommended — same Helcim page for everyone), or add a per-user URL in <strong>Admin → Billing &amp;
          Helcim</strong>. Map each user&apos;s <strong>Helcim customer code</strong> there so webhooks and the pay link can tie
          activity to the right account.
        </div>
      )}
    </div>
  )
}
