import { useEffect, useState } from "react"

/** Phone / tablet conference: keep the stage readable. */
export const MAX_VISIBLE_MOBILE = 4

export type StagePickInput = {
  key: string
  screen?: boolean
}

export function pickVisibleStageTiles<T extends StagePickInput>(
  tiles: T[],
  opts: { max: number; speakingIds: string[] },
): T[] {
  if (tiles.length <= opts.max) return tiles
  const out: T[] = []
  const seen = new Set<string>()
  const add = (tile?: T) => {
    if (!tile || seen.has(tile.key) || out.length >= opts.max) return
    seen.add(tile.key)
    out.push(tile)
  }
  add(tiles.find((t) => t.screen))
  for (const id of opts.speakingIds) add(tiles.find((t) => t.key === id))
  add(tiles.find((t) => t.key === "self"))
  for (const tile of tiles) add(tile)
  return out
}

export function videoGridLayout(tileCount: number): { columns: number; rows: number } {
  if (tileCount <= 1) return { columns: 1, rows: 1 }
  if (tileCount === 2) return { columns: 2, rows: 1 }
  if (tileCount <= 4) return { columns: 2, rows: 2 }
  if (tileCount <= 6) return { columns: 3, rows: 2 }
  const columns = Math.ceil(Math.sqrt(tileCount))
  return { columns, rows: Math.ceil(tileCount / columns) }
}

export function streamIsScreenShare(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false
  const track = stream.getVideoTracks().find((t) => t.readyState === "live") ?? stream.getVideoTracks()[0]
  if (!track) return false
  const settings = track.getSettings?.()
  if (settings?.displaySurface) return true
  return /screen|display|window|tab|share/i.test(track.label || "")
}

/** Rank remote streams by current speech energy (self is ignored). */
export function useSpeakingIds(participants: Array<{ id: string; stream: MediaStream | null }>): string[] {
  const [ids, setIds] = useState<string[]>([])
  const key = participants.map((p) => `${p.id}:${p.stream?.id ?? ""}`).join("|")

  useEffect(() => {
    if (typeof window === "undefined" || participants.length === 0) {
      setIds([])
      return
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    let ctx: AudioContext | null = null
    try {
      ctx = new AC()
    } catch {
      return
    }
    const nodes: Array<{ id: string; analyser: AnalyserNode; src: MediaStreamAudioSourceNode }> = []
    for (const p of participants) {
      if (!p.stream?.getAudioTracks().some((t) => t.readyState === "live")) continue
      try {
        const src = ctx.createMediaStreamSource(p.stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.6
        src.connect(analyser)
        nodes.push({ id: p.id, analyser, src })
      } catch {
        /* stream may lack audio */
      }
    }
    const buf = new Uint8Array(512)
    const tick = () => {
      const ranked = nodes
        .map((n) => {
          n.analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          return { id: n.id, level: Math.sqrt(sum / buf.length) }
        })
        .filter((r) => r.level > 0.035)
        .sort((a, b) => b.level - a.level)
      setIds(ranked.map((r) => r.id))
    }
    tick()
    const timer = window.setInterval(tick, 220)
    return () => {
      window.clearInterval(timer)
      for (const n of nodes) {
        try {
          n.src.disconnect()
          n.analyser.disconnect()
        } catch {
          /* ignore */
        }
      }
      void ctx?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stream identity
  }, [key])

  return ids
}
