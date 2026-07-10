import { useEffect, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { loadDashboardReportPreviews, type DashboardReportPreviewSnapshot } from "../lib/dashboardReportPreviews"

type Props = {
  dataUserId: string | null
  isMobile: boolean
  onOpenReporting?: () => void
  labels: {
    title: string
    subtitle: string
    viewAll: string
    loading: string
    noUser: string
    openReport: string
  }
}

export default function DashboardReportsPreview({ dataUserId, isMobile, onOpenReporting, labels }: Props) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [reports, setReports] = useState<DashboardReportPreviewSnapshot[]>([])

  useEffect(() => {
    if (!supabase || !dataUserId) {
      setReports([])
      return
    }
    let cancelled = false
    setLoading(true)
    setErr("")
    void loadDashboardReportPreviews(supabase, dataUserId)
      .then((data) => {
        if (!cancelled) setReports(data)
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

  const gridCols = isMobile ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))"

  return (
    <section
      style={{
        maxWidth: isMobile ? 1100 : "100%",
        margin: "0 auto 8px",
        padding: isMobile ? "10px 10px 12px" : "12px 12px 14px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 14 : 15, fontWeight: 800, color: "#0f172a", letterSpacing: -0.02 }}>
            {labels.title}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4, maxWidth: 560 }}>{labels.subtitle}</p>
        </div>
        {onOpenReporting ? (
          <button
            type="button"
            onClick={onOpenReporting}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              color: theme.text,
              cursor: "pointer",
            }}
          >
            {labels.viewAll}
          </button>
        ) : null}
      </div>

      {!dataUserId ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>{labels.noUser}</p>
      ) : loading ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>{labels.loading}</p>
      ) : err ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#b91c1c" }}>{err}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginTop: 10 }}>
          {reports.map((report) => (
            <ReportPreviewCard key={report.id} report={report} onOpen={onOpenReporting} openLabel={labels.openReport} />
          ))}
        </div>
      )}
    </section>
  )
}

function ReportPreviewCard({
  report,
  onOpen,
  openLabel,
}: {
  report: DashboardReportPreviewSnapshot
  onOpen?: () => void
  openLabel: string
}) {
  return (
    <article
      style={{
        padding: "8px 9px",
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: "#f8fafc",
        minHeight: 72,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#475569", lineHeight: 1.3 }}>{report.title}</h3>
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            title={openLabel}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              color: "#64748b",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            →
          </button>
        ) : null}
      </div>
      <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", lineHeight: 1.35 }}>{report.summary}</p>
      {report.rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 10, color: "#cbd5e1" }}>{report.empty}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 10, lineHeight: 1.35 }}>
          {report.rows.slice(0, 3).map((row) => (
            <li
              key={`${report.id}-${row.label}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
                padding: "2px 0",
                borderTop: "1px solid #eef2f7",
              }}
            >
              <span style={{ fontWeight: 600, color: row.accent ?? theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.label}
              </span>
              <span style={{ color: "#64748b", flexShrink: 0 }}>{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}