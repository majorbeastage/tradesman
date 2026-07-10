const VISITOR_KEY = "tradesman_traffic_vid"
const DEDUPE_PREFIX = "tradesman_traffic_seen:"

function visitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY)
    if (existing?.trim()) return existing.trim()
    const id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, id)
    return id
  } catch {
    return ""
  }
}

function shouldRecord(viewKey: string): boolean {
  try {
    const key = DEDUPE_PREFIX + viewKey
    const prev = sessionStorage.getItem(key)
    const now = Date.now()
    if (prev && now - Number.parseInt(prev, 10) < 30_000) return false
    sessionStorage.setItem(key, String(now))
    return true
  } catch {
    return true
  }
}

/** Fire-and-forget page view for public marketing routes (logged server-side). */
export function recordMarketingPageView(viewKey: string, path?: string): void {
  const vk = viewKey.trim() || "home"
  if (!shouldRecord(vk)) return

  const body = JSON.stringify({
    viewKey: vk,
    path: (path ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.hash}` : "/")).slice(0, 500),
    referrer: typeof document !== "undefined" ? document.referrer.slice(0, 2000) : "",
    visitorId: visitorId(),
  })

  try {
    void fetch("/api/site-traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
  } catch {
    /* optional telemetry */
  }
}
