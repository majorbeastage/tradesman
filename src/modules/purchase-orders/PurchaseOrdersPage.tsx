import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import {
  createPurchaseOrder,
  generatePurchaseOrderNumber,
  loadPurchaseOrdersFromProfile,
  type PurchaseOrderRecord,
} from "../../lib/purchaseOrders"

type Props = { setPage: (page: string) => void }

export default function PurchaseOrdersPage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [vendor, setVendor] = useState("")
  const [description, setDescription] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      setOrders(await loadPurchaseOrdersFromProfile(supabase, userId))
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
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 20px 40px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Purchase Orders</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
        Create purchase orders for your parts department. Future releases will tie POs to estimates, work orders, and
        org-chart approvals.
      </p>
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <section style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>New purchase order</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label style={labelStyle}>
            Vendor
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} style={theme.formInput} />
          </label>
          <label style={labelStyle}>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={theme.formInput} />
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

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Purchase orders on file</h2>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b" }}>Loading…</p>
        ) : orders.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b" }}>No purchase orders yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {orders.map((o) => (
              <div key={o.id} style={rowCard}>
                <div style={{ fontWeight: 800 }}>{o.po_number}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {o.vendor_name}
                  {o.description ? ` · ${o.description}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {o.status} · {new Date(o.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button type="button" onClick={() => setPage("dashboard")} style={{ ...secondaryBtn, marginTop: 16 }}>
        ← Dashboard
      </button>
    </div>
  )
}

const card: CSSProperties = { borderRadius: 12, border: `1px solid ${theme.border}`, background: "#f8fafc", padding: "16px 18px" }
const rowCard: CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 10, padding: "12px 14px", background: "#fff" }
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }
const primaryBtn: CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start" }
const secondaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }
