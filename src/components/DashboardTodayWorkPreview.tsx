import { useEffect, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { loadTodayWorkSnapshot, type TodayWorkSnapshot } from "../lib/todayWorkReport"

type Props = {
  dataUserId: string | null
  isMobile: boolean
  reportingAllowed: boolean
  onOpenReporting?: () => void
  onOpenCustomers?: () => void
  onOpenCalendar?: () => void
  compact?: boolean
  labels: {
    title: string
    subtitle: string
    viewAllReports: string
    loading: string
    noUser: string
    todayJobs: string
    weekJobs: string
    priorityAlerts: string
    neglected: string
    recentlyAdded: string
    nothingToday: string
    noPriority: string
    noNeglected: string
    noRecent: string
    openCustomers: string
    openCalendar: string
  }
}

function statChipStyle(): CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    minWidth: 88,
    flex: "1 1 120px",
  }
}

export default function DashboardTodayWorkPreview({
  dataUserId,
  isMobile,
  reportingAllowed,
  onOpenReporting,
  onOpenCustomers,
  onOpenCalendar,
  compact,
  labels,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [snap, setSnap] = useState<TodayWorkSnapshot | null>(null)

  useEffect(() => {
    if (!supabase || !dataUserId) {
      setSnap(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setErr("")
    void loadTodayWorkSnapshot(supabase, dataUserId)
      .then((data) => {
        if (!cancelled) setSnap(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dataUserId])

  const gridCols = isMobile ? "1fr" : "1fr 1fr"

  return (
    <section
      style={{
        maxWidth: 1100,
        margin: compact ? "0" : "14px auto 8px",
        padding: isMobile ? "14px 12px" : "16px 16px 18px",
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#f8fafc",
        boxShadow: "0 8px 26px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 19, fontWeight: 800, color: "#0f172a", letterSpacing: -0.02 }}>
            {labels.title}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45, maxWidth: 640 }}>{labels.subtitle}</p>
        </div>
        {reportingAllowed && onOpenReporting ? (
          <button
            type="button"
            onClick={onOpenReporting}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(249,115,22,0.28)",
            }}
          >
            {labels.viewAllReports}
          </button>
        ) : null}
      </div>

      {!dataUserId ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>{labels.noUser}</p>
      ) : loading ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>{labels.loading}</p>
      ) : err ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c" }}>{err}</p>
      ) : snap ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{snap.todayEvents.length}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{labels.todayJobs}</div>
            </div>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{snap.weekEventCount}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{labels.weekJobs}</div>
            </div>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{snap.priorityCustomers.length}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{labels.priorityAlerts}</div>
            </div>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{snap.recentCustomers.length}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{labels.recentlyAdded}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12, marginTop: 14 }}>
            <PreviewList
              title={labels.todayJobs}
              empty={labels.nothingToday}
              actionLabel={onOpenCalendar ? labels.openCalendar : undefined}
              onAction={onOpenCalendar}
              items={snap.todayEvents.slice(0, 6).map((ev) => ({
                key: ev.id,
                primary: ev.title?.trim() || "Untitled job",
                secondary: ev.start_at
                  ? new Date(ev.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                  : undefined,
              }))}
            />
            <PreviewList
              title={labels.priorityAlerts}
              empty={labels.noPriority}
              actionLabel={onOpenCustomers ? labels.openCustomers : undefined}
              onAction={onOpenCustomers}
              items={snap.priorityCustomers.slice(0, 6).map((c) => ({
                key: c.id,
                primary: c.display_name?.trim() || "Customer",
                secondary: c.communication_urgency,
                accent: c.communication_urgency === "Critical" ? "#dc2626" : "#d97706",
              }))}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12, marginTop: 12 }}>
            <PreviewList
              title={labels.neglected}
              empty={labels.noNeglected}
              actionLabel={onOpenCustomers ? labels.openCustomers : undefined}
              onAction={onOpenCustomers}
              items={snap.neglectedCustomers.slice(0, 5).map((c) => ({
                key: c.id,
                primary: c.display_name?.trim() || "Customer",
                secondary: c.communication_urgency,
              }))}
            />
            <PreviewList
              title={labels.recentlyAdded}
              empty={labels.noRecent}
              actionLabel={onOpenCustomers ? labels.openCustomers : undefined}
              onAction={onOpenCustomers}
              items={snap.recentCustomers.slice(0, 5).map((c) => ({
                key: c.id,
                primary: c.display_name?.trim() || "Customer",
                secondary: c.updated_at
                  ? new Date(c.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })
                  : undefined,
              }))}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}

function PreviewList({
  title,
  empty,
  items,
  actionLabel,
  onAction,
}: {
  title: string
  empty: string
  items: { key: string; primary: string; secondary?: string; accent?: string }[]
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        minHeight: 120,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#475569" }}>{title}</h3>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              color: theme.text,
              cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13, lineHeight: 1.45 }}>
          {items.map((item) => (
            <li key={item.key} style={{ padding: "5px 0", borderTop: "1px solid #f1f5f9" }}>
              <div style={{ fontWeight: 600, color: theme.text }}>{item.primary}</div>
              {item.secondary ? (
                <div style={{ fontSize: 11, color: item.accent ?? "#64748b", fontWeight: item.accent ? 700 : 500 }}>{item.secondary}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
