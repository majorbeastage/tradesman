/** Minimal shape for Web Speech API result events (browser + Capacitor WebView). */
export type SpeechResultsLike = {
  length: number
  [index: number]: {
    isFinal: boolean
    0?: { transcript?: string }
  }
}

export function isLikelyMobileSpeechPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches) return true
  return typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1
}

/** Prefer single-phrase recognition on phones — avoids cumulative duplicate finals. */
export function speechRecognitionOptionsForPlatform(): { continuous: boolean; interimResults: boolean } {
  if (isLikelyMobileSpeechPlatform()) {
    return { continuous: false, interimResults: false }
  }
  return { continuous: true, interimResults: true }
}

function normalizeSpeechChunk(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

/**
 * Merge final segments from one recognition session. Mobile engines often emit
 * cumulative phrases ("the" → "the roof" → "the roof needs") — keep the longest
 * extension instead of concatenating duplicates.
 */
export function mergeSpeechFinalSegments(segments: string[]): string {
  let merged = ""
  for (const raw of segments) {
    const seg = normalizeSpeechChunk(raw)
    if (!seg) continue
    if (!merged) {
      merged = seg
      continue
    }
    if (seg.startsWith(merged)) {
      merged = seg
      continue
    }
    if (merged.startsWith(seg)) continue
    let overlap = 0
    const max = Math.min(merged.length, seg.length)
    for (let n = max; n > 0; n -= 1) {
      if (merged.endsWith(seg.slice(0, n))) {
        overlap = n
        break
      }
    }
    merged = overlap > 0 ? `${merged}${seg.slice(overlap)}` : `${merged} ${seg}`
  }
  return normalizeSpeechChunk(merged)
}

function suffixPrefixOverlap(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  for (let n = max; n > 0; n -= 1) {
    if (a.endsWith(b.slice(0, n))) return n
  }
  return 0
}

/** Interim text should extend committed finals, not repeat them. */
export function speechInterimBeyondFinals(finals: string, interim: string): string {
  const f = finals.trimEnd()
  const it = normalizeSpeechChunk(interim)
  if (!it) return ""
  if (!f) return it
  if (it.startsWith(f)) return normalizeSpeechChunk(it.slice(f.length))
  const overlap = suffixPrefixOverlap(f, it)
  if (overlap > 0) return normalizeSpeechChunk(it.slice(overlap))
  return it
}

/**
 * Rebuild committed + live transcript from the full results list each event
 * (never += per piece — that duplicates on iOS/Android WebKit).
 */
export function parseSpeechResultsList(results: SpeechResultsLike): { finals: string; interim: string; display: string } {
  const finalSegments: string[] = []
  let lastInterim = ""
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i]
    const piece = item?.[0]?.transcript ?? ""
    if (!piece) continue
    if (item.isFinal) finalSegments.push(piece)
    else lastInterim = piece
  }
  const finals = mergeSpeechFinalSegments(finalSegments)
  const interim = speechInterimBeyondFinals(finals, lastInterim)
  const display = finals + (interim ? (finals ? " " : "") + interim : "")
  return { finals, interim, display }
}

export function combineSpeechSessionDisplay(sessionBase: string, parsed: { finals: string; interim: string }): string {
  const base = sessionBase ?? ""
  const body = parsed.finals + (parsed.interim ? (parsed.finals ? " " : "") + parsed.interim : "")
  if (!base) return body
  if (!body) return base
  const gap = base.endsWith(" ") || body.startsWith(" ") ? "" : " "
  return `${base}${gap}${body}`
}
