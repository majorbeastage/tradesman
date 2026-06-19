import type { PointerEvent as ReactPointerEvent } from "react"

type Props = {
  x: number
  y: number
  stroke: string
  selected?: boolean
  title: string
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
}

export default function WireEndpointHandle({ x, y, stroke, selected, title, onPointerDown }: Props) {
  const size = selected ? 14 : 11
  const hit = 22
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
        zIndex: 20,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#ffffff",
          border: `2.5px solid ${stroke}`,
          boxShadow: selected
            ? `0 0 0 4px ${stroke}33, 0 2px 8px rgba(15,23,42,0.18)`
            : "0 1px 6px rgba(15,23,42,0.2)",
        }}
      />
    </div>
  )
}
