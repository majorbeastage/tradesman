import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import {
  helcimPayPortalUrlAllowsIframe,
  normalizeHelcimPayPortalUrl,
  parseBillingMetadata,
} from "../../lib/billingProfileMetadata"

const ENV_PORTAL = (import.meta as { env?: Record<string, string> }).env?.VITE_HELCIM_PAYMENT_PORTAL_URL ?? ""

export default function PaymentsPage() {
  const { userId } = useAuth()
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (cancelled) return
      setLoading(false)
      if (error || !data) {
        setPortalUrl(ENV_PORTAL.trim() || null)
        return
      }
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const billing = parseBillingMetadata(meta)
      const fromProfile = billing.helcim_pay_portal_url?.trim()
      setPortalUrl(fromProfile || ENV_PORTAL.trim() || null)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const normalizedPortal = portalUrl ? normalizeHelcimPayPortalUrl(portalUrl) : null
  const iframeUrl = normalizedPortal && helcimPayPortalUrlAllowsIframe(normalizedPortal) ? normalizedPortal : null
  const openInTabUrl = normalizedPortal && !iframeUrl ? normalizedPortal : null
  const invalidPortal = Boolean(portalUrl?.trim()) && !normalizedPortal

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Payments</h1>
      <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
        Pay invoices or manage your card on file through Helcim. Your admin sets the payment portal link on your profile, or the app can use{" "}
        <code style={{ color: theme.primary }}>VITE_HELCIM_PAYMENT_PORTAL_URL</code> for all users.
      </p>
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
          <strong>No payment portal URL configured.</strong> An admin should open{" "}
          <strong>Admin → Billing &amp; Helcim</strong>, enter <strong>Helcim pay portal URL</strong> for your user row, and click{" "}
          <strong>Save</strong>. Alternatively, set <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> in the web or mobile build environment
          so every account uses the same portal link.
        </div>
      )}
    </div>
  )
}
