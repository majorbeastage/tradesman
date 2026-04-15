import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { parseBillingMetadata } from "../lib/billingProfileMetadata"
import { computeBillingDueDashboardNotice } from "../lib/billingDueNotice"
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

  useEffect(() => {
    if (!separateBillingProfile || !supabase || !profileUserId) {
      setNotice(null)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", profileUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setNotice(null)
          return
        }
        const meta =
          data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        setNotice(computeBillingDueDashboardNotice(parseBillingMetadata(meta)))
      })
    return () => {
      cancelled = true
    }
  }, [profileUserId, separateBillingProfile])

  if (!separateBillingProfile || !notice) return null

  const isPast = notice.kind === "past_due"
  const title = isPast ? t("dashboard.billingDueTitlePast") : t("dashboard.billingDueTitleToday")
  const body = isPast
    ? t("dashboard.billingDueBodyPast")
        .replace("{{days}}", String(notice.daysPast))
        .replace("{{due}}", notice.dueIso)
    : t("dashboard.billingDueBodyToday").replace("{{due}}", notice.dueIso)

  return (
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
          <button
            type="button"
            onClick={onOpenPayments}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {t("dashboard.billingDueCtaPayments")}
          </button>
        </div>
      ) : null}
    </div>
  )
}
