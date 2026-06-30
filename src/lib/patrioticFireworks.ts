/** Canvas rocket + burst fireworks — up to ~60s, red/white/blue/gold. */

const COLORS = ["#B22234", "#3C3B6E", "#FFFFFF", "#fbbf24", "#60a5fa"] as const

type Rocket = {
  x: number
  y: number
  vy: number
  targetY: number
  color: string
  trail: { x: number; y: number }[]
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

function pickColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0]
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function startPatrioticFireworks(opts?: { durationMs?: number }): () => void {
  const durationMs = opts?.durationMs ?? 60_000
  if (typeof document === "undefined") return () => {}

  const canvas = document.createElement("canvas")
  canvas.setAttribute("aria-hidden", "true")
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;"
  document.body.appendChild(canvas)

  const rawCtx = canvas.getContext("2d")
  if (!rawCtx) {
    canvas.remove()
    return () => {}
  }
  const drawCtx: CanvasRenderingContext2D = rawCtx

  let w = 0
  let h = 0
  const resize = () => {
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = w
    canvas.height = h
  }
  resize()
  window.addEventListener("resize", resize)

  const rockets: Rocket[] = []
  const particles: Particle[] = []
  const started = performance.now()
  let lastLaunch = 0
  let raf = 0
  let stopped = false

  const reduced = prefersReducedMotion()
  const launchInterval = reduced ? 1200 : 550
  const maxRocketsPerTick = reduced ? 1 : 2

  function launchRocket() {
    const x = w * (0.12 + Math.random() * 0.76)
    const targetY = h * (0.12 + Math.random() * 0.38)
    rockets.push({
      x,
      y: h + 8,
      vy: -(7 + Math.random() * 5),
      targetY,
      color: pickColor(),
      trail: [],
    })
  }

  function explode(x: number, y: number, color: string) {
    const count = reduced ? 24 : 48 + Math.floor(Math.random() * 32)
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35
      const speed = 1.8 + Math.random() * 4.2
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 45 + Math.random() * 35,
        color: Math.random() < 0.35 ? pickColor() : color,
        size: 1.2 + Math.random() * 2.2,
      })
    }
    // Secondary sparkle ring
    if (!reduced) {
      for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.6 + Math.random() * 1.4
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 28 + Math.random() * 18,
          color: "#FFFFFF",
          size: 1 + Math.random(),
        })
      }
    }
  }

  function tick(now: number) {
    if (stopped) return
    const elapsed = now - started
    if (elapsed >= durationMs) {
      stop()
      return
    }

    if (now - lastLaunch >= launchInterval) {
      lastLaunch = now
      for (let i = 0; i < maxRocketsPerTick; i++) launchRocket()
    }

    drawCtx.clearRect(0, 0, w, h)

    // Rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]!
      r.trail.push({ x: r.x, y: r.y })
      if (r.trail.length > 14) r.trail.shift()
      r.y += r.vy
      r.vy *= 0.985

      for (let t = 0; t < r.trail.length; t++) {
        const p = r.trail[t]!
        const alpha = (t + 1) / r.trail.length
        drawCtx.beginPath()
        drawCtx.fillStyle = r.color
        drawCtx.globalAlpha = alpha * 0.45
        drawCtx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
        drawCtx.fill()
      }

      drawCtx.globalAlpha = 1
      drawCtx.beginPath()
      drawCtx.fillStyle = r.color
      drawCtx.arc(r.x, r.y, 2.5, 0, Math.PI * 2)
      drawCtx.fill()

      if (r.y <= r.targetY || r.vy >= -0.5) {
        explode(r.x, r.y, r.color)
        rockets.splice(i, 1)
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      p.life += 1
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.06
      p.vx *= 0.985

      const t = 1 - p.life / p.maxLife
      if (t <= 0) {
        particles.splice(i, 1)
        continue
      }

      drawCtx.globalAlpha = t * t
      drawCtx.beginPath()
      drawCtx.fillStyle = p.color
      drawCtx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2)
      drawCtx.fill()

      if (p.color === "#FFFFFF" && t > 0.5 && !reduced) {
        drawCtx.globalAlpha = t * 0.35
        drawCtx.strokeStyle = "#fbbf24"
        drawCtx.lineWidth = 0.8
        const s = p.size * 2.2 * t
        drawCtx.beginPath()
        drawCtx.moveTo(p.x - s, p.y)
        drawCtx.lineTo(p.x + s, p.y)
        drawCtx.moveTo(p.x, p.y - s)
        drawCtx.lineTo(p.x, p.y + s)
        drawCtx.stroke()
      }
    }

    drawCtx.globalAlpha = 1
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener("resize", resize)
    canvas.remove()
  }

  launchRocket()
  if (!reduced) launchRocket()
  raf = requestAnimationFrame(tick)

  return stop
}
