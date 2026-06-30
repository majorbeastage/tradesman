import { useEffect, useRef, useState } from "react"
import { theme } from "../styles/theme"
import {
  JULY250_PUBLIC_DETAILS,
  JULY250_PUBLIC_HEADLINE,
  JULY250_PROMO_CODE,
  SIGNUP_PROMO_CODE_STORAGE_KEY,
} from "../lib/july250Promo"

type Props = {
  visible: boolean
  onSignup: () => void
}

export function July250PromoHomeBadge({ visible, onSignup }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (!visible) return null

  function handleSignupClick() {
    try {
      sessionStorage.setItem(SIGNUP_PROMO_CODE_STORAGE_KEY, JULY250_PROMO_CODE)
    } catch {
      /* ignore */
    }
    setOpen(false)
    onSignup()
  }

  return (
    <div
      className="july250-home-promo"
      style={{
        position: "absolute",
        top: "clamp(12px, 2vh, 18px)",
        left: "clamp(12px, 2.5vw, 20px)",
        zIndex: 90,
        maxWidth: "min(320px, calc(100vw - 24px))",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="july250-promo-panel"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          borderRadius: 999,
          border: `1px solid ${theme.primary}`,
          background: "rgba(255,255,255,0.96)",
          color: theme.charcoal,
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 4px 18px rgba(249,115,22,0.18)",
        }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: theme.primary }} />
        July promo · {JULY250_PROMO_CODE}
      </button>

      {open ? (
        <div
          id="july250-promo-panel"
          ref={panelRef}
          role="dialog"
          aria-label="July 2026 signup promo"
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            boxShadow: "0 12px 40px rgba(15,23,42,0.14)",
            fontSize: 13,
            lineHeight: 1.55,
            color: theme.charcoal,
          }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 900, fontSize: 14, color: theme.charcoal }}>{JULY250_PUBLIC_HEADLINE}</p>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
            Enter <strong style={{ color: theme.primary }}>{JULY250_PROMO_CODE}</strong> at signup. Ends July 31, 2026.
          </p>
          <ul style={{ margin: "0 0 12px", paddingLeft: 18, color: "#475569" }}>
            {JULY250_PUBLIC_DETAILS.map((line) => (
              <li key={line} style={{ marginBottom: 4 }}>
                {line}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={handleSignupClick}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Sign up with {JULY250_PROMO_CODE}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
