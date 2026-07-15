import { useState } from "react"
import { COMMON_LINE_UNITS } from "../lib/parseSpokenLineItem"
import { lineKindFromCategoryId, type LibraryCategory } from "../lib/libraryCategories"
import { glyphForJobTypeIcon } from "../lib/jobTypeIcons"
import { theme } from "../styles/theme"

export type AddLineItemMinBasis = "cost" | "quantity" | "hours"

export type AddLineItemQuickFormValues = {
  title: string
  categoryId: string
  unit: string
  qty: number
  unitPrice: number
  lineKind: string
  minEnabled: boolean
  minBasis: AddLineItemMinBasis
  minValue: number
}

type Props = {
  isMobile: boolean
  categories: LibraryCategory[]
  defaultCategoryId?: string
  submitLabel?: string
  onSubmit: (values: AddLineItemQuickFormValues) => void
}

const inputDark = { ...theme.formInput, color: "#0f172a", fontWeight: 600 } as const

export default function AddLineItemQuickForm({
  isMobile,
  categories,
  defaultCategoryId,
  submitLabel = "Add to list",
  onSubmit,
}: Props) {
  const [title, setTitle] = useState("")
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? categories[0]?.id ?? "line-labor")
  const [unit, setUnit] = useState("hours")
  const [customUnit, setCustomUnit] = useState("")
  const [qty, setQty] = useState("1")
  const [unitPrice, setUnitPrice] = useState("")
  const [minEnabled, setMinEnabled] = useState(false)
  const [minBasis, setMinBasis] = useState<AddLineItemMinBasis>("cost")
  const [minValue, setMinValue] = useState("")

  const reset = () => {
    setTitle("")
    setUnitPrice("")
    setMinEnabled(false)
    setMinValue("")
  }

  const handleSubmit = () => {
    const parsedQty = Number.parseFloat(String(qty).replace(/[^0-9.]/g, "")) || 0
    const parsedPrice = Number.parseFloat(String(unitPrice).replace(/[^0-9.]/g, "")) || 0
    if (!title.trim()) {
      alert("Enter a line item title.")
      return
    }
    if (parsedQty <= 0) {
      alert("Enter how many units.")
      return
    }
    const resolvedUnit = unit === "custom" ? customUnit.trim() || "each" : unit.trim() || "hours"
    const minVal = Number.parseFloat(String(minValue).replace(/[^0-9.]/g, ""))
    const minOk = minEnabled && Number.isFinite(minVal) && minVal > 0
    onSubmit({
      title: title.trim(),
      categoryId,
      unit: resolvedUnit,
      qty: parsedQty,
      unitPrice: parsedPrice,
      lineKind: lineKindFromCategoryId(categoryId),
      minEnabled: minOk,
      minBasis,
      minValue: minOk ? minVal : 0,
    })
    reset()
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>Add a line item</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(140px, 1.4fr) minmax(110px, 0.9fr) minmax(110px, 0.9fr) minmax(90px, 0.7fr) minmax(64px, 0.45fr) minmax(72px, 0.55fr)",
          gap: 8,
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          Line item title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Per Acre Fuel Charge"
            style={{ ...inputDark, padding: "8px 10px" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{ ...inputDark, padding: "8px 10px" }}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {glyphForJobTypeIcon(category.icon_id)} {category.title}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          Unit
          <select
            value={COMMON_LINE_UNITS.some((u) => u.id === unit) ? unit : "custom"}
            onChange={(e) => setUnit(e.target.value)}
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
          <input value={qty} onChange={(e) => setQty(e.target.value)} style={{ ...inputDark, padding: "8px 10px" }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          $ / unit
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            style={{ ...inputDark, padding: "8px 10px" }}
            placeholder="15.00"
          />
        </label>
      </div>
      {unit === "custom" || !COMMON_LINE_UNITS.some((u) => u.id === unit) ? (
        <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
          Custom unit label
          <input
            value={customUnit || unit}
            onChange={(e) => {
              setUnit("custom")
              setCustomUnit(e.target.value)
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
          <input type="checkbox" checked={minEnabled} onChange={(e) => setMinEnabled(e.target.checked)} />
          Minimum charge
        </label>
        {minEnabled ? (
          <>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
              Min type
              <select value={minBasis} onChange={(e) => setMinBasis(e.target.value as AddLineItemMinBasis)} style={inputDark}>
                <option value="cost">Dollar amount</option>
                <option value="quantity">Quantity</option>
                <option value="hours">Hrs</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
              {minBasis === "cost" ? "Dollar amount" : minBasis === "hours" ? "Min hours" : "Min quantity"}
              <input
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                style={inputDark}
                placeholder={minBasis === "cost" ? "60.00" : "1"}
              />
            </label>
          </>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={handleSubmit}
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
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
