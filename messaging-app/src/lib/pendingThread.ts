/** Open a specific IM thread after a push tap or deep link. */

export type PendingThread = { threadId: string; messageId?: string }

export const PENDING_THREAD_EVENT = "tradesman-pending-thread"

let pending: PendingThread | null = null

export function setPendingThread(thread: PendingThread | null): void {
  pending = thread
  try {
    if (typeof sessionStorage === "undefined") return
    if (!thread) {
      sessionStorage.removeItem("tradesman_pending_thread")
      return
    }
    sessionStorage.setItem("tradesman_pending_thread", JSON.stringify(thread))
  } catch {
    /* ignore */
  }
  if (thread && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<PendingThread>(PENDING_THREAD_EVENT, { detail: thread }))
  }
}

export function takePendingThread(): PendingThread | null {
  if (pending) {
    const d = pending
    pending = null
    try {
      sessionStorage.removeItem("tradesman_pending_thread")
    } catch {
      /* ignore */
    }
    return d
  }
  try {
    const raw = sessionStorage.getItem("tradesman_pending_thread")
    if (!raw) return null
    sessionStorage.removeItem("tradesman_pending_thread")
    const parsed = JSON.parse(raw) as PendingThread
    if (parsed?.threadId?.trim()) {
      return { threadId: parsed.threadId.trim(), messageId: parsed.messageId?.trim() || undefined }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function parseThreadFromUrl(url: string): PendingThread | null {
  try {
    const hashIndex = url.indexOf("#")
    const frag = hashIndex >= 0 ? url.slice(hashIndex + 1) : ""
    const qIndex = url.indexOf("?")
    const query = qIndex >= 0 ? url.slice(qIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : ""
    const params = new URLSearchParams(frag || query)
    // Also support tradesmanmsg://thread/<uuid>
    const pathMatch = url.match(/tradesmanmsg:\/\/thread\/([0-9a-f-]{36})/i)
    const threadId = params.get("thread")?.trim() || pathMatch?.[1] || ""
    if (!threadId) return null
    const messageId = params.get("messageId")?.trim() || undefined
    return { threadId, messageId }
  } catch {
    return null
  }
}

/** Extract threadId from Capacitor push notification data. */
export function threadFromPushData(data: Record<string, unknown> | undefined): PendingThread | null {
  if (!data) return null
  const type = String(data.type ?? data.Type ?? "")
  const threadId = String(data.threadId ?? data.thread_id ?? data.thread ?? "").trim()
  if (!threadId) return null
  if (type && type !== "internal_message") return null
  const messageId = String(data.messageId ?? data.message_id ?? "").trim() || undefined
  return { threadId, messageId }
}
