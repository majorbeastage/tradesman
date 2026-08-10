import { useEffect, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { loadTodayWorkSnapshot, type TodayWorkSnapshot } from "../lib/todayWorkReport"
import { loadPressingWorkQueue, type PressingWorkItem } from "../lib/pressingWorkQueue"
import { requestOpenDashboardTodoModal, openDashboardCalendarEvent } from "../lib/dashboardTodoUi"

type Props = {
  dataUserId: string | null
  viewerUserId: string | null
  setPage?: (page: string) => void
  isMobile: boolean
  reportingAllowed: boolean
  onOpenReporting?: () => void
  onOpenCustomers?: () => void
  onOpenCalendar?: () => void
  onOpenGrowth?: () => void
  compact?: boolean
  labels: {
    title: string
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
    nextUp: string
    nextUpEmpty: string
    manageTasks: string
  }
}

function statChipStyle(): CSSProperties {
  return {
    padding: "6px 8px",
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    minWidth: 68,
    flex: "1 1 90px",
  }
}

export default function DashboardTodayWorkPreview({
  dataUserId,
  viewerUserId,
  setPage,
  isMobile,
  reportingAllowed,
  onOpenReporting,
  onOpenCustomers,
  onOpenCalendar,
  onOpenGrowth,
  compact,
  labels,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [snap, setSnap] = useState<TodayWorkSnapshot | null>(null)
  const [pressing, setPressing] = useState<PressingWorkItem[]>([])
  const [campaignApprovals, setCampaignApprovals] = useState<{ id: string; name: string; requested_budget_cents: number }[]>([])

  useEffect(() => {
    if (!supabase || !dataUserId) {
      setSnap(null)
      setPressing([])
      setCampaignApprovals([])
      return
    }
    const actorId = viewerUserId ?? dataUserId
    let cancelled = false
    setLoading(true)
    setErr("")
    void Promise.all([
      loadTodayWorkSnapshot(supabase, dataUserId, { viewerUserId: actorId }),
      loadPressingWorkQueue(supabase, dataUserId, actorId, { includeTeamTodos: false }),
      supabase
        .from("ad_campaigns")
        .select("id, name, requested_budget_cents")
        .eq("profile_id", dataUserId)
        .eq("status", "awaiting_client_approval")
        .order("updated_at", { ascending: false }),
    ])
      .then(([today, queue, campaignResult]) => {
        if (!cancelled) {
          setSnap(today)
          setPressing(queue)
          setCampaignApprovals(
            (campaignResult.data ?? []) as { id: string; name: string; requested_budget_cents: number }[],
          )
        }
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
  }, [dataUserId, viewerUserId])

  const gridCols = isMobile ? "1fr" : "1fr 1fr"

  function openEvent(eventId: string) {
    if (!setPage) return
    openDashboardCalendarEvent(eventId, setPage)
  }

  return (
    <section
      style={{
        maxWidth: isMobile ? 1100 : "100%",
        margin: compact ? "0" : "10px auto 6px",
        padding: isMobile ? "10px 10px 12px" : "12px 12px 14px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#f8fafc",
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 16, fontWeight: 800, color: "#0f172a", letterSpacing: -0.02 }}>
            {labels.title}
          </h2>
        </div>
        {reportingAllowed && onOpenReporting ? (
          <button
            type="button"
            onClick={onOpenReporting}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(249,115,22,0.22)",
            }}
          >
            {labels.viewAllReports}
          </button>
        ) : null}
        <button
          type="button"
          onClick={requestOpenDashboardTodoModal}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "5px 10px",
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            color: theme.text,
            cursor: "pointer",
          }}
        >
          {labels.manageTasks}
        </button>
      </div>

      {!dataUserId ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>{labels.noUser}</p>
      ) : loading ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>{labels.loading}</p>
      ) : err ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#b91c1c" }}>{err}</p>
      ) : snap ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>{snap.todayEvents.length}</div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{labels.todayJobs}</div>
            </div>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>{snap.weekEventCount}</div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{labels.weekJobs}</div>
            </div>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>{snap.priorityCustomers.length}</div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{labels.priorityAlerts}</div>
            </div>
            <div style={statChipStyle()}>
              <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>{snap.recentCustomers.length}</div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{labels.recentlyAdded}</div>
            </div>
          </div>

          <PreviewList
            title={labels.nextUp}
            empty={labels.nextUpEmpty}
            actionLabel={campaignApprovals.length > 0 && onOpenGrowth ? "Open Growth" : labels.manageTasks}
            onAction={campaignApprovals.length > 0 && onOpenGrowth ? onOpenGrowth : requestOpenDashboardTodoModal}
            items={[
              ...campaignApprovals.map((campaign) => ({
                key: `campaign-${campaign.id}`,
                primary: `Approve campaign: ${campaign.name}`,
                secondary: `$${(campaign.requested_budget_cents / 100).toFixed(2)} proposed budget · Growth → Campaigns`,
                accent: "#c2410c",
              })),
              ...pressing.map((item) => ({
                key: item.id,
                primary: item.title,
                secondary: item.subtitle,
                accent: item.urgencyScore >= 90 ? "#dc2626" : item.urgencyScore >= 70 ? "#d97706" : undefined,
                onClick: item.eventId && setPage ? () => openEvent(item.eventId!) : undefined,
              })),
            ].slice(0, 5)}
          />

          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginTop: 10 }}>
            <PreviewList
              title={labels.todayJobs}
              empty={labels.nothingToday}
              actionLabel={onOpenCalendar ? labels.openCalendar : undefined}
              onAction={onOpenCalendar}
              items={snap.todayEvents.slice(0, 4).map((ev) => ({
                key: ev.id,
                primary: ev.title?.trim() || "Untitled job",
                secondary: ev.start_at
                  ? new Date(ev.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                  : undefined,
                onClick: setPage ? () => openEvent(ev.id) : undefined,
              }))}
            />
            <PreviewList
              title={labels.priorityAlerts}
              empty={labels.noPriority}
              actionLabel={onOpenCustomers ? labels.openCustomers : undefined}
              onAction={onOpenCustomers}
              items={snap.priorityCustomers.slice(0, 4).map((c) => ({
                key: c.id,
                primary: c.display_name?.trim() || "Customer",
                secondary: c.communication_urgency,
                accent: c.communication_urgency === "Critical" ? "#dc2626" : "#d97706",
              }))}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginTop: 8 }}>
            <PreviewList
              title={labels.neglected}
              empty={labels.noNeglected}
              actionLabel={onOpenCustomers ? labels.openCustomers : undefined}
              onAction={onOpenCustomers}
              items={snap.neglectedCustomers.slice(0, 3).map((c) => ({
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
              items={snap.recentCustomers.slice(0, 3).map((c) => ({
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
  items: { key: string; primary: string; secondary?: string; accent?: string; onClick?: () => void }[]
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      style={{
        padding: "8px 9px",
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        minHeight: 88,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#475569" }}>{title}</h3>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
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
        <p style={{ margin: 0, fontSize: 10, color: "#94a3b8" }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 11, lineHeight: 1.35 }}>
          {items.map((item) => (
            <li key={item.key} style={{ padding: "3px 0", borderTop: "1px solid #f1f5f9" }}>
              {item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    font: "inherit",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 600, color: theme.text, fontSize: 11 }}>{item.primary}</div>
                  {item.secondary ? (
                    <div style={{ fontSize: 10, color: item.accent ?? "#64748b", fontWeight: item.accent ? 700 : 500 }}>
                      {item.secondary}
                    </div>
                  ) : null}
                </button>
              ) : (
                <>
                  <div style={{ fontWeight: 600, color: theme.text, fontSize: 11 }}>{item.primary}</div>
                  {item.secondary ? (
                    <div style={{ fontSize: 10, color: item.accent ?? "#64748b", fontWeight: item.accent ? 700 : 500 }}>{item.secondary}</div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
