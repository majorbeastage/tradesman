import type { PointerEvent as ReactPointerEvent } from "react"

type Props = {
  x: number
  y: number
  stroke: string
  selected?: boolean
  emphasized?: boolean
  label?: string
  title: string
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
}

export default function WireEndpointHandle({
  x,
  y,
  stroke,
  selected,
  emphasized,
  label,
  title,
  onPointerDown,
}: Props) {
  const visible = selected || emphasized
  const size = visible ? 18 : 14
  const hit = 40
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: x - hit / 2,
        top: y - hit / 2,
        width: hit,
        height: hit,
        zIndex: 25,
        cursor: "grab",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
        opacity: visible ? 1 : 0.55,
        transition: "opacity 0.15s ease, transform 0.15s ease",
      }}
    >
      {label && visible ? (
        <span
          style={{
            position: "absolute",
            top: -20,
            whiteSpace: "nowrap",
            fontSize: 10,
            fontWeight: 800,
            color: "#0f172a",
            background: "#fff",
            border: `1px solid ${stroke}`,
            borderRadius: 6,
            padding: "2px 6px",
            boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      ) : null}
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#ffffff",
          border: `3px solid ${stroke}`,
          boxShadow: visible
            ? `0 0 0 5px ${stroke}40, 0 3px 12px rgba(15,23,42,0.22)`
            : "0 2px 8px rgba(15,23,42,0.18)",
        }}
      />
    </div>
  )
}
