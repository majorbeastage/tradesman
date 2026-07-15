import { useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { formatUsdAmount, estimateDisplayStatus } from "../lib/customerDocumentStatus"
import type { WorkOrderRecord } from "../lib/workOrders"

export type PlatformFileSearchEstimate = {
  id: string
  customer_name: string
  title: string
  status: string | null
  total: number
  customer_id?: string | null
}

type SearchHit =
  | { kind: "work_order"; id: string; title: string; subtitle: string; meta: string; workOrderId: string }
  | { kind: "estimate"; id: string; title: string; subtitle: string; meta: string; quoteId: string; customerId?: string | null }

type Props = {
  workOrders: WorkOrderRecord[]
  estimates: PlatformFileSearchEstimate[]
  onOpenWorkOrder?: (order: WorkOrderRecord) => void
  onOpenEstimate?: (quoteId: string, customerId?: string | null) => void
}

export default function PlatformFileSearchPanel({
  workOrders,
  estimates,
  onOpenWorkOrder,
  onOpenEstimate,
}: Props) {
  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<"all" | "work_order" | "estimate">("all")

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out: SearchHit[] = []
    for (const o of workOrders) {
      const hay = [o.work_order_number, o.customer_name, o.estimate_title, o.status].join(" ").toLowerCase()
      if (q && !hay.includes(q)) continue
      out.push({
        kind: "work_order",
        id: o.id,
        workOrderId: o.id,
        title: o.work_order_number,
        subtitle: `${o.customer_name} · ${o.estimate_title}`,
        meta: `${new Date(o.created_at).toLocaleDateString()} · ${o.status}`,
      })
    }
    for (const e of estimates) {
      const hay = [e.customer_name, e.title, e.status, estimateDisplayStatus(e.status, null)].join(" ").toLowerCase()
      if (q && !hay.includes(q)) continue
      out.push({
        kind: "estimate",
        id: e.id,
        quoteId: e.id,
        customerId: e.customer_id,
        title: e.title,
        subtitle: e.customer_name,
        meta: `${estimateDisplayStatus(e.status, null)}${e.total > 0 ? ` · ${formatUsdAmount(e.total)}` : ""}`,
      })
    }
    return out
      .filter((h) => kindFilter === "all" || h.kind === kindFilter)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 24)
  }, [workOrders, estimates, query, kindFilter])

  return (
    <section
      style={{
        marginTop: 20,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>Files on file</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Search work orders, estimates, and more from one place.
          </p>
        </div>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          style={{ ...theme.formInput, padding: "6px 10px", fontSize: 12, minWidth: 140 }}
        >
          <option value="all">All types</option>
          <option value="work_order">Work orders</option>
          <option value="estimate">Estimates</option>
        </select>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by customer, job title, work order #, estimate name…"
        style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
      />
      {hits.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          {query.trim() ? "No matches for that search." : "Start typing to search your files."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {hits.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              type="button"
              onClick={() => {
                if (hit.kind === "work_order") {
                  const order = workOrders.find((o) => o.id === hit.workOrderId)
                  if (order) onOpenWorkOrder?.(order)
                } else {
                  onOpenEstimate?.(hit.quoteId, hit.customerId)
                }
              }}
              style={{
                textAlign: "left",
                display: "grid",
                gap: 2,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
                cursor: onOpenWorkOrder || onOpenEstimate ? "pointer" : "default",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: hit.kind === "work_order" ? "#0ea5e9" : "#f59e0b", letterSpacing: "0.04em" }}>
                {hit.kind === "work_order" ? "WORK ORDER" : "ESTIMATE"}
              </span>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{hit.title}</span>
              <span style={{ fontSize: 12, color: "#475569" }}>{hit.subtitle}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{hit.meta}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
