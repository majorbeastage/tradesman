/**
 * In-app ring / ringback for team calls (Web Audio — no asset file required).
 * Also vibrates on devices that support it.
 */

let ctx: AudioContext | null = null
let oscA: OscillatorNode | null = null
let oscB: OscillatorNode | null = null
let gain: GainNode | null = null
let patternTimer: ReturnType<typeof setInterval> | null = null
let vibrateTimer: ReturnType<typeof setInterval> | null = null
let running = false

function ensureCtx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    if (!ctx) ctx = new AC()
    return ctx
  } catch {
    return null
  }
}

function beepBurst(audio: AudioContext, msOn: number) {
  try {
    gain?.disconnect()
    oscA?.stop()
    oscB?.stop()
  } catch {
    /* ignore */
  }
  const g = audio.createGain()
  g.gain.value = 0.12
  g.connect(audio.destination)
  const a = audio.createOscillator()
  const b = audio.createOscillator()
  a.type = "sine"
  b.type = "sine"
  a.frequency.value = 440
  b.frequency.value = 480
  a.connect(g)
  b.connect(g)
  a.start()
  b.start()
  oscA = a
  oscB = b
  gain = g
  window.setTimeout(() => {
    try {
      a.stop()
      b.stop()
      g.disconnect()
    } catch {
      /* ignore */
    }
    if (oscA === a) {
      oscA = null
      oscB = null
      gain = null
    }
  }, msOn)
}

/** Start repeating ring pattern (incoming or outbound ringback). */
export function startCallRingtone(): void {
  if (running) return
  running = true
  const audio = ensureCtx()
  void audio?.resume?.()

  const tick = () => {
    if (!running) return
    const a = ensureCtx()
    if (a) beepBurst(a, 900)
  }
  tick()
  patternTimer = setInterval(tick, 2800)

  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      const pulse = () => {
        if (!running) return
        try {
          navigator.vibrate([400, 200, 400, 1200])
        } catch {
          /* ignore */
        }
      }
      pulse()
      vibrateTimer = setInterval(pulse, 2200)
    }
  } catch {
    /* ignore */
  }
}

export function stopCallRingtone(): void {
  running = false
  if (patternTimer) {
    clearInterval(patternTimer)
    patternTimer = null
  }
  if (vibrateTimer) {
    clearInterval(vibrateTimer)
    vibrateTimer = null
  }
  try {
    oscA?.stop()
    oscB?.stop()
    gain?.disconnect()
  } catch {
    /* ignore */
  }
  oscA = null
  oscB = null
  gain = null
  try {
    navigator.vibrate?.(0)
  } catch {
    /* ignore */
  }
}
