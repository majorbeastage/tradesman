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
import type { EstimateLinePresetRow } from "../lib/estimateLinePresets"

const ELI_LINE_KINDS = ["labor", "material", "travel", "misc"] as const
type EliLineKind = (typeof ELI_LINE_KINDS)[number]
const ELI_KIND_LABEL: Record<EliLineKind, string> = {
  labor: "Labor",
  material: "Materials",
  travel: "Travel expenses",
  misc: "Miscellaneous",
}
const ELI_UNITS = ["hours", "miles", "each"] as const
type EliUnit = (typeof ELI_UNITS)[number]

function eliUnitSuffix(unitBasis: string | undefined): string {
  if (unitBasis === "miles") return "mi"
  if (unitBasis === "each") return "ea"
  return "hr"
}

type Props = {
  userId: string
  handoff?: AssistantHandoffPayload | null
  onDismissHandoff?: () => void
  onJobTypeFollowUp?: (jobTypeName: string, presetIds: string[]) => void
  onSaved?: (rows: EstimateLinePresetRow[]) => void
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
  const [eliSimpleKind, setEliSimpleKind] = useState<EliLineKind>("labor")
  const [eliSimpleUnit, setEliSimpleUnit] = useState<EliUnit>("hours")
  const [eliSimpleQty, setEliSimpleQty] = useState("1")
  const [eliSimplePrice, setEliSimplePrice] = useState("")
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

  useEffect(() => {
    if (eliSimpleKind === "travel") setEliSimpleUnit("miles")
    else if (eliSimpleKind === "labor") setEliSimpleUnit("hours")
    else setEliSimpleUnit("each")
  }, [eliSimpleKind])

  function appendSimpleLine() {
    const qty = Number.parseFloat(String(eliSimpleQty).replace(/[^0-9.]/g, "")) || 0
    const price = Number.parseFloat(String(eliSimplePrice).replace(/[^0-9.]/g, "")) || 0
    if (qty <= 0) {
      alert("Enter how many units (hours, miles, or quantity).")
      return
    }
    const line_kind: EstimateLinePresetRow["line_kind"] =
      eliSimpleKind === "material" ? "material" : eliSimpleKind === "travel" ? "travel" : eliSimpleKind === "misc" ? "misc" : "labor"
    setDraft((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        description: ELI_KIND_LABEL[eliSimpleKind],
        quantity: qty,
        unit_price: price,
        linked_job_type_ids: [],
        line_kind,
        unit_basis: eliSimpleUnit,
      },
    ])
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

      <div style={{ padding: 14, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 10 }}>Add a saved line</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 90px) minmax(0, 110px) auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
            Line type
            <select value={eliSimpleKind} onChange={(e) => setEliSimpleKind(e.target.value as EliLineKind)} style={theme.formInput}>
              {ELI_LINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ELI_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
            Unit
            <select value={eliSimpleUnit} onChange={(e) => setEliSimpleUnit(e.target.value as EliUnit)} style={theme.formInput}>
              <option value="hours">Hours</option>
              <option value="miles">Miles</option>
              <option value="each">Each</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
            Qty
            <input value={eliSimpleQty} onChange={(e) => setEliSimpleQty(e.target.value)} style={theme.formInput} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
            $ / unit
            <input value={eliSimplePrice} onChange={(e) => setEliSimplePrice(e.target.value)} style={theme.formInput} />
          </label>
          <button
            type="button"
            onClick={appendSimpleLine}
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Add to list
          </button>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>Your saved lines</div>
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
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {row.description.trim() || "Line"} · {row.quantity} {eliUnitSuffix(row.unit_basis)} @ ${Number(row.unit_price).toFixed(2)}
                    </span>
                    {linkedLabels.length > 0 ? (
                      <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 4 }}>Job types: {linkedLabels.join(", ")}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ fontSize: 12, color: "#b91c1c", background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px" }}
                  >
                    Delete
                  </button>
                </div>
                {expanded ? (
                  <>
                    <input
                      value={row.description}
                      onChange={(e) => setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))}
                      style={theme.formInput}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "90px 90px 120px", gap: 8 }}>
                      <input
                        value={row.quantity === 0 ? "" : String(row.quantity)}
                        onChange={(e) => {
                          const q = Number.parseFloat(e.target.value) || 0
                          setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: q } : r)))
                        }}
                        style={theme.formInput}
                        placeholder="Qty"
                      />
                      <input
                        value={row.unit_price === 0 ? "" : String(row.unit_price)}
                        onChange={(e) => {
                          const p = Number.parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0
                          setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: p } : r)))
                        }}
                        style={theme.formInput}
                        placeholder="$/unit"
                      />
                      <select
                        value={row.line_kind ?? "labor"}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, line_kind: e.target.value as EstimateLinePresetRow["line_kind"] } : r)),
                          )
                        }
                        style={theme.formInput}
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
                          style={{ ...theme.formInput, minWidth: 160 }}
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
                          style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", fontWeight: 600, fontSize: 12 }}
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
