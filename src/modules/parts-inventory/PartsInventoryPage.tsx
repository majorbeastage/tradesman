import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import {
  loadPartsInventoryFromProfile,
  savePartsInventoryToProfile,
  upsertPartsInventoryItem,
  type PartsInventoryItem,
} from "../../lib/partsInventory"
import { portalDashboardBackBtn } from "../../lib/portalNavButtons"
import Barcode from "../../components/Barcode"

type Props = { setPage?: (page: string) => void; embedded?: boolean }

/** Inventory number encoded in the barcode: the SKU when set, else a stable id-based code. */
function inventoryNumber(it: PartsInventoryItem): string {
  return it.sku.trim() || `INV-${it.id.slice(0, 8).toUpperCase()}`
}

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return ""
  return price.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

type InventoryEditDraft = {
  id: string
  sku: string
  name: string
  description: string
  price: string
  quantity: string
  unit: string
  location: string
}

export default function PartsInventoryPage({ setPage, embedded }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [items, setItems] = useState<PartsInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [sku, setSku] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("0")
  const [unit, setUnit] = useState("ea")
  const [location, setLocation] = useState("")
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<InventoryEditDraft | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

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
        description,
        price: price.trim() === "" ? null : Number(price),
        quantity: Number(quantity) || 0,
        unit,
        location,
      })
      setSku("")
      setName("")
      setDescription("")
      setPrice("")
      setQuantity("0")
      setLocation("")
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  function openEdit(it: PartsInventoryItem) {
    setExpandedId(it.id)
    setDraft({
      id: it.id,
      sku: it.sku,
      name: it.name,
      description: it.description,
      price: it.price !== null ? String(it.price) : "",
      quantity: String(it.quantity),
      unit: it.unit,
      location: it.location,
    })
  }

  function closeEdit() {
    setExpandedId(null)
    setDraft(null)
  }

  async function saveEdit() {
    if (!supabase || !userId || !draft) return
    setSavingId(draft.id)
    setErr("")
    try {
      await upsertPartsInventoryItem(supabase, userId, {
        id: draft.id,
        sku: draft.sku,
        name: draft.name,
        description: draft.description,
        price: draft.price.trim() === "" ? null : Number(draft.price),
        quantity: Number(draft.quantity) || 0,
        unit: draft.unit,
        location: draft.location,
      })
      await reload()
      closeEdit()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setSavingId(null)
    }
  }

  async function deleteItem(id: string) {
    if (!supabase || !userId) return
    if (!window.confirm("Delete this inventory item? This cannot be undone.")) return
    setSavingId(id)
    setErr("")
    try {
      await savePartsInventoryToProfile(supabase, userId, items.filter((x) => x.id !== id))
      await reload()
      if (expandedId === id) closeEdit()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: embedded ? 0 : "0 auto", padding: embedded ? 0 : "16px 20px 40px" }}>
      {!embedded ? <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Inventory</h1> : null}
      {!embedded ? (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
          Track parts and materials for your shop. Optional module — enable during onboarding when a parts department will
          use Tradesman.
        </p>
      ) : null}
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <section style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Add inventory item</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label style={labelStyle}>
            SKU / part # (used for the barcode)
            <input value={sku} onChange={(e) => setSku(e.target.value)} style={theme.formInput} />
          </label>
          <label style={labelStyle}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} style={theme.formInput} required />
          </label>
          <label style={labelStyle}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...theme.formInput, minHeight: 64, resize: "vertical" }}
              placeholder="Optional details, specs, notes…"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelStyle}>
              Price
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                style={theme.formInput}
              />
            </label>
            <label style={labelStyle}>
              Quantity
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" style={theme.formInput} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelStyle}>
              Unit
              <input value={unit} onChange={(e) => setUnit(e.target.value)} style={theme.formInput} />
            </label>
            <label style={labelStyle}>
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={theme.formInput} />
            </label>
          </div>
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
            {items.map((it) => {
              const expanded = expandedId === it.id
              const invNum =
                expanded && draft ? draft.sku.trim() || `INV-${it.id.slice(0, 8).toUpperCase()}` : inventoryNumber(it)
              return (
                <div key={it.id} style={rowCard}>
                  <button
                    type="button"
                    onClick={() => (expanded ? closeEdit() : openEdit(it))}
                    style={rowHeaderBtn}
                    aria-expanded={expanded}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span
                        aria-hidden
                        style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s", color: "#94a3b8", fontSize: 12 }}
                      >
                        ▸
                      </span>
                      <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.name}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: "#64748b" }}>
                      {it.price !== null ? <span style={{ color: "#0f766e", fontWeight: 700 }}>{formatPrice(it.price)}</span> : null}
                      <span>
                        Qty {it.quantity} {it.unit}
                      </span>
                      {it.location ? <span>{it.location}</span> : null}
                    </span>
                  </button>

                  {expanded && draft ? (
                    <div style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, paddingTop: 12, display: "grid", gap: 10 }}>
                      <label style={labelStyle}>
                        Title
                        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={theme.formInput} />
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={labelStyle}>
                          SKU / part # (barcode)
                          <input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} style={theme.formInput} />
                        </label>
                        <label style={labelStyle}>
                          Price
                          <input
                            value={draft.price}
                            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            style={theme.formInput}
                          />
                        </label>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <label style={labelStyle}>
                          Quantity
                          <input value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} type="number" style={theme.formInput} />
                        </label>
                        <label style={labelStyle}>
                          Unit
                          <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} style={theme.formInput} />
                        </label>
                        <label style={labelStyle}>
                          Location
                          <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} style={theme.formInput} />
                        </label>
                      </div>
                      <label style={labelStyle}>
                        Description
                        <textarea
                          value={draft.description}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          style={{ ...theme.formInput, minHeight: 64, resize: "vertical" }}
                          placeholder="Optional details, specs, notes…"
                        />
                      </label>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-end" }}>
                        <div style={{ flex: "0 0 auto" }}>
                          <Barcode value={invNum} />
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button type="button" onClick={() => void saveEdit()} disabled={savingId === it.id} style={primaryBtn}>
                            {savingId === it.id ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={closeEdit} disabled={savingId === it.id} style={secondaryBtn}>
                            Cancel
                          </button>
                          <button type="button" onClick={() => void deleteItem(it.id)} disabled={savingId === it.id} style={deleteBtn}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {!embedded && setPage ? (
        <button type="button" onClick={() => setPage("dashboard")} style={{ ...portalDashboardBackBtn, marginTop: 16 }}>
          ← Dashboard
        </button>
      ) : null}
    </div>
  )
}

const card: CSSProperties = { borderRadius: 12, border: `1px solid ${theme.border}`, background: "#f8fafc", padding: "16px 18px" }
const rowCard: CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 10, padding: "12px 14px", background: "#fff" }
const rowHeaderBtn: CSSProperties = {
  display: "flex",
  width: "100%",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "center",
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  color: theme.text,
}
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }
const primaryBtn: CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start" }
const secondaryBtn: CSSProperties = { padding: "10px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", color: theme.text, fontWeight: 600, cursor: "pointer" }
const deleteBtn: CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", fontWeight: 700, cursor: "pointer" }
