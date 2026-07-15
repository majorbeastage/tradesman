import { useMemo, useState } from "react"
import { formatEstimatePresetCostSummary, type EstimateLinePresetRow } from "../lib/estimateLinePresets"
import { savedLineCategoryIdFromKind, type LibraryCategory } from "../lib/libraryCategories"
import { glyphForJobTypeIcon } from "../lib/jobTypeIcons"
import { theme } from "../styles/theme"

type Props = {
  presets: EstimateLinePresetRow[]
  categories: LibraryCategory[]
  onSelectPreset: (preset: EstimateLinePresetRow) => void
  /** Compact layout for wizard modals */
  compact?: boolean
  title?: string
  /** Dropdown pickers instead of card grid (wizard step 6) */
  variant?: "cards" | "dropdown"
  addButtonLabel?: string
}

export default function SavedLineCategoryPicker({
  presets,
  categories,
  onSelectPreset,
  compact = false,
  title = "Saved lines",
  variant = "cards",
  addButtonLabel = "Add to estimate",
}: Props) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "")
  const [lineId, setLineId] = useState("")

  const grouped = useMemo(() => {
    const map = new Map<string, EstimateLinePresetRow[]>()
    categories.forEach((c) => map.set(c.id, []))
    presets.forEach((p) => {
      const id = p.category_id ?? savedLineCategoryIdFromKind(p.line_kind)
      const bucket = map.get(id) ?? map.get(categories[0]?.id ?? "")
      bucket?.push(p)
    })
    return map
  }, [presets, categories])

  const activeCategory = categories.find((c) => c.id === categoryId) ?? categories[0]
  const items = activeCategory ? (grouped.get(activeCategory.id) ?? []) : []
  const selectedPreset = lineId ? items.find((p) => p.id === lineId) : null

  if (presets.length === 0) return null

  if (variant === "dropdown") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>{title}</div>
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          Category
          <select
            value={activeCategory?.id ?? ""}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setLineId("")
            }}
            style={{ ...theme.formInput, padding: "8px 10px", fontWeight: 600, color: "#0f172a" }}
          >
            {categories.map((category) => {
              const count = grouped.get(category.id)?.length ?? 0
              return (
                <option key={category.id} value={category.id}>
                  {glyphForJobTypeIcon(category.icon_id)} {category.title} ({count})
                </option>
              )
            })}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          Line item
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            style={{ ...theme.formInput, padding: "8px 10px", fontWeight: 600, color: "#0f172a" }}
          >
            <option value="">Select a saved line…</option>
            {items.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.description.trim() || "Line"}
                {formatEstimatePresetCostSummary(preset) ? ` — ${formatEstimatePresetCostSummary(preset)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedPreset}
          onClick={() => {
            if (selectedPreset) onSelectPreset(selectedPreset)
          }}
          style={{
            justifySelf: "start",
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            background: selectedPreset ? theme.primary : "#cbd5e1",
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: selectedPreset ? "pointer" : "not-allowed",
          }}
        >
          {addButtonLabel}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: compact ? 8 : 10 }}>
      <div style={{ fontWeight: 800, fontSize: compact ? 12 : 13, color: "#0f172a" }}>{title}</div>
      <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
        Category
        <select
          value={activeCategory?.id ?? ""}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ ...theme.formInput, padding: "8px 10px", fontWeight: 600, color: "#0f172a" }}
        >
          {categories.map((category) => {
            const count = grouped.get(category.id)?.length ?? 0
            return (
              <option key={category.id} value={category.id}>
                {glyphForJobTypeIcon(category.icon_id)} {category.title} ({count})
              </option>
            )
          })}
        </select>
      </label>
      {activeCategory ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 8,
            background: `${activeCategory.color}14`,
            border: `1px solid ${activeCategory.color}33`,
          }}
        >
          <span style={{ fontSize: 16 }}>{glyphForJobTypeIcon(activeCategory.icon_id) || "📁"}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{activeCategory.title}</span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              fontWeight: 800,
              color: activeCategory.color,
              background: "#fff",
              borderRadius: 999,
              padding: "1px 7px",
            }}
          >
            {items.length}
          </span>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>No saved lines in this category yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 8,
          }}
        >
          {items.map((preset) => {
            const summary = formatEstimatePresetCostSummary(preset)
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  borderLeft: `3px solid ${activeCategory?.color ?? "#64748b"}`,
                  background: "#fff",
                  cursor: "pointer",
                  display: "grid",
                  gap: 4,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 12, color: "#0f172a", lineHeight: 1.35 }}>
                  {preset.description.trim() || "Line"}
                </span>
                {summary ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{summary}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
