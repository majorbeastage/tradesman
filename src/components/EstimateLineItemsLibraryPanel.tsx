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
import AddLineItemQuickForm from "./AddLineItemQuickForm"
import { eliUnitSuffix, type EstimateLinePresetRow } from "../lib/estimateLinePresets"
import { COMMON_LINE_UNITS } from "../lib/parseSpokenLineItem"
import LibraryCategoryEditor from "./LibraryCategoryEditor"
import {
  loadLibraryCategorySettings,
  persistLibraryCategorySettings,
  savedLineCategoryIdFromKind,
  type LibraryCategory,
} from "../lib/libraryCategories"
import { glyphForJobTypeIcon } from "../lib/jobTypeIcons"

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
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({})
  const [linkPick, setLinkPick] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<LibraryCategory[]>([])
  const [categoryEditor, setCategoryEditor] = useState<LibraryCategory | "new" | null>(null)
  const [newLineCategoryId, setNewLineCategoryId] = useState("line-labor")
  const [dragLineId, setDragLineId] = useState<string | null>(null)
  const [dropCategoryId, setDropCategoryId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    const [presets, jt, categorySettings] = await Promise.all([
      loadEstimateLinePresetsForUser(supabase, userId),
      loadJobTypesForUser(supabase, userId),
      loadLibraryCategorySettings(supabase, userId, "saved_lines"),
    ])
    setDraft(presets.map((r) => ({ ...r })))
    setJobTypes(jt.rows.map((r) => ({ id: r.id, name: r.name })))
    setCategories(categorySettings.categories)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const columns = useMemo(() => {
    const buckets = new Map<string, Array<{ row: EstimateLinePresetRow; idx: number }>>()
    categories.forEach((category) => buckets.set(category.id, []))
    draft.forEach((row, idx) => {
      const categoryId = row.category_id ?? savedLineCategoryIdFromKind(row.line_kind)
      const fallbackId = categories[0]?.id
      const bucket = buckets.get(categoryId) ?? (fallbackId ? buckets.get(fallbackId) : undefined)
      bucket?.push({ row, idx })
    })
    return buckets
  }, [categories, draft])

  function appendLineFromQuickForm(values: {
    title: string
    categoryId: string
    unit: string
    qty: number
    unitPrice: number
    lineKind: string
    minEnabled: boolean
    minBasis: MinBasis
    minValue: number
  }) {
    const line_kind = values.lineKind as EstimateLinePresetRow["line_kind"]
    setDraft((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        description: values.title,
        quantity: values.qty,
        unit_price: values.unitPrice,
        linked_job_type_ids: [],
        line_kind,
        category_id: values.categoryId,
        unit_basis: values.unit,
        ...(values.minEnabled && values.minBasis === "cost" ? { minimum_line_total: values.minValue, minimum_basis: "cost" as const } : {}),
        ...(values.minEnabled && values.minBasis === "quantity"
          ? { minimum_quantity: values.minValue, minimum_basis: "quantity" as const }
          : {}),
        ...(values.minEnabled && values.minBasis === "hours"
          ? { minimum_quantity: values.minValue, minimum_basis: "hours" as const }
          : {}),
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

  async function moveLineToCategory(rowId: string, categoryId: string) {
    const current = draft.find((r) => r.id === rowId)
    const currentCategory = current?.category_id ?? savedLineCategoryIdFromKind(current?.line_kind)
    if (!current || currentCategory === categoryId) return
    const next = draft.map((r) => (r.id === rowId ? { ...r, category_id: categoryId } : r))
    setDraft(next)
    if (!supabase) return
    const cleaned = next.filter((r) => r.description.trim())
    const { error, rows } = await persistEstimateLinePresetsForUser(supabase, userId, cleaned)
    if (error) {
      alert(error)
      return
    }
    setDraft(rows)
    const title = categories.find((c) => c.id === categoryId)?.title ?? "category"
    setMessage(`Moved "${current.description.trim() || "Line"}" to ${title}.`)
    onSaved?.(rows)
  }

  async function saveCategory(category: LibraryCategory) {
    if (!supabase) return
    const next = categories.some((item) => item.id === category.id)
      ? categories.map((item) => (item.id === category.id ? category : item))
      : [...categories, category]
    const error = await persistLibraryCategorySettings(supabase, userId, "saved_lines", {
      categories: next,
      assignments: {},
    })
    if (error) {
      alert(error)
      return
    }
    setCategories(next)
    if (categoryEditor === "new") setNewLineCategoryId(category.id)
    setCategoryEditor(null)
  }

  function renderTile(row: EstimateLinePresetRow, idx: number) {
    const expanded = expandedById[row.id] === true
    const accent = ELI_KIND_ACCENT[kindOf(row)]
    const minLabel = compactMinLabel(row)
    const linkedCount = (row.linked_job_type_ids ?? []).length
    return (
      <div
        key={row.id}
        draggable={!expanded}
        onDragStart={(e) => {
          setDragLineId(row.id)
          e.dataTransfer.setData("text/plain", row.id)
          e.dataTransfer.effectAllowed = "move"
        }}
        onDragEnd={() => {
          setDragLineId(null)
          setDropCategoryId(null)
        }}
        style={{
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
          overflow: "hidden",
          display: "grid",
          gap: 0,
          opacity: dragLineId === row.id ? 0.5 : 1,
          cursor: "grab",
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
              <select
                value={row.category_id ?? savedLineCategoryIdFromKind(row.line_kind)}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, category_id: e.target.value } : r)),
                  )
                }
                style={{ ...inputDark, fontSize: 12, padding: "6px 8px", gridColumn: "1 / -1" }}
                aria-label="Saved line category"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {glyphForJobTypeIcon(category.icon_id)} {category.title}
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
      <div style={{ padding: 14, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
        <AddLineItemQuickForm
          isMobile={isMobile}
          categories={categories}
          defaultCategoryId={newLineCategoryId}
          onSubmit={(values) => {
            setNewLineCategoryId(values.categoryId)
            appendLineFromQuickForm(values)
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>Your saved lines</div>
        <button
          type="button"
          onClick={() => setCategoryEditor("new")}
          style={{ padding: "7px 11px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", color: "#0f172a", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          + Add category
        </button>
      </div>
      <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(Math.max(categories.length, 1), 4)}, minmax(0, 1fr))`,
            gap: 12,
            alignItems: "start",
          }}
        >
          {categories.map((category) => {
            const items = columns.get(category.id) ?? []
            const isDropTarget = dragLineId != null && dropCategoryId === category.id
            return (
              <div
                key={category.id}
                onDragOver={(e) => {
                  if (!dragLineId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                  if (dropCategoryId !== category.id) setDropCategoryId(category.id)
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  if (dropCategoryId === category.id) setDropCategoryId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = dragLineId ?? e.dataTransfer.getData("text/plain")
                  setDragLineId(null)
                  setDropCategoryId(null)
                  if (id) void moveLineToCategory(id, category.id)
                }}
                style={{
                  display: "grid",
                  gap: 8,
                  minWidth: 0,
                  alignContent: "start",
                  borderRadius: 10,
                  outline: isDropTarget ? `2px dashed ${category.color}` : "2px dashed transparent",
                  outlineOffset: 2,
                  background: isDropTarget ? `${category.color}0d` : undefined,
                  transition: "background 120ms ease",
                  minHeight: dragLineId ? 90 : undefined,
                }}
              >
                <div
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setCategoryEditor(category)
                  }}
                  title="Right-click to edit category — drag lines here to move them"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: `${category.color}14`,
                    border: `1px solid ${category.color}33`,
                    cursor: "context-menu",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
                    {glyphForJobTypeIcon(category.icon_id) ? `${glyphForJobTypeIcon(category.icon_id)} ` : ""}
                    {category.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: category.color,
                      background: "#fff",
                      borderRadius: 999,
                      padding: "1px 7px",
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", padding: "0 2px" }}>
                    {dragLineId ? "Drop here" : "None yet"}
                  </p>
                ) : (
                  items.map(({ row, idx }) => renderTile(row, idx))
                )}
              </div>
            )
          })}
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
      <LibraryCategoryEditor
        open={categoryEditor != null}
        category={categoryEditor === "new" ? null : categoryEditor}
        onClose={() => setCategoryEditor(null)}
        onSave={(category) => void saveCategory(category)}
      />
    </div>
  )
}
