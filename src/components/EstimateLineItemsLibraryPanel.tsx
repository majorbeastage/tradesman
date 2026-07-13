import { useCallback, useEffect, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { useIsMobile } from "../hooks/useIsMobile"
import {
  loadEstimateLinePresetsForUser,
  loadJobTypesForUser,
  persistEstimateLinePresetsForUser,
} from "../lib/jobTypesApi"
import type { AssistantHandoffPayload } from "../lib/assistantHandoff"
import EstimateLineItemsHandoffPanel from "./EstimateLineItemsHandoffPanel"
import { eliUnitSuffix, type EstimateLinePresetRow } from "../lib/estimateLinePresets"
import { COMMON_LINE_UNITS, parseSpokenLineItem } from "../lib/parseSpokenLineItem"

const ELI_LINE_KINDS = ["labor", "material", "travel", "misc"] as const
type EliLineKind = (typeof ELI_LINE_KINDS)[number]
const ELI_KIND_LABEL: Record<EliLineKind, string> = {
  labor: "Labor",
  material: "Materials",
  travel: "Travel expenses",
  misc: "Miscellaneous",
}

type Props = {
  userId: string
  handoff?: AssistantHandoffPayload | null
  onDismissHandoff?: () => void
  onJobTypeFollowUp?: (jobTypeName: string, presetIds: string[]) => void
  onSaved?: (rows: EstimateLinePresetRow[]) => void
}

const inputDark = { ...theme.formInput, color: "#0f172a", fontWeight: 600 } as const

export default function EstimateLineItemsLibraryPanel({
  userId,
  handoff = null,
  onDismissHandoff,
  onJobTypeFollowUp,
  onSaved,
}: Props) {
  const isMobile = useIsMobile()
  const [draft, setDraft] = useState<EstimateLinePresetRow[]>([])
  const [jobTypes, setJobTypes] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [eliTitle, setEliTitle] = useState("")
  const [eliDescribe, setEliDescribe] = useState("")
  const [eliSimpleKind, setEliSimpleKind] = useState<EliLineKind>("labor")
  const [eliSimpleUnit, setEliSimpleUnit] = useState("hours")
  const [eliCustomUnit, setEliCustomUnit] = useState("")
  const [eliSimpleQty, setEliSimpleQty] = useState("1")
  const [eliSimplePrice, setEliSimplePrice] = useState("")
  const [eliMinEnabled, setEliMinEnabled] = useState(false)
  const [eliMinBasis, setEliMinBasis] = useState<"cost" | "quantity">("cost")
  const [eliMinValue, setEliMinValue] = useState("")
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({})
  const [linkPick, setLinkPick] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    const [presets, jt] = await Promise.all([
      loadEstimateLinePresetsForUser(supabase, userId),
      loadJobTypesForUser(supabase, userId),
    ])
    setDraft(presets.map((r) => ({ ...r })))
    setJobTypes(jt.rows.map((r) => ({ id: r.id, name: r.name })))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  function applyDescribeParse() {
    const parsed = parseSpokenLineItem(eliDescribe)
    if (!parsed) {
      alert("Could not parse that description — try including qty, price, and unit (e.g. “15 dollar charge for 1 acre fuel”).")
      return
    }
    setEliTitle(parsed.title)
    setEliSimpleQty(String(parsed.quantity))
    setEliSimplePrice(parsed.unit_price.toFixed(2))
    setEliSimpleUnit(parsed.unit_basis)
    if (!COMMON_LINE_UNITS.some((u) => u.id === parsed.unit_basis)) {
      setEliSimpleUnit("custom")
      setEliCustomUnit(parsed.unit_basis)
    }
    const kind = (parsed.line_kind === "material" || parsed.line_kind === "materials"
      ? "material"
      : parsed.line_kind === "travel"
        ? "travel"
        : parsed.line_kind === "misc"
          ? "misc"
          : "labor") as EliLineKind
    setEliSimpleKind(kind)
    if (parsed.minimum_line_total != null && parsed.minimum_line_total > 0) {
      setEliMinEnabled(true)
      setEliMinBasis("cost")
      setEliMinValue(parsed.minimum_line_total.toFixed(2))
    } else if (parsed.minimum_quantity != null && parsed.minimum_quantity > 0) {
      setEliMinEnabled(true)
      setEliMinBasis("quantity")
      setEliMinValue(String(parsed.minimum_quantity))
    }
  }

  function appendSimpleLine() {
    const qty = Number.parseFloat(String(eliSimpleQty).replace(/[^0-9.]/g, "")) || 0
    const price = Number.parseFloat(String(eliSimplePrice).replace(/[^0-9.]/g, "")) || 0
    if (qty <= 0) {
      alert("Enter how many units.")
      return
    }
    const unit =
      eliSimpleUnit === "custom" ? eliCustomUnit.trim() || "each" : eliSimpleUnit.trim() || "hours"
    const title = eliTitle.trim() || ELI_KIND_LABEL[eliSimpleKind]
    const line_kind: EstimateLinePresetRow["line_kind"] =
      eliSimpleKind === "material" ? "material" : eliSimpleKind === "travel" ? "travel" : eliSimpleKind === "misc" ? "misc" : "labor"
    const minVal = Number.parseFloat(String(eliMinValue).replace(/[^0-9.]/g, ""))
    const minOk = eliMinEnabled && Number.isFinite(minVal) && minVal > 0
    setDraft((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        description: title,
        quantity: qty,
        unit_price: price,
        linked_job_type_ids: [],
        line_kind,
        unit_basis: unit,
        ...(minOk && eliMinBasis === "cost" ? { minimum_line_total: minVal, minimum_basis: "cost" as const } : {}),
        ...(minOk && eliMinBasis === "quantity" ? { minimum_quantity: minVal, minimum_basis: "quantity" as const } : {}),
      },
    ])
    setEliTitle("")
    setEliDescribe("")
    setEliSimplePrice("")
    setEliMinEnabled(false)
    setEliMinValue("")
  }

  async function saveDraft() {
    if (!supabase) return
    setSaving(true)
    setMessage("")
    const cleaned = draft.filter((r) => r.description.trim())
    const { error, rows } = await persistEstimateLinePresetsForUser(supabase, userId, cleaned)
    setSaving(false)
    if (error) {
      alert(error)
      return
    }
    setDraft(rows)
    setMessage("Saved line items.")
    onSaved?.(rows)
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>Loading saved line items…</p>
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {handoff ? (
        <EstimateLineItemsHandoffPanel
          handoff={handoff}
          existingLines={draft.map((r) => ({ description: r.description }))}
          onAddPresets={(rows) => setDraft((prev) => [...prev, ...rows])}
          onDismiss={() => onDismissHandoff?.()}
          onJobTypeFollowUp={onJobTypeFollowUp}
        />
      ) : null}
      <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
        Build <strong>saved lines</strong> here, then use them from <strong>Quote items → Saved lines</strong> on any open estimate.
        Link lines to job types so they apply automatically when you pick a job type.
      </p>

      <div style={{ padding: 14, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#f8fafc", display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>Add a saved line</div>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
          Describe it (optional — AI fills the fields)
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
            <input
              value={eliDescribe}
              onChange={(e) => setEliDescribe(e.target.value)}
              placeholder='e.g. "15 dollar charge for 1 acre fuel and equipment"'
              style={{ ...inputDark, flex: 1, minWidth: 200 }}
            />
            <button
              type="button"
              onClick={applyDescribeParse}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#eef2ff",
                color: "#3730a3",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Parse
            </button>
          </div>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
          Line item title
          <input value={eliTitle} onChange={(e) => setEliTitle(e.target.value)} placeholder="Per Acre Fuel and Equipment Charge" style={inputDark} />
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 90px) minmax(0, 110px)",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            Line type
            <select value={eliSimpleKind} onChange={(e) => setEliSimpleKind(e.target.value as EliLineKind)} style={inputDark}>
              {ELI_LINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ELI_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            Unit
            <select
              value={COMMON_LINE_UNITS.some((u) => u.id === eliSimpleUnit) ? eliSimpleUnit : "custom"}
              onChange={(e) => setEliSimpleUnit(e.target.value)}
              style={inputDark}
            >
              {COMMON_LINE_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            Qty
            <input value={eliSimpleQty} onChange={(e) => setEliSimpleQty(e.target.value)} style={inputDark} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            $ / unit
            <input value={eliSimplePrice} onChange={(e) => setEliSimplePrice(e.target.value)} style={inputDark} placeholder="15.00" />
          </label>
        </div>
        {eliSimpleUnit === "custom" || !COMMON_LINE_UNITS.some((u) => u.id === eliSimpleUnit) ? (
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            Custom unit label
            <input value={eliCustomUnit || eliSimpleUnit} onChange={(e) => { setEliSimpleUnit("custom"); setEliCustomUnit(e.target.value) }} style={inputDark} placeholder="acres, panels, fixtures…" />
          </label>
        ) : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "auto minmax(120px, 160px) minmax(100px, 140px) auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, color: "#0f172a", paddingBottom: 8 }}>
            <input type="checkbox" checked={eliMinEnabled} onChange={(e) => setEliMinEnabled(e.target.checked)} />
            Minimum charge
          </label>
          {eliMinEnabled ? (
            <>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                Min type
                <select value={eliMinBasis} onChange={(e) => setEliMinBasis(e.target.value as "cost" | "quantity")} style={inputDark}>
                  <option value="cost">Dollar amount (cost)</option>
                  <option value="quantity">Quantity</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                {eliMinBasis === "cost" ? "Dollar amount" : "Min quantity"}
                <input value={eliMinValue} onChange={(e) => setEliMinValue(e.target.value)} style={inputDark} placeholder={eliMinBasis === "cost" ? "60.00" : "1"} />
              </label>
            </>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={appendSimpleLine}
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Add to list
          </button>
        </div>
      </div>

      <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>Your saved lines</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {draft.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No saved lines yet.</p>
        ) : (
          draft.map((row, idx) => {
            const expanded = expandedById[row.id] === true
            const linkedLabels = (row.linked_job_type_ids ?? [])
              .map((id) => jobTypes.find((j) => j.id === id)?.name ?? "")
              .filter(Boolean)
            return (
              <div
                key={row.id}
                style={{
                  padding: 14,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f9fafb",
                  display: "grid",
                  gap: expanded ? 10 : 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedById((p) => ({ ...p, [row.id]: !expanded }))}
                    style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", lineHeight: 1.35 }}>
                      {row.description.trim() || "Line"}
                    </span>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>
                      {row.quantity} {eliUnitSuffix(row.unit_basis)} @ ${Number(row.unit_price).toFixed(2)}
                      {row.minimum_basis === "quantity" && row.minimum_quantity
                        ? ` · min qty ${row.minimum_quantity}`
                        : row.minimum_line_total != null && row.minimum_line_total > 0
                          ? ` · min $${Number(row.minimum_line_total).toFixed(2)}`
                          : ""}
                    </span>
                    {linkedLabels.length > 0 ? (
                      <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 4 }}>Job types: {linkedLabels.join(", ")}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ fontSize: 12, color: "#b91c1c", background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px", fontWeight: 700 }}
                  >
                    Delete
                  </button>
                </div>
                {expanded ? (
                  <>
                    <input
                      value={row.description}
                      onChange={(e) => setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))}
                      style={inputDark}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "90px 110px 120px 120px", gap: 8 }}>
                      <input
                        value={row.quantity === 0 ? "" : String(row.quantity)}
                        onChange={(e) => {
                          const q = Number.parseFloat(e.target.value) || 0
                          setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: q } : r)))
                        }}
                        style={inputDark}
                        placeholder="Qty"
                      />
                      <input
                        value={row.unit_price === 0 ? "" : Number(row.unit_price).toFixed(2)}
                        onChange={(e) => {
                          const p = Number.parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0
                          setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: p } : r)))
                        }}
                        style={inputDark}
                        placeholder="$/unit"
                      />
                      <select
                        value={row.unit_basis ?? "hours"}
                        onChange={(e) => setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_basis: e.target.value } : r)))}
                        style={inputDark}
                      >
                        {COMMON_LINE_UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                        {row.unit_basis && !COMMON_LINE_UNITS.some((u) => u.id === row.unit_basis) ? (
                          <option value={row.unit_basis}>{row.unit_basis}</option>
                        ) : null}
                      </select>
                      <select
                        value={row.line_kind ?? "labor"}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, line_kind: e.target.value as EstimateLinePresetRow["line_kind"] } : r)),
                          )
                        }
                        style={inputDark}
                      >
                        {ELI_LINE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {ELI_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {jobTypes.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <select
                          value={linkPick[row.id] ?? ""}
                          onChange={(e) => setLinkPick((p) => ({ ...p, [row.id]: e.target.value }))}
                          style={{ ...inputDark, minWidth: 160 }}
                        >
                          <option value="">Link to job type…</option>
                          {jobTypes.map((jt) => (
                            <option key={jt.id} value={jt.id}>
                              {jt.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const jtId = linkPick[row.id]?.trim()
                            if (!jtId) return
                            setDraft((prev) =>
                              prev.map((r, i) => {
                                if (i !== idx) return r
                                const set = new Set(r.linked_job_type_ids ?? [])
                                set.add(jtId)
                                return { ...r, linked_job_type_ids: Array.from(set) }
                              }),
                            )
                          }}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 6,
                            border: "1px solid #0f172a",
                            background: "#0f172a",
                            color: "#fff",
                            fontWeight: 800,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Add link
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      {message ? <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>{message}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void saveDraft()}
        style={{
          justifySelf: "start",
          padding: "10px 16px",
          background: theme.primary,
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontWeight: 700,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save line items"}
      </button>
    </div>
  )
}
