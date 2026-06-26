import { useCallback, useEffect, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { normalizeCommunicationUrgency } from "../lib/customerUrgency"
import { formatCoiExpiryLabel } from "../lib/coiExpiration"
import { loadCoiTodoItems, type CoiTodoItem } from "../lib/insuranceAssistant"
import { loadPressingWorkQueue, type PressingWorkItem } from "../lib/pressingWorkQueue"
import { loadTodoAssigneeOptions } from "../lib/dashboardTodos"
import DashboardTodoManageBlock from "./DashboardTodoManageBlock"

type CalendarRow = { id: string; title: string | null; start_at: string | null; end_at: string | null }

type Props = {
  open: boolean
  onClose: () => void
  /** Workspace account (calendar + customers scope). */
  dataUserId: string | null
  /** Signed-in user — task assignment + "my tasks" filter. */
  viewerUserId: string | null
}

function localDayBounds(): { startIso: string; endIso: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export default function DashboardTodayTodoModal({ open, onClose, dataUserId, viewerUserId }: Props) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [events, setEvents] = useState<CalendarRow[]>([])
  const [attentionCustomers, setAttentionCustomers] = useState<{ id: string; display_name: string | null }[]>([])
  const [coiTodos, setCoiTodos] = useState<CoiTodoItem[]>([])
  const [pressingItems, setPressingItems] = useState<PressingWorkItem[]>([])
  const [showTodayDetail, setShowTodayDetail] = useState(false)

  const bounds = useMemo(() => localDayBounds(), [open])
  const accountOwnerId = dataUserId
  const actorId = viewerUserId ?? dataUserId

  const reload = useCallback(async () => {
    if (!supabase || !accountOwnerId || !actorId) return
    setLoading(true)
    setErr("")
    try {
      const { startIso, endIso } = bounds
      const assigneeOpts = await loadTodoAssigneeOptions(supabase, accountOwnerId, actorId)
      const labelMap = new Map(assigneeOpts.map((o) => [o.id, o.label]))

      const [evRes, custRes, coiItems, pressing] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, title, start_at, end_at")
          .eq("user_id", accountOwnerId)
          .is("removed_at", null)
          .gte("start_at", startIso)
          .lt("start_at", endIso)
          .order("start_at", { ascending: true }),
        supabase
          .from("customers")
          .select("id, display_name, communication_urgency")
          .eq("user_id", accountOwnerId)
          .limit(500),
        loadCoiTodoItems(supabase, accountOwnerId),
        loadPressingWorkQueue(supabase, accountOwnerId, actorId, {
          includeTeamTodos: true,
          assigneeLabels: labelMap,
        }),
      ])
      if (evRes.error) throw evRes.error
      if (custRes.error) throw custRes.error
      setEvents((evRes.data ?? []) as CalendarRow[])
      const nearCritical = (custRes.data ?? []).filter((c: { communication_urgency?: string | null }) => {
        const u = normalizeCommunicationUrgency(c.communication_urgency)
        return u === "Needs Attention" || u === "Critical"
      })
      setAttentionCustomers(
        nearCritical.map((c: { id: string; display_name: string | null }) => ({ id: c.id, display_name: c.display_name })),
      )
      setCoiTodos(coiItems)
      setPressingItems(pressing)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [accountOwnerId, actorId, bounds])

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 9999,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 24px))",
          maxHeight: "min(86vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 48px rgba(15,23,42,0.18)",
          padding: "18px 18px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>To-do &amp; priorities</h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Next pressing work, custom tasks for you and your team, plus today&apos;s scheduled jobs.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            Close
          </button>
        </div>

        {!accountOwnerId || !actorId ? (
          <p style={{ color: "#64748b", fontSize: 13 }}>Select a workspace user to load your to-do list.</p>
        ) : loading ? (
          <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>
        ) : err ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>
        ) : (
          <>
            <DashboardTodoManageBlock
              accountOwnerId={accountOwnerId}
              viewerUserId={actorId}
              pressingItems={pressingItems}
              onRefresh={() => void reload()}
            />

            <div style={{ marginTop: 14, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowTodayDetail((v) => !v)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  color: theme.text,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {showTodayDetail ? "Hide" : "Show"} today&apos;s detail ({events.length} job{events.length === 1 ? "" : "s"} today)
              </button>
            </div>

            {showTodayDetail ? (
              <>
                <section style={{ marginTop: 14 }}>
                  <h3 style={sectionTitleStyle}>Jobs scheduled today</h3>
                  {events.length === 0 ? (
                    <p style={emptyStyle}>Nothing on the calendar for today.</p>
                  ) : (
                    <ul style={bulletListStyle}>
                      {events.map((ev) => (
                        <li key={ev.id}>
                          <strong>{ev.title?.trim() || "Untitled"}</strong>
                          {ev.start_at ? (
                            <span style={{ color: "#64748b", fontWeight: 500 }}>
                              {" "}
                              · {new Date(ev.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section style={{ marginTop: 14 }}>
                  <h3 style={sectionTitleStyle}>Customers needing attention</h3>
                  {attentionCustomers.length === 0 ? (
                    <p style={emptyStyle}>No priority customers flagged.</p>
                  ) : (
                    <ul style={bulletListStyle}>
                      {attentionCustomers.map((c) => (
                        <li key={c.id}>{c.display_name?.trim() || "Customer"}</li>
                      ))}
                    </ul>
                  )}
                </section>

                <section style={{ marginTop: 14 }}>
                  <h3 style={sectionTitleStyle}>Insurance COI renewals</h3>
                  {coiTodos.length === 0 ? (
                    <p style={emptyStyle}>No certificates expiring within 30 days.</p>
                  ) : (
                    <ul style={bulletListStyle}>
                      {coiTodos.map((item) => (
                        <li key={item.id}>
                          <strong>{item.label}</strong>
                          <span style={{ color: item.status === "expired" ? "#b91c1c" : "#b45309", fontWeight: 600 }}>
                            {" "}
                            · {formatCoiExpiryLabel(item.expiresAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}

const closeBtnStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: theme.text,
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  cursor: "pointer",
} as const

const sectionTitleStyle = { margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#475569" } as const
const emptyStyle = { margin: 0, fontSize: 13, color: "#94a3b8" } as const
const bulletListStyle = { margin: 0, paddingLeft: 18, fontSize: 13, color: theme.text, lineHeight: 1.5 } as const
