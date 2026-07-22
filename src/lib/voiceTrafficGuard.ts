/** Lightweight store so MainAppSessionGuard can protect live softphone/conference calls. */

type Listener = (inCall: boolean) => void

let inCall = false
const listeners = new Set<Listener>()

export function getVoiceTrafficInCall(): boolean {
  return inCall
}

export function setVoiceTrafficInCall(next: boolean): void {
  if (inCall === next) return
  inCall = next
  for (const l of listeners) {
    try {
      l(inCall)
    } catch {
      /* ignore */
    }
  }
}

export function subscribeVoiceTrafficInCall(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
