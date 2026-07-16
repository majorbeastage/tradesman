import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { createPurchaseOrder, generatePurchaseOrderNumber } from "../../lib/purchaseOrders"
import { portalDashboardBackBtn } from "../../lib/portalNavButtons"
import { loadBusinessWorkflowFromMetadata, type BusinessWorkflowDoc } from "../../lib/businessWorkflow"
import WorkflowToolGuidanceBanner from "../../components/WorkflowToolGuidanceBanner"
import DocumentTemplateModal from "../../components/DocumentTemplateModal"
import { PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../../lib/purchaseOrderDocumentTemplate"
import { isTemplateItemVisible, mergeTemplateFormIntoMetadata, templateFormFromMetadata } from "../../lib/jobDocumentTemplate"

type Props = { setPage?: (page: string) => void; embedded?: boolean }

export default function PurchaseOrdersPage({ setPage, embedded }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [err, setErr] = useState("")
  const [vendor, setVendor] = useState("")
  const [description, setDescription] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [workflow, setWorkflow] = useState<BusinessWorkflowDoc | null>(null)
  const [templateFormValues, setTemplateFormValues] = useState<Record<string, string>>({})
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)

  const isPoTemplateItemVisible = useCallback(
    (item: (typeof PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS)[number]) =>
      isTemplateItemVisible(item, PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS, templateFormValues),
    [templateFormValues],
  )

  const loadTemplateFromProfile = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    setTemplateFormValues(templateFormFromMetadata(PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS, meta))
    setWorkflow(loadBusinessWorkflowFromMetadata(meta))
  }, [userId])

  useEffect(() => {
    void loadTemplateFromProfile()
  }, [loadTemplateFromProfile])

  async function handleCreate() {
    if (!supabase || !userId) return
    setBusy(true)
    setErr("")
    try {
      await createPurchaseOrder(supabase, userId, {
        po_number: poNumber.trim() || undefined,
        vendor_name: vendor,
        description,
      })
      setVendor("")
      setDescription("")
      setPoNumber("")
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
      {!embedded ? <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Purchase Orders</h1> : null}
      {!embedded ? (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
          Create purchase orders for parts and materials. Use <strong>Document fields</strong> to control what appears on
          the PDF. Find and open existing purchase orders in <strong>Document search</strong>.
        </p>
      ) : null}
      <WorkflowToolGuidanceBanner tool="purchase_order" workflow={workflow} />
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <section style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>New purchase order</h2>
          <button type="button" style={secondaryBtn} onClick={() => setTemplateModalOpen(true)}>
            Document fields…
          </button>
        </div>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label style={labelStyle}>
            Vendor
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} style={theme.formInput} />
          </label>
          <label style={labelStyle}>
            Description / parts list
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...theme.formInput, resize: "vertical" }}
              placeholder="One part per line, or leave blank to pull material lines from the linked estimate"
            />
          </label>
          <label style={labelStyle}>
            PO number (optional)
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder={generatePurchaseOrderNumber()} style={theme.formInput} />
          </label>
          <button type="button" disabled={busy || !vendor.trim()} onClick={() => void handleCreate()} style={primaryBtn}>
            {busy ? "Creating…" : "Create PO"}
          </button>
        </div>
      </section>

      {!embedded && setPage ? (
        <button type="button" onClick={() => setPage("dashboard")} style={{ ...portalDashboardBackBtn, marginTop: 16 }}>
          ← Dashboard
        </button>
      ) : null}

      <DocumentTemplateModal
        open={templateModalOpen}
        title="Purchase order document fields"
        subtitle="Choose vendor, part numbers, quantities, and other sections for your PO PDFs."
        items={PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS}
        formValues={templateFormValues}
        setFormValue={(id, value) => setTemplateFormValues((prev) => ({ ...prev, [id]: value }))}
        isItemVisible={isPoTemplateItemVisible}
        saving={templateSaving}
        onClose={() => setTemplateModalOpen(false)}
        onSave={() => void saveDocumentTemplate()}
      />
    </div>
  )
}

const card: CSSProperties = { borderRadius: 12, border: `1px solid ${theme.border}`, background: "#f8fafc", padding: "16px 18px" }
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }
const primaryBtn: CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start" }
const secondaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: theme.text }
