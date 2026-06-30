import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { startPatrioticFireworks } from "../lib/patrioticFireworks"
import {
  JULY250_PUBLIC_DETAILS,
  JULY250_PUBLIC_HEADLINE,
  JULY250_PROMO_CODE,
  SIGNUP_PROMO_CODE_STORAGE_KEY,
} from "../lib/july250Promo"

const USA_RED = "#B22234"
const USA_BLUE = "#3C3B6E"
const USA_WHITE = "#FFFFFF"

type Props = {
  visible: boolean
  onSignup: () => void
  /** Match marketing story viewport inset (0 on production homepage). */
  topInsetPx?: number
}

function StarStrip({ count = 5 }: { count?: number }) {
  return (
    <span className="july250-promo-stars" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="july250-promo-star">
          ★
        </span>
      ))}
    </span>
  )
}

export function July250PromoHomeBadge({ visible, onSignup, topInsetPx = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const stopFireworksRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setMounted(true)
    return () => {
      stopFireworksRef.current?.()
      stopFireworksRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (!open) {
      stopFireworksRef.current?.()
      stopFireworksRef.current = null
    }
  }, [open])

  if (!visible || !mounted) return null

  function stopFireworks() {
    stopFireworksRef.current?.()
    stopFireworksRef.current = null
  }

  function startFireworks() {
    stopFireworks()
    stopFireworksRef.current = startPatrioticFireworks({ durationMs: 60_000 })
  }

  function handlePromoTriggerClick() {
    setOpen((v) => {
      const next = !v
      if (next) startFireworks()
      return next
    })
  }

  function handleSignupClick() {
    try {
      sessionStorage.setItem(SIGNUP_PROMO_CODE_STORAGE_KEY, JULY250_PROMO_CODE)
    } catch {
      /* ignore */
    }
    setOpen(false)
    onSignup()
  }

  return createPortal(
    <>
      <July250PromoStyles />
      <div
        className="july250-promo-anchor"
        style={{ top: `calc(${topInsetPx}px + clamp(10px, 2vh, 16px))` }}
      >
        <div className="july250-promo-frame">
          <div className="july250-promo-inner">
            <div className="july250-promo-canton">
              <StarStrip count={5} />
              <span className="july250-promo-canton-label">July 250th USA</span>
              <StarStrip count={5} />
            </div>
            <button
              type="button"
              className="july250-promo-trigger"
              onClick={handlePromoTriggerClick}
              aria-expanded={open}
              aria-controls="july250-promo-panel"
            >
              <span className="july250-promo-trigger-stripe" aria-hidden />
              <span className="july250-promo-trigger-text">
                <StarStrip count={3} />
                <span>
                  Promo <strong>{JULY250_PROMO_CODE}</strong>
                </span>
              </span>
            </button>
          </div>
        </div>

        {open ? (
          <div id="july250-promo-panel" className="july250-promo-panel" role="dialog" aria-label="July 2026 signup promo">
            <div className="july250-promo-panel-frame">
              <div className="july250-promo-panel-inner">
                <div className="july250-promo-panel-canton">
                  <StarStrip count={7} />
                  <span>{JULY250_PUBLIC_HEADLINE}</span>
                  <StarStrip count={7} />
                </div>
                <div className="july250-promo-panel-body">
                  <p className="july250-promo-panel-lead">
                    Enter <strong>{JULY250_PROMO_CODE}</strong> at signup · Ends July 31, 2026
                  </p>
                  <ul className="july250-promo-panel-list">
                    {JULY250_PUBLIC_DETAILS.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="july250-promo-panel-actions">
                    <button type="button" className="july250-promo-btn-primary" onClick={handleSignupClick}>
                      ★ Sign up with {JULY250_PROMO_CODE}
                    </button>
                    <button type="button" className="july250-promo-btn-secondary" onClick={() => setOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  )
}

function July250PromoStyles() {
  return (
    <style>{`
      .july250-promo-anchor {
        position: fixed;
        left: clamp(10px, 2.5vw, 18px);
        z-index: 100000;
        max-width: min(340px, calc(100vw - 20px));
        pointer-events: none;
      }
      .july250-promo-frame,
      .july250-promo-panel-frame {
        pointer-events: auto;
        padding: 3px;
        border-radius: 14px;
        background: repeating-linear-gradient(
          180deg,
          ${USA_RED} 0,
          ${USA_RED} 5px,
          ${USA_WHITE} 5px,
          ${USA_WHITE} 10px
        );
        box-shadow: 0 10px 32px rgba(60, 59, 110, 0.28), 0 0 0 1px rgba(178, 34, 52, 0.15);
      }
      .july250-promo-inner,
      .july250-promo-panel-inner {
        border-radius: 11px;
        overflow: hidden;
        background: ${USA_WHITE};
      }
      .july250-promo-canton,
      .july250-promo-panel-canton {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 10px;
        background: linear-gradient(180deg, #4a4980 0%, ${USA_BLUE} 100%);
        color: ${USA_WHITE};
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: center;
        line-height: 1.3;
      }
      .july250-promo-stars {
        display: inline-flex;
        gap: 2px;
        flex-shrink: 0;
      }
      .july250-promo-star {
        color: #fbbf24;
        font-size: 9px;
        line-height: 1;
        text-shadow: 0 0 6px rgba(251, 191, 36, 0.45);
      }
      .july250-promo-canton-label {
        color: ${USA_WHITE};
      }
      .july250-promo-trigger {
        display: flex;
        width: 100%;
        align-items: stretch;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        background: ${USA_WHITE};
        text-align: left;
      }
      .july250-promo-trigger-stripe {
        width: 6px;
        flex-shrink: 0;
        background: repeating-linear-gradient(
          180deg,
          ${USA_RED} 0,
          ${USA_RED} 4px,
          ${USA_WHITE} 4px,
          ${USA_WHITE} 8px
        );
      }
      .july250-promo-trigger-text {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px 9px 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: ${USA_BLUE};
      }
      .july250-promo-trigger-text strong {
        color: ${USA_RED};
        font-weight: 900;
      }
      .july250-promo-panel {
        margin-top: 8px;
        pointer-events: auto;
      }
      .july250-promo-panel-canton {
        font-size: 11px;
        padding: 10px 12px;
      }
      .july250-promo-panel-body {
        padding: 12px 14px 14px;
        font-size: 13px;
        line-height: 1.55;
        color: #1e293b;
      }
      .july250-promo-panel-lead {
        margin: 0 0 10px;
        font-size: 12px;
        color: #475569;
      }
      .july250-promo-panel-lead strong {
        color: ${USA_RED};
      }
      .july250-promo-panel-list {
        margin: 0 0 12px;
        padding-left: 18px;
        color: #475569;
      }
      .july250-promo-panel-list li {
        margin-bottom: 4px;
      }
      .july250-promo-panel-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .july250-promo-btn-primary {
        padding: 8px 14px;
        border-radius: 8px;
        border: 2px solid ${USA_BLUE};
        background: linear-gradient(180deg, ${USA_RED} 0%, #9b1c2e 100%);
        color: ${USA_WHITE};
        font-weight: 800;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(178, 34, 52, 0.25);
      }
      .july250-promo-btn-secondary {
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: ${USA_WHITE};
        color: ${USA_BLUE};
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
      }
      @media (max-width: 900px) {
        .july250-promo-anchor {
          left: 10px;
          max-width: min(300px, calc(100vw - 80px));
        }
        .july250-promo-canton-label {
          font-size: 9px;
        }
      }
    `}</style>
  )
}
