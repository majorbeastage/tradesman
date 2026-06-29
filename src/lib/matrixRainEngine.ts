/** Canvas Matrix rain — falling glyphs, glow head, configurable & resize-safe. */

export type MatrixRainConfig = {
  /** Main glyph color (CSS) */
  color?: string
  /** Leading character per column */
  headColor?: string
  /** Trail fade per frame (0.04–0.14); lower = longer trails */
  fadeStrength?: number
  fontSize?: number
  /** Fall speed multiplier */
  speed?: number
  /** Canvas shadowBlur for glow */
  glowBlur?: number
  charset?: string
  /** Max frames per second */
  fps?: number
}

export const MATRIX_CHARSET = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&"

export const MATRIX_RAIN_PRESETS = {
  /** Full portal shell — subtle, wide */
  shell: {
    color: "#22c55e",
    headColor: "#bbf7d0",
    fadeStrength: 0.06,
    fontSize: 14,
    speed: 0.85,
    glowBlur: 12,
    fps: 28,
  },
  /** Sidebar — denser, slightly brighter */
  sidebar: {
    color: "#22c55e",
    headColor: "#ecfdf5",
    fadeStrength: 0.08,
    fontSize: 11,
    speed: 1.1,
    glowBlur: 10,
    fps: 30,
  },
} as const satisfies Record<string, MatrixRainConfig>

type Column = { y: number; speed: number }

export function startMatrixRain(
  canvas: HTMLCanvasElement,
  preset: MatrixRainConfig = MATRIX_RAIN_PRESETS.shell,
): () => void {
  const ctx = canvas.getContext("2d", { alpha: true })
  if (!ctx) return () => {}

  const cfg = { ...MATRIX_RAIN_PRESETS.shell, ...preset }
  const charset = cfg.charset ?? MATRIX_CHARSET
  const fontSize = cfg.fontSize ?? 14
  const fade = cfg.fadeStrength ?? 0.06
  const glow = cfg.glowBlur ?? 10
  const baseSpeed = cfg.speed ?? 1
  const fps = cfg.fps ?? 30
  const frameMs = 1000 / fps

  let columns: Column[] = []
  let width = 0
  let height = 0
  let dpr = 1
  let raf = 0
  let last = 0
  let running = true

  const resize = () => {
    const parent = canvas.parentElement
    const w = parent?.clientWidth ?? window.innerWidth
    const h = parent?.clientHeight ?? window.innerHeight
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = Math.max(1, w)
    height = Math.max(1, h)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const n = Math.max(1, Math.ceil(width / fontSize))
    columns = Array.from({ length: n }, () => ({
      y: Math.random() * (height / fontSize),
      speed: baseSpeed * (0.6 + Math.random() * 0.8),
    }))
  }

  const pick = () => charset[Math.floor(Math.random() * charset.length)] ?? "0"

  const draw = (now: number) => {
    if (!running) return
    raf = requestAnimationFrame(draw)
    if (now - last < frameMs) return
    last = now

    ctx.fillStyle = `rgba(0, 0, 0, ${fade})`
    ctx.fillRect(0, 0, width, height)

    ctx.font = `600 ${fontSize}px "Consolas", "Courier New", monospace`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!
      const x = i * fontSize + fontSize / 2
      const y = col.y * fontSize

      ctx.shadowBlur = glow
      ctx.shadowColor = cfg.headColor ?? "#bbf7d0"
      ctx.fillStyle = cfg.headColor ?? "#bbf7d0"
      ctx.fillText(pick(), x, y)

      const trailY = y - fontSize
      if (trailY > 0) {
        ctx.shadowBlur = glow * 0.35
        ctx.shadowColor = cfg.color ?? "#22c55e"
        ctx.fillStyle = cfg.color ?? "#22c55e"
        ctx.globalAlpha = 0.55
        ctx.fillText(pick(), x, trailY)
        ctx.globalAlpha = 1
      }

      ctx.shadowBlur = 0
      col.y += col.speed
      if (col.y * fontSize > height + fontSize * 4) {
        col.y = -Math.random() * 12
        col.speed = baseSpeed * (0.6 + Math.random() * 0.8)
      }
    }
  }

  resize()
  raf = requestAnimationFrame(draw)

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null
  ro?.observe(canvas.parentElement ?? canvas)
  window.addEventListener("resize", resize)

  const onVis = () => {
    if (document.hidden) {
      running = false
      cancelAnimationFrame(raf)
    } else {
      running = true
      last = 0
      raf = requestAnimationFrame(draw)
    }
  }
  document.addEventListener("visibilitychange", onVis)

  return () => {
    running = false
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener("resize", resize)
    document.removeEventListener("visibilitychange", onVis)
  }
}
