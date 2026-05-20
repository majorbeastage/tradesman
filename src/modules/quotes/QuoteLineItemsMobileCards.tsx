import type { CSSProperties, Dispatch, SetStateAction } from "react"
import { theme } from "../../styles/theme"
import { computeQuoteLineTotal, parseQuoteItemMetadata, type QuoteItemMetadata } from "../../lib/quoteItemMath"

export type QuoteLineDraft = {
  description: string
  quantity: string
  unit_price: string
  minimum: string
  manpower: string
  job_type_id: string
}

type Props = {
  items: any[]
  quoteLineDrafts: Record<string, QuoteLineDraft>
  setQuoteLineDrafts: Dispatch<SetStateAction<Record<string, QuoteLineDraft>>>
  showManpower: boolean
  getItemDisplay: (item: any) => { desc: string; qty: number; up: number; meta: QuoteItemMetadata }
  persistQuoteItemUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>
  mergeQuoteItemMetadataRow: (item: any, patch: Partial<QuoteItemMetadata>) => Record<string, unknown>
  deleteQuoteItemRow: (id: string) => Promise<void>
  estimateSubtotal: number
}

const mobileFieldLbl: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  marginBottom: 4,
}

const mobileInput: CSSProperties = {
  ...theme.formInput,
  padding: "8px 10px",
  width: "100%",
  boxSizing: "border-box",
  fontSize: 14,
}

export function QuoteLineItemsMobileCards({
  items,
  quoteLineDrafts,
  setQuoteLineDrafts,
  showManpower,
  getItemDisplay,
  persistQuoteItemUpdate,
  mergeQuoteItemMetadataRow,
  deleteQuoteItemRow,
  estimateSubtotal,
}: Props) {
  if (items.length === 0) {
    return (
      <p style={{ margin: "8px 0 0", padding: 12, color: "#334155", fontWeight: 500, fontSize: 13 }}>
        No line items yet — use Quick add quote items above to add a line.
      </p>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      {items.map((item, rowIdx) => {
        const { desc, qty, up, meta } = getItemDisplay(item)
        const dr = quoteLineDrafts[item.id]
        const baseMetaRow = parseQuoteItemMetadata(item.metadata)
        const qtyLive = Number.parseFloat(String(dr?.quantity ?? item.quantity ?? 0)) || 0
        const upDraft = String(dr?.unit_price ?? "").trim()
        const upLive = upDraft === "" ? 0 : Number.parseFloat(upDraft.replace(/,/g, "")) || 0
        const crewLive = showManpower
          ? Math.max(1, Number.parseInt(String(dr?.manpower ?? baseMetaRow.manpower ?? 1), 10) || 1)
          : Math.max(1, baseMetaRow.manpower ?? 1)
        const minDraftLive = (dr?.minimum ?? "").trim()
        let minimumLive = baseMetaRow.minimum_line_total
        if (minDraftLive !== "") {
          const n = Number.parseFloat(minDraftLive.replace(/[^0-9.]/g, ""))
          if (Number.isFinite(n) && n >= 0) minimumLive = n > 0 ? n : undefined
        }
        const metaLive: QuoteItemMetadata = {
          ...baseMetaRow,
          manpower: crewLive,
          minimum_line_total: minimumLive,
        }
        const lineTotalLive = computeQuoteLineTotal(qtyLive, upLive, metaLive).total
        const crew = meta.manpower ?? 1
        const serverDesc = String(item.description ?? item.item_description ?? item.name ?? "—")
        const serverQty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
        const serverUp =
          typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0

        const numCols = showManpower ? 4 : 3

        return (
          <div
            key={item.id}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              padding: 12,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>Line {rowIdx + 1}</span>
              <button
                type="button"
                onClick={() => void deleteQuoteItemRow(item.id)}
                style={{
                  fontSize: 12,
                  color: "#b91c1c",
                  background: "#fff",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                Remove
              </button>
            </div>
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={mobileFieldLbl}>Description</span>
              <input
                value={dr?.description ?? String(desc)}
                onChange={(e) => {
                  const v = e.target.value
                  setQuoteLineDrafts((prev) => {
                    const cur = prev[item.id]
                    if (!cur) return prev
                    return { ...prev, [item.id]: { ...cur, description: v } }
                  })
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== serverDesc) void persistQuoteItemUpdate(item.id, { description: v })
                }}
                style={mobileInput}
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))`,
                gap: 8,
                marginBottom: 10,
              }}
            >
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={mobileFieldLbl}>Qty</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={dr?.quantity ?? String(qty)}
                  onChange={(e) => {
                    const v = e.target.value
                    setQuoteLineDrafts((prev) => {
                      const cur = prev[item.id]
                      if (!cur) return prev
                      return { ...prev, [item.id]: { ...cur, quantity: v } }
                    })
                  }}
                  onBlur={(e) => {
                    const n = Number.parseFloat(e.target.value) || 0
                    if (Math.abs(n - serverQty) > 1e-9) void persistQuoteItemUpdate(item.id, { quantity: n })
                  }}
                  style={mobileInput}
                />
              </label>
              {showManpower ? (
                <label style={{ display: "block", minWidth: 0 }}>
                  <span style={mobileFieldLbl}>Crew</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={dr?.manpower ?? String(crew)}
                    onChange={(e) => {
                      const v = e.target.value
                      setQuoteLineDrafts((prev) => {
                        const cur = prev[item.id]
                        if (!cur) return prev
                        return { ...prev, [item.id]: { ...cur, manpower: v } }
                      })
                    }}
                    onBlur={(e) => {
                      const n = Math.max(1, parseInt(e.target.value, 10) || 1)
                      if (n !== crew)
                        void persistQuoteItemUpdate(item.id, {
                          metadata: mergeQuoteItemMetadataRow(item, { manpower: n }),
                        })
                    }}
                    style={mobileInput}
                  />
                </label>
              ) : null}
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={mobileFieldLbl}>Min $</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="—"
                  value={dr?.minimum ?? (meta.minimum_line_total != null && Number.isFinite(meta.minimum_line_total) ? String(meta.minimum_line_total) : "")}
                  onChange={(e) => {
                    const v = e.target.value
                    setQuoteLineDrafts((prev) => {
                      const cur = prev[item.id]
                      if (!cur) return prev
                      return { ...prev, [item.id]: { ...cur, minimum: v } }
                    })
                  }}
                  onBlur={(e) => {
                    const t = e.target.value.trim()
                    const n = t === "" ? null : Number.parseFloat(t)
                    const nextMin = n != null && Number.isFinite(n) && n > 0 ? n : null
                    const cur = meta.minimum_line_total
                    const same =
                      (nextMin == null && cur == null) ||
                      (nextMin != null && cur != null && Math.abs(nextMin - cur) < 1e-9)
                    if (!same)
                      void persistQuoteItemUpdate(item.id, {
                        metadata: mergeQuoteItemMetadataRow(item, {
                          minimum_line_total: nextMin ?? undefined,
                        }),
                      })
                  }}
                  style={mobileInput}
                />
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={mobileFieldLbl}>Unit $</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={dr?.unit_price ?? (Number.isFinite(up) && up !== 0 ? String(up) : "")}
                  onChange={(e) => {
                    const v = e.target.value
                    setQuoteLineDrafts((prev) => {
                      const cur = prev[item.id]
                      if (!cur) return prev
                      return { ...prev, [item.id]: { ...cur, unit_price: v } }
                    })
                  }}
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/,/g, "").trim()
                    const n = raw === "" ? 0 : Number.parseFloat(raw) || 0
                    if (Math.abs(n - serverUp) > 1e-9) void persistQuoteItemUpdate(item.id, { unit_price: n })
                    setQuoteLineDrafts((prev) => {
                      const cur = prev[item.id]
                      if (!cur) return prev
                      return { ...prev, [item.id]: { ...cur, unit_price: n === 0 ? "" : String(n) } }
                    })
                  }}
                  style={mobileInput}
                />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 8,
                borderTop: "1px dashed #e2e8f0",
                fontSize: 14,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              <span>Line total</span>
              <span>${lineTotalLive.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderRadius: 10,
          border: "2px solid #94a3b8",
          background: "#f1f5f9",
          fontWeight: 800,
          fontSize: 15,
          color: "#0f172a",
        }}
      >
        <span>Estimate subtotal</span>
        <span>${estimateSubtotal.toFixed(2)}</span>
      </div>
    </div>
  )
}
