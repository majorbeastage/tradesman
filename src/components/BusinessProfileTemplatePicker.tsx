import type { CSSProperties } from "react"
import {
  BUSINESS_PROFILE_TEMPLATE_OPTIONS,
  type BusinessProfileTemplateId,
  type BusinessProfileTheme,
} from "../lib/businessPublicProfile"

type Props = {
  value: BusinessProfileTemplateId
  onChange: (id: BusinessProfileTemplateId) => void
  theme?: BusinessProfileTheme
}

function TemplateWireframe({ id, accent }: { id: BusinessProfileTemplateId; accent: string }) {
  const block = (style: CSSProperties) => (
    <div style={{ borderRadius: 2, background: "rgba(15,23,42,0.12)", ...style }} />
  )
  const photo = (style: CSSProperties) => (
    <div style={{ borderRadius: 2, background: "rgba(15,23,42,0.18)", ...style }} />
  )

  if (id === "hero") {
    return (
      <div style={{ display: "grid", gridTemplateRows: "14px 1fr", gap: 3, height: "100%" }}>
        <div style={{ borderRadius: 2, background: accent, opacity: 0.85 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
          <div style={{ display: "grid", gap: 2 }}>
            {block({ height: 4 })}
            {block({ height: 3, width: "70%" })}
            {block({ flex: 1 })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {photo({})}
            {photo({})}
            {photo({})}
            {photo({})}
          </div>
        </div>
      </div>
    )
  }

  if (id === "split") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 4, height: "100%" }}>
        <div style={{ display: "grid", gap: 2 }}>
          {block({ height: 6, width: "55%" })}
          {block({ height: 3 })}
          {block({ height: 3 })}
          {block({ flex: 1 })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {photo({})}
          {photo({})}
          {photo({})}
          {photo({})}
        </div>
      </div>
    )
  }

  if (id === "gallery") {
    return (
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 3, height: "100%" }}>
        <div style={{ display: "grid", gap: 2 }}>
          {block({ height: 5, width: "50%" })}
          {block({ height: 3, width: "80%" })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
          {photo({ aspectRatio: "4/3" })}
          {photo({ aspectRatio: "4/3" })}
          {photo({ aspectRatio: "4/3" })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <div
        style={{
          width: "72%",
          height: "88%",
          borderRadius: 4,
          border: "1px solid rgba(15,23,42,0.14)",
          background: "#fff",
          padding: 4,
          display: "grid",
          gap: 3,
          boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
        }}
      >
        {block({ height: 5, width: "45%", margin: "0 auto" })}
        {block({ height: 3 })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
          {photo({ aspectRatio: "1" })}
          {photo({ aspectRatio: "1" })}
          {photo({ aspectRatio: "1" })}
        </div>
        {block({ flex: 1 })}
      </div>
    </div>
  )
}

export function BusinessProfileTemplatePicker({ value, onChange, theme }: Props) {
  const accent = theme?.primaryColor ?? "#0f766e"

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700 }}>Layout template</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
          gap: 10,
        }}
      >
        {BUSINESS_PROFILE_TEMPLATE_OPTIONS.map((opt) => {
          const selected = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.id)}
              style={{
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 10,
                border: selected ? `2px solid ${accent}` : "1px solid #cbd5e1",
                background: selected ? "rgba(15, 118, 110, 0.06)" : "#fff",
                cursor: "pointer",
                textAlign: "left",
                boxShadow: selected ? `0 0 0 1px ${accent}22` : "none",
              }}
            >
              <div
                style={{
                  height: 88,
                  borderRadius: 6,
                  background: "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
                  padding: 6,
                  overflow: "hidden",
                }}
              >
                <TemplateWireframe id={opt.id} accent={accent} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.35, marginTop: 2 }}>{opt.hint}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
