import { useEffect, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { normalizeCommunicationUrgency } from "../lib/customerUrgency"

type CalendarRow = { id: string; title: string | null; start_at: string | null; end_at: string | null }

type Props = {
  open: boolean
  onClose: () => void
  /** Profile whose calendar + customers feed this panel (managed user when in OM scope). */
  dataUserId: string | null
}

function localDayBounds(): { startIso: string; endIso: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export default function DashboardTodayTodoModal({ open, onClose, dataUserId }: Props) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [events, setEvents] = useState<CalendarRow[]>([])
  const [attentionCustomers, setAttentionCustomers] = useState<{ id: string; display_name: string | null }[]>([])

  const bounds = useMemo(() => localDayBounds(), [open])

  useEffect(() => {
    if (!open || !supabase || !dataUserId) return
    let cancelled = false
    setLoading(true)
    setErr("")
    void (async () => {
      try {
        const { startIso, endIso } = bounds
        const [evRes, custRes] = await Promise.all([
          supabase
            .from("calendar_events")
            .select("id, title, start_at, end_at")
            .eq("user_id", dataUserId)
            .is("removed_at", null)
            .gte("start_at", startIso)
            .lt("start_at", endIso)
            .order("start_at", { ascending: true }),
          supabase
            .from("customers")
            .select("id, display_name, communication_urgency")
            .eq("user_id", dataUserId)
            .limit(500),
        ])
        if (cancelled) return
        if (evRes.error) throw evRes.error
        if (custRes.error) throw custRes.error
        setEvents((evRes.data ?? []) as CalendarRow[])
        const nearCritical = (custRes.data ?? []).filter((c: { communication_urgency?: string | null }) => {
          const u = normalizeCommunicationUrgency(c.communication_urgency)
          return u === "Needs Attention"
        })
        setAttentionCustomers(nearCritical.map((c: { id: string; display_name: string | null }) => ({ id: c.id, display_name: c.display_name })))
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, dataUserId, bounds])

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
          width: "min(520px, calc(100vw - 24px))",
          maxHeight: "min(78vh, 640px)",
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>Today&apos;s to-do list</h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Scheduled jobs for today, customers whose urgency may escalate toward Critical, and a placeholder for AI task suggestions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.text,
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {!dataUserId ? (
          <p style={{ color: "#64748b", fontSize: 13 }}>Select a workspace user to load today&apos;s list.</p>
        ) : loading ? (
          <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>
        ) : err ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>
        ) : (
          <>
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#475569" }}>Jobs scheduled today</h3>
              {events.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Nothing on the calendar for today.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
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

            <section style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#475569" }}>Customers (needs attention → may reach Critical)</h3>
              {attentionCustomers.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>No customers currently at &quot;Needs Attention&quot;.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                  {attentionCustomers.map((c) => (
                    <li key={c.id}>{c.display_name?.trim() || "Customer"}</li>
                  ))}
                </ul>
              )}
            </section>

            <section
              style={{
                padding: "12px 12px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                border: `1px solid ${theme.border}`,
              }}
            >
              <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#475569" }}>AI assistant — suggested tasks</h3>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>
                Task recommendations from your assistant will appear here once that workflow is connected. For now, use the lists above to plan your day.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  )
}
