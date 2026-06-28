import { useMemo, type ReactNode } from "react"
import { useAppScheme } from "../contexts/AppSchemeContext"
import type { AppSchemeId } from "../lib/appSchemes"

const MATRIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&"

function MatrixRainColumn({ leftPct, delay, duration }: { leftPct: number; delay: number; duration: number }) {
  const chars = useMemo(() => {
    const len = 8 + Math.floor(Math.random() * 10)
    return Array.from({ length: len }, () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)])
  }, [])

  return (
    <div
      className="scheme-matrix-column"
      style={{ left: `${leftPct}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
      aria-hidden
    >
      {chars.map((c, i) => (
        <span key={i} style={{ opacity: 1 - i * 0.08 }}>
          {c}
        </span>
      ))}
    </div>
  )
}

function MatrixRain() {
  const columns = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        leftPct: 4 + i * 6.5,
        delay: (i * 0.35) % 3,
        duration: 2.8 + (i % 5) * 0.4,
      })),
    [],
  )
  return (
    <div className="scheme-matrix-rain" aria-hidden>
      {columns.map((c) => (
        <MatrixRainColumn key={c.id} leftPct={c.leftPct} delay={c.delay} duration={c.duration} />
      ))}
    </div>
  )
}

function SunshinePalms() {
  return (
    <div className="scheme-sunshine-palms" aria-hidden>
      <div className="scheme-sunshine-palm scheme-sunshine-palm--left" />
      <div className="scheme-sunshine-palm scheme-sunshine-palm--right" />
    </div>
  )
}

const DECOR_BY_SCHEME: Partial<Record<AppSchemeId, () => ReactNode>> = {
  matrix: MatrixRain,
  sunshine: SunshinePalms,
}

export default function SchemeSidebarDecorations() {
  const { schemeId } = useAppScheme()
  const Decor = DECOR_BY_SCHEME[schemeId]
  if (!Decor) return null
  return <Decor />
}
