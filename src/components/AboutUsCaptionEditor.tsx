import { useRef, type CSSProperties } from "react"
import { theme } from "../styles/theme"

type Props = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

const BTN: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

/**
 * Small HTML caption editor (bold / italic / font size). Stored value is sanitized on save and on the public page.
 */
export function AboutUsCaptionEditor({ value, onChange, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function insertAtCursor(insert: string) {
    const ta = ref.current
    if (!ta || disabled) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = value.slice(0, start) + insert + value.slice(end)
    onChange(next)
    const pos = start + insert.length
    queueMicrotask(() => {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  function wrapSelection(open: string, close: string) {
    const ta = ref.current
    if (!ta || disabled) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end)
    const next = value.slice(0, start) + open + sel + close + value.slice(end)
    onChange(next)
    const innerStart = start + open.length
    const innerEnd = innerStart + sel.length
    queueMicrotask(() => {
      ta.focus()
      ta.setSelectionRange(innerStart, innerEnd)
    })
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Caption formatting</span>
        <button type="button" disabled={disabled} style={BTN} onClick={() => wrapSelection("<strong>", "</strong>")}>
          Bold
        </button>
        <button type="button" disabled={disabled} style={BTN} onClick={() => wrapSelection("<em>", "</em>")}>
          Italic
        </button>
        <span style={{ fontSize: 12, color: theme.text, opacity: 0.8 }}>Size:</span>
        <button type="button" disabled={disabled} style={BTN} onClick={() => wrapSelection('<span style="font-size: 0.875rem">', "</span>")}>
          S
        </button>
        <button type="button" disabled={disabled} style={BTN} onClick={() => wrapSelection('<span style="font-size: 1rem">', "</span>")}>
          M
        </button>
        <button type="button" disabled={disabled} style={BTN} onClick={() => wrapSelection('<span style="font-size: 1.25rem">', "</span>")}>
          L
        </button>
        <button type="button" disabled={disabled} style={BTN} onClick={() => insertAtCursor("<br />")}>
          Line break
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Bio or description (use toolbar for bold, italic, size)…"
        style={{ ...theme.formInput, width: "100%", minHeight: 100, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 13 }}
      />
      <p style={{ margin: 0, fontSize: 11, color: theme.text, opacity: 0.65, lineHeight: 1.4 }}>
        Allowed tags: bold, italic, line breaks, and font size. Other HTML is removed when you save.
      </p>
    </div>
  )
}
