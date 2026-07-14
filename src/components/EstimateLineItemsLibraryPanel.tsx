import { useCallback, useEffect, useMemo, useState } from "react"
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
import { COMMON_LINE_UNITS } from "../lib/parseSpokenLineItem"

const ELI_LINE_KINDS = ["labor", "material", "travel", "misc"] as const
type EliLineKind = (typeof ELI_LINE_KINDS)[number]
const ELI_KIND_LABEL: Record<EliLineKind, string> = {
  labor: "Labor",
  material: "Materials",
  travel: "Travel expenses",
  misc: "Miscellaneous",
}
const ELI_KIND_ACCENT: Record<EliLineKind, string> = {
  labor: "#0ea5e9",
  material: "#f59e0b",
  travel: "#8b5cf6",
  misc: "#64748b",
}

type MinBasis = "cost" | "quantity" | "hours"

type Props = {
  userId: string
  handoff?: AssistantHandoffPayload | null
  onDismissHandoff?: () => void
  onJobTypeFollowUp?: (jobTypeName: string, presetIds: string[]) => void
  onSaved?: (rows: EstimateLinePresetRow[]) => void
}

const inputDark = { ...theme.formInput, color: "#0f172a", fontWeight: 600 } as const

function kindOf(row: EstimateLinePresetRow): EliLineKind {
  const k = (row.line_kind ?? "").toLowerCase()
  if (k === "material" || k === "materials") return "material"
  if (k === "travel") return "travel"
  if (k === "misc") return "misc"
  return "labor"
}

function compactMinLabel(row: EstimateLinePresetRow): string | null {
  if (row.minimum_basis === "hours" && row.minimum_quantity)
    return `min ${row.minimum_quantity} hr`
  if (row.minimum_basis === "quantity" && row.minimum_quantity)
    return `min qty ${row.minimum_quantity}`
  if (row.minimum_line_total != null && row.minimum_line_total > 0)
    return `min $${Number(row.minimum_line_total).toFixed(0)}`
  return null
}

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
  const [eliSimpleKind, setEliSimpleKind] = useState<EliLineKind>("labor")
  const [eliSimpleUnit, setEliSimpleUnit] = useState("hours")
  const [eliCustomUnit, setEliCustomUnit] = useState("")
  const [eliSimpleQty, setEliSimpleQty] = useState("1")
  const [eliSimplePrice, setEliSimplePrice] = useState("")
  const [eliMinEnabled, setEliMinEnabled] = useState(false)
  const [eliMinBasis, setEliMinBasis] = useState<MinBasis>("cost")
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

  const columns = useMemo(() => {
    const buckets: Record<EliLineKind, Array<{ row: EstimateLinePresetRow; idx: number }>> = {
      labor: [],
      material: [],
      travel: [],
      misc: [],
    }
    draft.forEach((row, idx) => {
      buckets[kindOf(row)].push({ row, idx })
    })
    return buckets
  }, [draft])

  function appendSimpleLine() {
    const qty = Number.parseFloat(String(eliSimpleQty).replace(/[^0-9.]/g, "")) || 0
    const price = Number.parseFloat(String(eliSimplePrice).replace(/[^0-9.]/g, "")) || 0
    if (!eliTitle.trim()) {
      alert("Enter a line item title.")
      return
    }
    if (qty <= 0) {
      alert("Enter how many units.")
      return
    }
    const unit =
      eliSimpleUnit === "custom" ? eliCustomUnit.trim() || "each" : eliSimpleUnit.trim() || "hours"
    const line_kind: EstimateLinePresetRow["line_kind"] =
      eliSimpleKind === "material"
        ? "material"
        : eliSimpleKind === "travel"
          ? "travel"
          : eliSimpleKind === "misc"
            ? "misc"
            : "labor"
    const minVal = Number.parseFloat(String(eliMinValue).replace(/[^0-9.]/g, ""))
    const minOk = eliMinEnabled && Number.isFinite(minVal) && minVal > 0
    setDraft((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        description: eliTitle.trim(),
        quantity: qty,
        unit_price: price,
        linked_job_type_ids: [],
        line_kind,
        unit_basis: unit,
        ...(minOk && eliMinBasis === "cost" ? { minimum_line_total: minVal, minimum_basis: "cost" as const } : {}),
        ...(minOk && eliMinBasis === "quantity"
          ? { minimum_quantity: minVal, minimum_basis: "quantity" as const }
          : {}),
        ...(minOk && eliMinBasis === "hours"
          ? { minimum_quantity: minVal, minimum_basis: "hours" as const }
          : {}),
      },
    ])
    setEliTitle("")
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

  function renderTile(row: EstimateLinePresetRow, idx: number) {
    const expanded = expandedById[row.id] === true
    const accent = ELI_KIND_ACCENT[kindOf(row)]
    const minLabel = compactMinLabel(row)
    const linkedCount = (row.linked_job_type_ids ?? []).length
    return (
      <div
        key={row.id}
        style={{
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
          overflow: "hidden",
          display: "grid",
          gap: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setExpandedById((p) => ({ ...p, [row.id]: !expanded }))}
          style={{
            textAlign: "left",
            background: "#fff",
            border: "none",
            borderLeft: `3px solid ${accent}`,
            padding: "8px 10px",
            cursor: "pointer",
            font: "inherit",
            display: "grid",
            gap: 2,
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: 12,
              color: "#0f172a",
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {row.description.trim() || "Line"}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
            ${Number(row.unit_price).toFixed(2)}/{eliUnitSuffix(row.unit_basis)}
            {minLabel ? ` · ${minLabel}` : ""}
          </span>
          {linkedCount > 0 ? (
            <span style={{ fontSize: 10, color: "#94a3b8" }}>
              {linkedCount} job type{linkedCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </button>
        {expanded ? (
          <div style={{ padding: "8px 10px 10px", borderTop: `1px solid ${theme.border}`, display: "grid", gap: 8, background: "#f8fafc" }}>
            <input
              value={row.description}
              onChange={(e) => setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))}
              style={{ ...inputDark, fontSize: 12, padding: "6px 8px" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input
                value={row.quantity === 0 ? "" : String(row.quantity)}
                onChange={(e) => {
                  const q = Number.parseFloat(e.target.value) || 0
                  setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: q } : r)))
                }}
                style={{ ...inputDark, fontSize: 12, padding: "6px 8px" }}
                placeholder="Qty"
              />
              <input
                value={row.unit_price === 0 ? "" : Number(row.unit_price).toFixed(2)}
                onChange={(e) => {
                  const p = Number.parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0
                  setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: p } : r)))
                }}
                style={{ ...inputDark, fontSize: 12, padding: "6px 8px" }}
                placeholder="$/unit"
              />
              <select
                value={row.unit_basis ?? "hours"}
                onChange={(e) => setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_basis: e.target.value } : r)))}
                style={{ ...inputDark, fontSize: 12, padding: "6px 8px" }}
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
                value={kindOf(row)}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, line_kind: e.target.value as EstimateLinePresetRow["line_kind"] } : r)),
                  )
                }
                style={{ ...inputDark, fontSize: 12, padding: "6px 8px" }}
              >
                {ELI_LINE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ELI_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            {jobTypes.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <select
                  value={linkPick[row.id] ?? ""}
                  onChange={(e) => setLinkPick((p) => ({ ...p, [row.id]: e.target.value }))}
                  style={{ ...inputDark, fontSize: 12, padding: "6px 8px", flex: 1, minWidth: 100 }}
                >
                  <option value="">Link job type…</option>
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
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Link
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
              style={{
                justifySelf: "start",
                fontSize: 11,
                color: "#b91c1c",
                background: "#fff",
                border: "1px solid #fecaca",
                borderRadius: 6,
                padding: "4px 8px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    )
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "minmax(140px, 1.4fr) minmax(110px, 0.9fr) minmax(90px, 0.7fr) minmax(64px, 0.45fr) minmax(72px, 0.55fr)",
            gap: 8,
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            Line item title
            <input
              value={eliTitle}
              onChange={(e) => setEliTitle(e.target.value)}
              placeholder="Per Acre Fuel Charge"
              style={{ ...inputDark, padding: "8px 10px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            Line type
            <select value={eliSimpleKind} onChange={(e) => setEliSimpleKind(e.target.value as EliLineKind)} style={{ ...inputDark, padding: "8px 10px" }}>
              {ELI_LINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ELI_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            Unit
            <select
              value={COMMON_LINE_UNITS.some((u) => u.id === eliSimpleUnit) ? eliSimpleUnit : "custom"}
              onChange={(e) => setEliSimpleUnit(e.target.value)}
              style={{ ...inputDark, padding: "8px 10px" }}
            >
              {COMMON_LINE_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            Qty
            <input value={eliSimpleQty} onChange={(e) => setEliSimpleQty(e.target.value)} style={{ ...inputDark, padding: "8px 10px" }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            $ / unit
            <input value={eliSimplePrice} onChange={(e) => setEliSimplePrice(e.target.value)} style={{ ...inputDark, padding: "8px 10px" }} placeholder="15.00" />
          </label>
        </div>
        {eliSimpleUnit === "custom" || !COMMON_LINE_UNITS.some((u) => u.id === eliSimpleUnit) ? (
          <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            Custom unit label
            <input
              value={eliCustomUnit || eliSimpleUnit}
              onChange={(e) => {
                setEliSimpleUnit("custom")
                setEliCustomUnit(e.target.value)
              }}
              style={inputDark}
              placeholder="acres, panels, fixtures…"
            />
          </label>
        ) : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "auto minmax(140px, 180px) minmax(100px, 140px) auto",
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
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
                Min type
                <select value={eliMinBasis} onChange={(e) => setEliMinBasis(e.target.value as MinBasis)} style={inputDark}>
                  <option value="cost">Dollar amount</option>
                  <option value="quantity">Quantity</option>
                  <option value="hours">Hrs</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
                {eliMinBasis === "cost" ? "Dollar amount" : eliMinBasis === "hours" ? "Min hours" : "Min quantity"}
                <input
                  value={eliMinValue}
                  onChange={(e) => setEliMinValue(e.target.value)}
                  style={inputDark}
                  placeholder={eliMinBasis === "cost" ? "60.00" : "1"}
                />
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
      {draft.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No saved lines yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {ELI_LINE_KINDS.map((kind) => {
            const items = columns[kind]
            return (
              <div key={kind} style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: `${ELI_KIND_ACCENT[kind]}14`,
                    border: `1px solid ${ELI_KIND_ACCENT[kind]}33`,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{ELI_KIND_LABEL[kind]}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: ELI_KIND_ACCENT[kind],
                      background: "#fff",
                      borderRadius: 999,
                      padding: "1px 7px",
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", padding: "0 2px" }}>None yet</p>
                ) : (
                  items.map(({ row, idx }) => renderTile(row, idx))
                )}
              </div>
            )
          })}
        </div>
      )}

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
