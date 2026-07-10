import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { loadAdminSiteTrafficStats, type SiteTrafficStats } from "../../lib/adminSiteTraffic"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { adminSecondaryButtonStyle } from "../../components/admin/adminButtonStyles"

const ADMIN_MUTED = "#475569"
const ADMIN_SUBTLE = "#334155"

function BarChart({ rows, labelKey, valueKey, maxBars = 14 }: { rows: Array<Record<string, string | number>>; labelKey: string; valueKey: string; maxBars?: number }) {
  const slice = rows.slice(-maxBars)
  const max = Math.max(1, ...slice.map((r) => Number(r[valueKey]) || 0))
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, minHeight: 120, paddingTop: 8 }}>
      {slice.map((r, i) => {
        const v = Number(r[valueKey]) || 0
        const h = Math.max(4, Math.round((v / max) * 96))
        const label = String(r[labelKey] ?? "")
        return (
          <div key={`${label}-${i}`} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div
              title={`${label}: ${v}`}
              style={{
                height: h,
                margin: "0 auto",
                maxWidth: 36,
                borderRadius: "4px 4px 0 0",
                background: theme.primary,
                opacity: v > 0 ? 1 : 0.2,
              }}
            />
            <div style={{ fontSize: 9, color: ADMIN_MUTED, marginTop: 4, lineHeight: 1.2, wordBreak: "break-all" }}>
              {label.length > 8 ? `${label.slice(0, 7)}…` : label}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.text }}>{v}</div>
          </div>
        )
      })}
    </div>
  )
}

function RankList({ title, rows, labelKey, valueKey }: { title: string; rows: Array<Record<string, string | number>>; labelKey: string; valueKey: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff" }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: theme.text }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: ADMIN_MUTED }}>No data yet.</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: theme.text }}>
          {rows.map((r, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{String(r[labelKey])}</span>
              <span style={{ color: ADMIN_MUTED }}> — {Number(r[valueKey])}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function AdminTrafficSection() {
  const { role } = useAuth()
  const allowed = role === "admin"
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [stats, setStats] = useState<SiteTrafficStats | null>(null)

  const load = useCallback(async () => {
    if (!allowed || !supabase) return
    setLoading(true)
    setErr("")
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("Sign in again to load traffic stats.")
      const data2 = await loadAdminSiteTrafficStats(token, 30)
      setStats(data2)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [allowed])

  useEffect(() => {
    void load()
  }, [load])

  if (!allowed) {
    return (
      <AdminSettingBlock id="admin:traffic:denied">
        <p style={{ color: theme.text }}>Admin access required.</p>
      </AdminSettingBlock>
    )
  }

  return (
    <div>
      <AdminSettingBlock id="admin:traffic:intro">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Site traffic</h1>
            <p style={{ color: theme.text, opacity: 0.85, margin: 0, fontSize: 14, lineHeight: 1.55, maxWidth: 720 }}>
              Page views on public marketing routes (home, pricing, signup, about, demo). Views are logged when visitors load those pages on your Vercel-hosted site.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} style={{ ...adminSecondaryButtonStyle, cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:traffic:setup">
        <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff", fontSize: 13, color: theme.text, lineHeight: 1.55 }}>
          <strong>Hosting setup</strong>
          <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>
              Run <code>supabase/site-traffic-events.sql</code> in the Supabase SQL editor (creates <code>site_traffic_events</code>).
            </li>
            <li>
              Deploy this app to Vercel — the <code>/api/site-traffic</code> route records views automatically (no extra Vercel Analytics required).
            </li>
            <li>
              Optional: enable <strong>Vercel Web Analytics</strong> in your Vercel project for a second dashboard; this tab uses first-party data stored in Supabase.
            </li>
          </ol>
          <p style={{ margin: "10px 0 0", color: ADMIN_MUTED, fontSize: 12 }}>
            Referrers come from the browser <code>document.referrer</code>. Hour-of-day charts use UTC. Country uses Vercel&apos;s <code>x-vercel-ip-country</code> header when present.
          </p>
        </div>
      </AdminSettingBlock>

      {err ? <p style={{ color: "#b91c1c", marginTop: 12 }}>{err}</p> : null}

      {loading && !stats ? (
        <p style={{ color: ADMIN_MUTED, marginTop: 12 }}>Loading traffic…</p>
      ) : stats ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <StatCard label="Today" value={stats.totalToday} accent="#0ea5e9" />
            <StatCard label="Last 7 days" value={stats.totalLast7Days} accent="#6366f1" />
            <StatCard label="Last 30 days" value={stats.totalLast30Days} accent="#059669" />
          </div>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: theme.text }}>Views per day (last 30 days)</h2>
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff" }}>
              <BarChart rows={stats.viewsByDay} labelKey="day" valueKey="count" maxBars={30} />
            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: theme.text }}>Views by hour (UTC, last 30 days)</h2>
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff" }}>
              <BarChart
                rows={stats.viewsByHourUtc.map((h) => ({ hour: `${String(h.hour).padStart(2, "0")}:00`, count: h.count }))}
                labelKey="hour"
                valueKey="count"
                maxBars={24}
              />
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 24 }}>
            <RankList title="Top referrers" rows={stats.topReferrers} labelKey="host" valueKey="count" />
            <RankList title="Top paths" rows={stats.topPaths} labelKey="path" valueKey="count" />
            <RankList title="Top countries" rows={stats.topCountries} labelKey="country" valueKey="count" />
          </div>

          {stats.dataSince ? (
            <p style={{ margin: "16px 0 0", fontSize: 12, color: ADMIN_MUTED }}>
              Oldest event in this window: {new Date(stats.dataSince).toLocaleString()}
            </p>
          ) : (
            <p style={{ margin: "16px 0 0", fontSize: 13, color: ADMIN_MUTED }}>
              No page views recorded yet. Visit the public homepage after deploying to seed data.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff", minWidth: 130 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent }}>{value}</div>
      <div style={{ fontSize: 11, color: ADMIN_SUBTLE, fontWeight: 600 }}>{label}</div>
    </div>
  )
}
