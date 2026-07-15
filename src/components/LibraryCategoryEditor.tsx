import { useEffect, useState } from "react"
import { JOB_TYPE_CALENDAR_COLORS, JOB_TYPE_ICON_OPTIONS } from "../lib/jobTypeIcons"
import type { LibraryCategory } from "../lib/libraryCategories"
import { theme } from "../styles/theme"

type Props = {
  category: LibraryCategory | null
  open: boolean
  onClose: () => void
  onSave: (category: LibraryCategory) => void
}

export default function LibraryCategoryEditor({ category, open, onClose, onSave }: Props) {
  const [title, setTitle] = useState("")
  const [color, setColor] = useState("#64748b")
  const [iconId, setIconId] = useState("none")

  useEffect(() => {
    if (!open) return
    setTitle(category?.title ?? "")
    setColor(category?.color ?? "#64748b")
    setIconId(category?.icon_id ?? "none")
  }, [category, open])

  if (!open) return null
  const isNew = category == null

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 12000 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Add category" : "Edit category"}
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 12001,
          width: "min(92vw, 420px)",
          padding: 20,
          borderRadius: 10,
          background: "#fff",
          boxShadow: "0 18px 50px rgba(15,23,42,0.24)",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>{isNew ? "Add category" : "Edit category"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>
            ✕
          </button>
        </div>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus style={theme.formInput} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            Color
            <select value={color} onChange={(event) => setColor(event.target.value)} style={theme.formInput}>
              {JOB_TYPE_CALENDAR_COLORS.map((option) => (
                <option key={option.hex} value={option.hex}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            Icon
            <select value={iconId} onChange={(event) => setIconId(event.target.value)} style={theme.formInput}>
              {JOB_TYPE_ICON_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.glyph ? `${option.glyph} ` : ""}{option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #94a3b8",
              background: "#fff",
              color: "#0f172a",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!title.trim()) return
              onSave({
                id: category?.id ?? `category-${crypto.randomUUID()}`,
                title: title.trim(),
                color,
                icon_id: iconId,
                built_in: category?.built_in,
              })
            }}
            style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            {isNew ? "Add category" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  )
}
