import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { loadPartsInventoryFromProfile, upsertPartsInventoryItem, type PartsInventoryItem } from "../../lib/partsInventory"

type Props = { setPage: (page: string) => void }

export default function PartsInventoryPage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [items, setItems] = useState<PartsInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [sku, setSku] = useState("")
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("0")
  const [unit, setUnit] = useState("ea")
  const [location, setLocation] = useState("")
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      setItems(await loadPartsInventoryFromProfile(supabase, userId))
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleAdd() {
    if (!supabase || !userId || !name.trim()) return
    setBusy(true)
    setErr("")
    try {
      await upsertPartsInventoryItem(supabase, userId, {
        sku,
        name,
        quantity: Number(quantity) || 0,
        unit,
        location,
      })
      setSku("")
      setName("")
      setQuantity("0")
      setLocation("")
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 20px 40px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Parts &amp; Materials Inventory</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
        Track parts and materials for your shop. Optional module — enable during onboarding when a parts department will
        use Tradesman.
      </p>
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <section style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Add inventory item</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label style={labelStyle}>
            SKU / part #
            <input value={sku} onChange={(e) => setSku(e.target.value)} style={theme.formInput} />
          </label>
          <label style={labelStyle}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} style={theme.formInput} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelStyle}>
              Quantity
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" style={theme.formInput} />
            </label>
            <label style={labelStyle}>
              Unit
              <input value={unit} onChange={(e) => setUnit(e.target.value)} style={theme.formInput} />
            </label>
          </div>
          <label style={labelStyle}>
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={theme.formInput} />
          </label>
          <button type="button" disabled={busy || !name.trim()} onClick={() => void handleAdd()} style={primaryBtn}>
            {busy ? "Saving…" : "Add item"}
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Inventory</h2>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b" }}>No parts on file yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((it) => (
              <div key={it.id} style={rowCard}>
                <div style={{ fontWeight: 800 }}>
                  {it.name}
                  {it.sku ? <span style={{ fontWeight: 600, color: "#64748b" }}> · {it.sku}</span> : null}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Qty {it.quantity} {it.unit}
                  {it.location ? ` · ${it.location}` : ""}
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
