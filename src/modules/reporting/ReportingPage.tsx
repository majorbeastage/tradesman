import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useOfficeManagerScopeOptional } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { normalizeCommunicationUrgency } from "../../lib/customerUrgency"
import { theme } from "../../styles/theme"

type Period = "30d" | "90d" | "365d"

function periodStartIso(p: Period): string {
  const d = new Date()
  const days = p === "30d" ? 30 : p === "90d" ? 90 : 365
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function channelBucket(eventType: string | null): "Email" | "Text" | "Phone" | "Other" {
  const t = String(eventType ?? "").toLowerCase()
  if (t === "email") return "Email"
  if (t === "sms") return "Text"
  if (t === "call" || t === "voicemail") return "Phone"
  return "Other"
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n")
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportingPage() {
  const { role, user } = useAuth()
  const omScope = useOfficeManagerScopeOptional()
  const reportingUserId = omScope?.selectedUserId ?? user?.id ?? null

  const allowed = role === "office_manager" || role === "admin"

  const [period, setPeriod] = useState<Period>("90d")
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")

  const [events, setEvents] = useState<{ event_type: string | null; created_at: string | null }[]>([])
  const [customers, setCustomers] = useState<{ communication_urgency?: string | null }[]>([])
  const [quotesByStatus, setQuotesByStatus] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    if (!allowed || !supabase || !reportingUserId) return
    setLoading(true)
    setErr("")
    const since = periodStartIso(period)
    try {
      const [evRes, custRes, quoteRes] = await Promise.all([
        supabase
          .from("communication_events")
          .select("event_type, created_at")
          .eq("user_id", reportingUserId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(8000),
        supabase.from("customers").select("communication_urgency").eq("user_id", reportingUserId).limit(5000),
        supabase.from("quotes").select("status").eq("user_id", reportingUserId).is("removed_at", null).limit(8000),
      ])
      if (evRes.error) throw evRes.error
      if (custRes.error) throw custRes.error
      if (quoteRes.error) throw quoteRes.error
      setEvents((evRes.data ?? []) as { event_type: string | null; created_at: string | null }[])
      setCustomers((custRes.data ?? []) as { communication_urgency?: string | null }[])
      const qRows = (quoteRes.data ?? []) as { status: string | null }[]
      const tally: Record<string, number> = {}
      for (const q of qRows) {
        const s = String(q.status ?? "unknown").trim() || "unknown"
        tally[s] = (tally[s] ?? 0) + 1
      }
      setQuotesByStatus(tally)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [allowed, reportingUserId, period])

  useEffect(() => {
    void load()
  }, [load])

  const contactsByMonth = useMemo(() => {
    const months = new Map<string, { Email: number; Text: number; Phone: number; Other: number }>()
    for (const ev of events) {
      if (!ev.created_at) continue
      const d = new Date(ev.created_at)
      if (Number.isNaN(d.getTime())) continue
      const key = ym(d)
      const ch = channelBucket(ev.event_type)
      if (!months.has(key)) months.set(key, { Email: 0, Text: 0, Phone: 0, Other: 0 })
      const row = months.get(key)!
      row[ch] += 1
    }
    const sortedKeys = Array.from(months.keys()).sort()
    return sortedKeys.map((k) => ({ month: k, ...months.get(k)! }))
  }, [events])

  const urgencyMix = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const c of customers) {
      const u = normalizeCommunicationUrgency(c.communication_urgency)
      tally[u] = (tally[u] ?? 0) + 1
    }
    return Object.entries(tally).sort((a, b) => b[1] - a[1])
  }, [customers])

  const totalContacts = events.length

  const exportCommunications = () => {
    const header = ["month", "email", "text", "phone", "other"]
    const rows = [header, ...contactsByMonth.map((r) => [r.month, String(r.Email), String(r.Text), String(r.Phone), String(r.Other)])]
    downloadCsv(`tradesman-contacts-by-channel-${period}.csv`, rows)
  }

  const exportUrgency = () => {
    const rows = [["urgency_level", "customer_count"], ...urgencyMix.map(([k, v]) => [k, String(v)])]
    downloadCsv(`tradesman-customer-urgency-${period}.csv`, rows)
  }

  const exportQuotes = () => {
    const rows = [["quote_status", "count"], ...Object.entries(quotesByStatus).map(([k, v]) => [k, String(v)])]
    downloadCsv(`tradesman-quotes-by-status-${period}.csv`, rows)
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24, maxWidth: 560 }}>
        <h1 style={{ marginTop: 0, color: "#475569", fontWeight: 700 }}>Reporting</h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
          Reporting exports and charts are available to office managers and administrators. Ask your admin if you need access.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ marginTop: 0, color: "#475569", fontWeight: 700 }}>Reporting</h1>
      <p style={{ color: "#94a3b8", lineHeight: 1.55, margin: "0 0 16px" }}>
        Summaries from data already in your workspace — filter by period, explore charts, and download CSV slices for spreadsheets.
      </p>

      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        style={{
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "#f8fafc",
          color: theme.text,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {filtersOpen ? "Hide filters" : "Show filters"}
      </button>

      {filtersOpen ? (
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            Period &nbsp;
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} style={{ ...theme.formInput, marginLeft: 6 }}>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="365d">Last 12 months</option>
            </select>
          </label>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Scope: <strong>{omScope?.selectedUserId ? "Selected managed user" : "Your account"}</strong>
          </span>
        </div>
      ) : null}

      {!reportingUserId ? (
        <p style={{ color: "#64748b" }}>Sign in and select a workspace user to load reporting.</p>
      ) : loading ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : err ? (
        <p style={{ color: "#b91c1c" }}>{err}</p>
      ) : (
        <>
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "#64748b", fontWeight: 700 }}>Customer contacts by channel</h2>
              <button
                type="button"
                onClick={exportCommunications}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  color: theme.text,
                  cursor: "pointer",
                }}
              >
                Download CSV
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 12px", lineHeight: 1.5 }}>
              Communication events in the selected window (total {totalContacts}). Email, text (SMS), and phone-style events (calls + voicemail).
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: "#2563eb" }}>■ Email</span>
              <span style={{ color: "#059669" }}>■ Text</span>
              <span style={{ color: "#d97706" }}>■ Phone</span>
              <span style={{ color: "#64748b" }}>■ Other</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", overflowX: "auto", paddingBottom: 4 }}>
              {contactsByMonth.map((row) => {
                const h = 120
                const total = row.Email + row.Text + row.Phone + row.Other
                const scale = (n: number) => (total > 0 ? (n / total) * h : 0)
                return (
                  <div key={row.month} style={{ flex: "0 0 52px", textAlign: "center" }}>
                    <div
                      style={{
                        height: h,
                        display: "flex",
                        flexDirection: "column-reverse",
                        justifyContent: "flex-start",
                        gap: 1,
                        borderRadius: 4,
                        overflow: "hidden",
                        background: "#f1f5f9",
                      }}
                    >
                      <div style={{ height: scale(row.Email), background: "#3b82f6" }} title={`Email ${row.Email}`} />
                      <div style={{ height: scale(row.Text), background: "#10b981" }} title={`Text ${row.Text}`} />
                      <div style={{ height: scale(row.Phone), background: "#f59e0b" }} title={`Phone ${row.Phone}`} />
                      <div style={{ height: scale(row.Other), background: "#94a3b8" }} title={`Other ${row.Other}`} />
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>{row.month.slice(5)}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{total}</div>
                  </div>
                )
              })}
            </div>
          </section>

          <section style={{ marginBottom: 28, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, color: "#64748b", fontWeight: 700 }}>Customers by urgency</h2>
                <button
                  type="button"
                  onClick={exportUrgency}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#f8fafc",
                    color: theme.text,
                    cursor: "pointer",
                  }}
                >
                  CSV
                </button>
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "8px 0 12px", lineHeight: 1.45 }}>Current distribution (not time-filtered).</p>
              {urgencyMix.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>No customers loaded.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13 }}>
                  {urgencyMix.map(([label, n]) => {
                    const pct = Math.round((n / customers.length) * 100)
                    return (
                      <li key={label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: theme.text }}>{label}</span>
                          <span style={{ color: "#64748b" }}>
                            {n} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#f97316" }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, color: "#64748b", fontWeight: 700 }}>Estimates by status</h2>
                <button
                  type="button"
                  onClick={exportQuotes}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#f8fafc",
                    color: theme.text,
                    cursor: "pointer",
                  }}
                >
                  CSV
                </button>
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "8px 0 12px", lineHeight: 1.45 }}>Open and historical quotes in your workspace.</p>
              {Object.keys(quotesByStatus).length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>No quotes found.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {Object.entries(quotesByStatus)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, n]) => (
                      <div
                        key={status}
                        style={{
                          minWidth: 100,
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: "linear-gradient(135deg, #f8fafc, #e2e8f0)",
                          border: `1px solid ${theme.border}`,
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{n}</div>
                        <div style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>{status}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
