import { useEffect, useRef, useState } from "react"
import { theme } from "../../styles/theme"

type Props = {
  showPromotions: boolean
  showCustomersMove: boolean
  showComplete: boolean
  showArchive: boolean
  promotionsLabel: string
  hubKindBusy: boolean
  completeBusy: boolean
  archiveBusy: boolean
  onPromotions: () => void
  onCustomers: () => void
  onComplete: () => void
  onArchive: () => void
}

export function CustomerQuickViewMoveToMenu({
  showPromotions,
  showCustomersMove,
  showComplete,
  showArchive,
  promotionsLabel,
  hubKindBusy,
  completeBusy,
  archiveBusy,
  onPromotions,
  onCustomers,
  onComplete,
  onArchive,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const busy = hubKindBusy || completeBusy || archiveBusy

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "10px 16px",
          borderRadius: 6,
          border: "none",
          background: theme.primary,
          color: "#fff",
          cursor: busy ? "wait" : "pointer",
          fontWeight: 700,
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Move to
        <span style={{ fontSize: 10, opacity: 0.9 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 40,
            minWidth: 220,
            background: "#fff",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
            padding: 6,
            display: "grid",
            gap: 2,
          }}
        >
          {showPromotions ? (
            <MenuItem
              label={promotionsLabel}
              disabled={hubKindBusy}
              onClick={() => {
                setOpen(false)
                onPromotions()
              }}
            />
          ) : null}
          {showCustomersMove ? (
            <MenuItem
              label="Customers (operational hub)"
              disabled={hubKindBusy}
              onClick={() => {
                setOpen(false)
                onCustomers()
              }}
            />
          ) : null}
          {showComplete ? (
            <MenuItem
              label="Complete"
              disabled={completeBusy}
              onClick={() => {
                setOpen(false)
                onComplete()
              }}
            />
          ) : null}
          {showArchive ? (
            <MenuItem
              label="Archive"
              disabled={archiveBusy}
              onClick={() => {
                setOpen(false)
                onArchive()
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        fontSize: 13,
        fontWeight: 600,
        color: theme.text,
        cursor: disabled ? "wait" : "pointer",
      }}
    >
      {label}
    </button>
  )
}
