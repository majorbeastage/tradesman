import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { parseBillingMetadata } from "../lib/billingProfileMetadata"
import { computeBillingDueDashboardNotice } from "../lib/billingDueNotice"
import {
  AD_PAYMENT_LOAD_STORAGE_KEY,
  formatUsdFromCents,
  parseAdBillingMetadata,
  sumAdBalanceDueCents,
  type AdCampaignRow,
} from "../lib/adCampaigns"
import { theme } from "../styles/theme"
import { useLocale } from "../i18n/LocaleContext"

type Props = {
  /** Profile whose `metadata` billing fields we read (signed-in user or scoped managed user). */
  profileUserId: string | null | undefined
  /** When false, user is on a bundled office-manager plan without their own Payments tab — no separate billing alerts. */
  separateBillingProfile: boolean
  /** When true, show a button that calls `onOpenPayments` (sidebar must expose Payments). */
  paymentsTabAvailable: boolean
  onOpenPayments?: () => void
}

export default function BillingDueDashboardBanner({
  profileUserId,
  separateBillingProfile,
  paymentsTabAvailable,
  onOpenPayments,
}: Props) {
  const { t } = useLocale()
  const [notice, setNotice] = useState<ReturnType<typeof computeBillingDueDashboardNotice>>(null)
  const [adBalanceDueCents, setAdBalanceDueCents] = useState(0)

  useEffect(() => {
    if (!separateBillingProfile || !supabase || !profileUserId) {
      setNotice(null)
      setAdBalanceDueCents(0)
      return
    }
    let cancelled = false
    void Promise.all([
      supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle(),
      supabase.from("ad_campaigns").select("spent_cents, billed_cents").eq("profile_id", profileUserId),
    ]).then(([profileResult, campaignsResult]) => {
        if (cancelled) return
        const { data, error } = profileResult
        if (error || !data) {
          setNotice(null)
          setAdBalanceDueCents(0)
          return
        }
        const meta =
          data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        const campaignBalance = sumAdBalanceDueCents(
          ((campaignsResult.data ?? []) as Pick<AdCampaignRow, "spent_cents" | "billed_cents">[]),
        )
        const metadataBalance = parseAdBillingMetadata(meta)?.balance_due_cents ?? 0
        setNotice(computeBillingDueDashboardNotice(parseBillingMetadata(meta)))
        setAdBalanceDueCents(Math.max(campaignBalance, metadataBalance))
      })
    return () => {
      cancelled = true
    }
  }, [profileUserId, separateBillingProfile])

  if (!separateBillingProfile || (!notice && adBalanceDueCents <= 0)) return null

  const isPast = notice?.kind === "past_due"
  const title = notice ? (isPast ? t("dashboard.billingDueTitlePast") : t("dashboard.billingDueTitleToday")) : ""
  const body = notice
    ? isPast
      ? t("dashboard.billingDueBodyPast")
          .replace("{{days}}", String(notice.daysPast))
          .replace("{{due}}", notice.dueIso)
      : t("dashboard.billingDueBodyToday").replace("{{due}}", notice.dueIso)
    : ""

  const openPayments = (advertisingOnly = false) => {
    if (advertisingOnly) {
      try {
        sessionStorage.setItem(AD_PAYMENT_LOAD_STORAGE_KEY, "1")
      } catch {
        /* navigation still works if storage is unavailable */
      }
    }
    onOpenPayments?.()
  }

  return (
    <>
      {notice ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "14px 16px",
            borderRadius: 10,
            border: `1px solid ${isPast ? "#f87171" : "#fbbf24"}`,
            background: isPast ? "#450a0a" : "#422006",
            color: isPast ? "#fecaca" : "#fef3c7",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ display: "block", marginBottom: 6 }}>{title}</strong>
          <span>{body}</span>
          {paymentsTabAvailable && onOpenPayments ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => openPayments()} style={ctaStyle}>
                {t("dashboard.billingDueCtaPayments")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {adBalanceDueCents > 0 ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "14px 16px",
            borderRadius: 10,
            border: "1px solid #fb923c",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ display: "block", marginBottom: 6 }}>Advertising &amp; campaigns bill available</strong>
          <span>
            Your current advertising balance is <strong>{formatUsdFromCents(adBalanceDueCents)}</strong>.
          </span>
          {paymentsTabAvailable && onOpenPayments ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => openPayments(true)} style={ctaStyle}>
                Load advertising bill into Payments
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

const ctaStyle = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
} as const
