/** Broadcast when sandbox injects leads or comms so open pages can refresh. */

export const SANDBOX_TRAFFIC_EVENT = "tradesman-sandbox-traffic"

export function dispatchSandboxTrafficEvent(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SANDBOX_TRAFFIC_EVENT))
}

export function onSandboxTraffic(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = () => cb()
  window.addEventListener(SANDBOX_TRAFFIC_EVENT, handler)
  return () => window.removeEventListener(SANDBOX_TRAFFIC_EVENT, handler)
}
