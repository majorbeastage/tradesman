import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { formatUsdAmount, estimateDisplayStatus } from "../../lib/customerDocumentStatus"
import {
  createWorkOrderForCustomer,
  createWorkOrderFromQuote,
  generateWorkOrderNumber,
  loadQuotesForWorkOrders,
  WORK_ORDER_NO_ESTIMATE,
  type SignedQuotePick,
} from "../../lib/workOrders"
import { consumeWorkOrdersCustomerPrefill } from "../../lib/workflowNavigation"
import { loadBusinessWorkflowFromMetadata, type BusinessWorkflowDoc } from "../../lib/businessWorkflow"
import WorkflowToolGuidanceBanner from "../../components/WorkflowToolGuidanceBanner"
import DocumentTemplateModal from "../../components/DocumentTemplateModal"
import { WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../../lib/workOrderDocumentTemplate"
import { isTemplateItemVisible, mergeTemplateFormIntoMetadata, templateFormFromMetadata } from "../../lib/jobDocumentTemplate"

type Props = {
  setPage?: (page: string) => void
  embedded?: boolean
}

export default function WorkOrdersPage({ embedded }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [quotes, setQuotes] = useState<SignedQuotePick[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [selectedQuoteId, setSelectedQuoteId] = useState("")
  const [filterCustomerId, setFilterCustomerId] = useState("")
  const [prefillCustomerName, setPrefillCustomerName] = useState("")
  const [customerOnlyJobTitle, setCustomerOnlyJobTitle] = useState("")
  const [woNumber, setWoNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [workflow, setWorkflow] = useState<BusinessWorkflowDoc | null>(null)
  const [templateFormValues, setTemplateFormValues] = useState<Record<string, string>>({})
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)

  const isWoTemplateItemVisible = useCallback(
    (item: (typeof WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS)[number]) =>
      isTemplateItemVisible(item, WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS, templateFormValues),
    [templateFormValues],
  )

  const loadTemplateFromProfile = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    setTemplateFormValues(templateFormFromMetadata(WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS, meta))
    setWorkflow(loadBusinessWorkflowFromMetadata(meta))
  }, [userId])

  useEffect(() => {
    void loadTemplateFromProfile()
  }, [loadTemplateFromProfile])

  useEffect(() => {
    const customerId = consumeWorkOrdersCustomerPrefill()
    if (customerId) setFilterCustomerId(customerId)
  }, [])

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      const q = await loadQuotesForWorkOrders(supabase, userId, filterCustomerId || null)
      setQuotes(q)
      if (filterCustomerId) {
        const match = q.find((x) => x.customer_id === filterCustomerId)
        if (match?.customer_name) setPrefillCustomerName(match.customer_name)
      }
      setSelectedQuoteId((prev) => {
        if (prev === WORK_ORDER_NO_ESTIMATE) return prev
        if (prev && q.some((x) => x.id === prev)) return prev
        return q[0]?.id ?? (filterCustomerId ? WORK_ORDER_NO_ESTIMATE : "")
      })
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId, filterCustomerId])

  useEffect(() => {
    if (!supabase || !filterCustomerId) return
    void supabase
      .from("customers")
      .select("display_name")
      .eq("id", filterCustomerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name?.trim()) setPrefillCustomerName(data.display_name.trim())
      })
  }, [filterCustomerId])

  const customerFilterOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const q of quotes) {
      if (q.customer_id) map.set(q.customer_id, q.customer_name)
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [quotes])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate() {
    if (!supabase || !userId || !selectedQuoteId) return
    setBusy(true)
    setErr("")
    try {
      if (selectedQuoteId === WORK_ORDER_NO_ESTIMATE) {
        if (!filterCustomerId) {
          setErr("Select a customer filter before creating a work order without an estimate.")
          return
        }
        await createWorkOrderForCustomer(supabase, userId, {
          customerId: filterCustomerId,
          customerName: prefillCustomerName || customerFilterOptions.find((c) => c.id === filterCustomerId)?.name || "Customer",
          workOrderNumber: woNumber,
          jobTitle: customerOnlyJobTitle,
        })
      } else {
        const quote = quotes.find((q) => q.id === selectedQuoteId)
        if (!quote) return
        await createWorkOrderFromQuote(supabase, userId, quote, woNumber.trim() || generateWorkOrderNumber())
      }
      setWoNumber("")
      setCustomerOnlyJobTitle("")
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveDocumentTemplate() {
    if (!supabase || !userId) return
    setTemplateSaving(true)
    try {
      const { data: row, error: loadErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (loadErr) throw loadErr
      const prevMeta =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {}
      const { error } = await supabase
        .from("profiles")
        .update({ metadata: mergeTemplateFormIntoMetadata(prevMeta, templateFormValues) })
        .eq("id", userId)
      if (error) throw error
      setTemplateModalOpen(false)
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setTemplateSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: embedded ? 0 : "0 auto", padding: embedded ? 0 : "16px 20px 40px" }}>
      {!embedded ? (
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: theme.text }}>Work Orders</h1>
      ) : null}
      {!embedded ? (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
          Create work orders from signed estimates and open a printable document with customer details, schedule,
          materials, and estimate lines. Use <strong>Document fields</strong> to choose what appears on the PDF. Find and
          open existing work orders in <strong>Document search</strong>.
        </p>
      ) : null}

      <WorkflowToolGuidanceBanner tool="work_order" workflow={workflow} />

      {err ? <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{err}</p> : null}

      <section style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Create work order</h2>
          <button type="button" style={secondaryBtn} onClick={() => setTemplateModalOpen(true)}>
            Document fields…
          </button>
        </div>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 12, maxWidth: 520 }}>
          <select
            value={filterCustomerId}
            onChange={(e) => setFilterCustomerId(e.target.value)}
            style={theme.formInput}
            aria-label="Customer"
          >
            <option value="">All customers</option>
            {customerFilterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Loading estimates…</p>
        ) : !filterCustomerId && quotes.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
            Select a customer above, or add an estimate first. You can also create a customer-only work order after choosing a customer.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select
              value={selectedQuoteId}
              onChange={(e) => setSelectedQuoteId(e.target.value)}
              style={theme.formInput}
              aria-label="Estimate or customer-only work order"
            >
              {filterCustomerId ? (
                <option value={WORK_ORDER_NO_ESTIMATE}>No estimate — customer work order only</option>
              ) : null}
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.customer_name} — {q.title} ({estimateDisplayStatus(q.status, null)})
                  {q.total > 0 ? ` · ${formatUsdAmount(q.total)}` : ""}
                </option>
              ))}
            </select>
            {selectedQuoteId === WORK_ORDER_NO_ESTIMATE ? (
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                Job title (optional)
                <input
                  value={customerOnlyJobTitle}
                  onChange={(e) => setCustomerOnlyJobTitle(e.target.value)}
                  placeholder="Describe the work order"
                  style={theme.formInput}
                />
              </label>
            ) : null}
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

      <DocumentTemplateModal
        open={templateModalOpen}
        title="Work order document fields"
        subtitle="Choose which sections appear on every work order PDF. Your choices are saved to your account."
        items={WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS}
        formValues={templateFormValues}
        setFormValue={(id, value) => setTemplateFormValues((prev) => ({ ...prev, [id]: value }))}
        isItemVisible={isWoTemplateItemVisible}
        saving={templateSaving}
        onClose={() => setTemplateModalOpen(false)}
        onSave={() => void saveDocumentTemplate()}
      />
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
