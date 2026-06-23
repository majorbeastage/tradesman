import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { formatUsdAmount } from "../../lib/customerDocumentStatus"
import {
  createWorkOrderFromQuote,
  generateWorkOrderNumber,
  loadSignedQuotesForWorkOrders,
  loadWorkOrdersFromProfile,
  type SignedQuotePick,
  type WorkOrderRecord,
} from "../../lib/workOrders"
import { queueQuotesCustomerPrefill } from "../../lib/workflowNavigation"
import { loadBusinessWorkflowFromMetadata, type BusinessWorkflowDoc } from "../../lib/businessWorkflow"
import WorkflowToolGuidanceBanner from "../../components/WorkflowToolGuidanceBanner"

type Props = {
  setPage?: (page: string) => void
  embedded?: boolean
}

export default function WorkOrdersPage({ setPage, embedded }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [orders, setOrders] = useState<WorkOrderRecord[]>([])
  const [signedQuotes, setSignedQuotes] = useState<SignedQuotePick[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [selectedQuoteId, setSelectedQuoteId] = useState("")
  const [woNumber, setWoNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [workflow, setWorkflow] = useState<BusinessWorkflowDoc | null>(null)

  useEffect(() => {
    if (!supabase || !userId) {
      setWorkflow(null)
      return
    }
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setWorkflow(loadBusinessWorkflowFromMetadata(data?.metadata)))
  }, [userId])

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      const [o, q] = await Promise.all([loadWorkOrdersFromProfile(supabase, userId), loadSignedQuotesForWorkOrders(supabase, userId)])
      setOrders(o)
      setSignedQuotes(q)
      setSelectedQuoteId((prev) => (prev && q.some((x) => x.id === prev) ? prev : q[0]?.id ?? ""))
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate() {
    if (!supabase || !userId || !selectedQuoteId) return
    const quote = signedQuotes.find((q) => q.id === selectedQuoteId)
    if (!quote) return
    setBusy(true)
    setErr("")
    try {
      await createWorkOrderFromQuote(supabase, userId, quote, woNumber.trim() || generateWorkOrderNumber())
      setWoNumber("")
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: embedded ? 0 : "0 auto", padding: embedded ? 0 : "16px 20px 40px" }}>
      {!embedded ? (
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: theme.text }}>Work Orders</h1>
      ) : null}
      {!embedded ? (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
          Create a work order from a fully signed estimate or proposal. Use your own work order number or let Tradesman
          generate one.
        </p>
      ) : null}

      <WorkflowToolGuidanceBanner tool="work_order" workflow={workflow} />

      {err ? <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{err}</p> : null}

      <section style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Create work order</h2>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Loading signed estimates…</p>
        ) : signedQuotes.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
            No fully signed estimates yet. When a customer approves an estimate, it will appear here.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Signed estimate / proposal
              <select value={selectedQuoteId} onChange={(e) => setSelectedQuoteId(e.target.value)} style={theme.formInput}>
                {signedQuotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.customer_name} — {q.title}
                    {q.total > 0 ? ` (${formatUsdAmount(q.total)})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Work order number (optional)
              <input
                value={woNumber}
                onChange={(e) => setWoNumber(e.target.value)}
                placeholder={generateWorkOrderNumber()}
                style={theme.formInput}
              />
            </label>
            <button type="button" disabled={busy || !selectedQuoteId} onClick={() => void handleCreate()} style={primaryBtn}>
              {busy ? "Creating…" : "Create work order"}
            </button>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Work orders on file</h2>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Loading…</p>
        ) : orders.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No work orders yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {orders.map((o) => (
              <div
                key={o.id}
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{o.work_order_number}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                      {o.customer_name} · {o.estimate_title}
                      {o.estimate_total != null ? ` · ${formatUsdAmount(o.estimate_total)}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      Created {new Date(o.created_at).toLocaleString()} · {o.status}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {o.customer_id ? (
                      <button
                        type="button"
                        style={secondaryBtn}
                        onClick={() => {
                          queueQuotesCustomerPrefill(o.customer_id!)
                          setPage?.("quotes")
                        }}
                      >
                        Open estimate
                      </button>
                    ) : null}
                    <button type="button" style={secondaryBtn} onClick={() => setPage?.("calendar")}>
                      Scheduling
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const card: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  padding: "16px 18px",
}

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  justifySelf: "start",
}

const secondaryBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: theme.text,
}
