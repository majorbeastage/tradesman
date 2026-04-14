import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import { parseBillingMetadata } from "../../lib/billingProfileMetadata"

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

  const safeUrl = portalUrl && /^https:\/\//i.test(portalUrl) ? portalUrl : null

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Payments</h1>
      <p style={{ color: "#d1d5db", marginBottom: 16, lineHeight: 1.5, fontSize: 14 }}>
        Pay invoices or manage your card on file through Helcim. Your admin sets the payment portal link on your profile, or the app can use{" "}
        <code style={{ color: theme.primary }}>VITE_HELCIM_PAYMENT_PORTAL_URL</code> for all users.
      </p>
      {loading ? (
        <p style={{ color: "#9ca3af" }}>Loading…</p>
      ) : safeUrl ? (
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
            src={safeUrl}
            style={{ width: "100%", height: "min(78vh, 720px)", border: "none", display: "block" }}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            referrerPolicy="strict-origin-when-cross-origin"
          />
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
          <strong>No payment portal URL configured.</strong> Ask your administrator to set{" "}
          <strong>Helcim pay portal URL</strong> for your account (Admin → Billing &amp; Helcim), or configure{" "}
          <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> in the app environment.
        </div>
      )}
    </div>
  )
}
