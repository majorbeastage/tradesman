import type { ReactNode } from "react"
import MatrixRainCanvas from "./MatrixRainCanvas"
import { useAppScheme } from "../contexts/AppSchemeContext"
import type { AppSchemeId } from "../lib/appSchemes"

function SunshinePalms() {
  return (
    <div className="scheme-sunshine-palms" aria-hidden>
      <div className="scheme-sunshine-palm scheme-sunshine-palm--left" />
      <div className="scheme-sunshine-palm scheme-sunshine-palm--right" />
    </div>
  )
}

const DECOR_BY_SCHEME: Partial<Record<AppSchemeId, () => ReactNode>> = {
  matrix: () => <MatrixRainCanvas variant="sidebar" className="matrix-rain-sidebar" />,
  sunshine: SunshinePalms,
}

export default function SchemeSidebarDecorations() {
  const { schemeId } = useAppScheme()
  const Decor = DECOR_BY_SCHEME[schemeId]
  if (!Decor) return null
  return <Decor />
}

/** Full-viewport Matrix rain when Matrix scheme is active. */
export function SchemeMatrixShellBackdrop() {
  const { schemeId } = useAppScheme()
  if (schemeId !== "matrix") return null
  return <MatrixRainCanvas variant="shell" className="matrix-rain-shell" />
}
