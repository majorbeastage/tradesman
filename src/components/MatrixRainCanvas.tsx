import { useEffect, useRef } from "react"
import {
  MATRIX_RAIN_PRESETS,
  startMatrixRain,
  type MatrixRainConfig,
} from "../lib/matrixRainEngine"

type Variant = keyof typeof MATRIX_RAIN_PRESETS

type Props = {
  variant?: Variant
  config?: MatrixRainConfig
  className?: string
  /** 0–1 canvas element opacity */
  opacity?: number
}

export default function MatrixRainCanvas({
  variant = "shell",
  config,
  className = "",
  opacity,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const preset = { ...MATRIX_RAIN_PRESETS[variant], ...config }
    return startMatrixRain(canvas, preset)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preset fields are stable per variant
  }, [variant])

  const op = opacity ?? (variant === "sidebar" ? 0.42 : 0.28)

  return (
    <canvas
      ref={canvasRef}
      className={`matrix-rain-canvas ${className}`.trim()}
      aria-hidden
      style={{ opacity: op }}
    />
  )
}
