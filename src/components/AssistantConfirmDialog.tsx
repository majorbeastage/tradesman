import type { GlobalAssistantAction } from "../lib/globalAssistantNav"
import { theme } from "../styles/theme"

export type AssistantConfirmOption = {
  label: string
  action: GlobalAssistantAction
}

type Props = {
  open: boolean
  message: string
  options: AssistantConfirmOption[]
  onPick: (action: GlobalAssistantAction) => void
  onCancel: () => void
}

export default function AssistantConfirmDialog({ open, message, options, onPick, onCancel }: Props) {
  if (!open) return null
  return (
    <>
      <div role="presentation" onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 10055 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 10056,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, calc(100vw - 24px))",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 48px rgba(15,23,42,0.2)",
          padding: 18,
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Did you mean?</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt, i) => (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => onPick(opt.action)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: i === 0 ? "none" : `1px solid ${theme.border}`,
                background: i === 0 ? theme.primary : "#f8fafc",
                color: i === 0 ? "#fff" : "#0f172a",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            style={{
              marginTop: 4,
              padding: "8px 12px",
              border: "none",
              background: "none",
              color: "#64748b",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
