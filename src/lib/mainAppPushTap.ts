/**
 * Main Tradesman app: IM / missed-call pushes should open Messaging, not stay here.
 * Attach as early as possible so cold-start taps are not missed.
 */
import { Capacitor } from "@capacitor/core"
import { openMessagingAppWithSession } from "./messagingHandoff"

let attached = false
let pendingHandoff: { threadId?: string; messageId?: string; openMissed?: boolean } | null = null

function readPushData(action: {
  notification?: { data?: Record<string, unknown>; extra?: Record<string, unknown> }
}): Record<string, unknown> {
  const n = action?.notification
  return {
    ...(n?.extra && typeof n.extra === "object" ? n.extra : {}),
    ...(n?.data && typeof n.data === "object" ? n.data : {}),
  }
}

function parseHandoff(data: Record<string, unknown>): {
  threadId?: string
  messageId?: string
  openMissed?: boolean
} | null {
  const type = String(data.type ?? data.Type ?? "").trim()
  const threadId = String(data.threadId ?? data.thread_id ?? data.thread ?? "").trim()
  const messageId = String(data.messageId ?? data.message_id ?? "").trim() || undefined
  if (type === "internal_missed_call" || data.missedCallId) {
    return { openMissed: true }
  }
  if (threadId && (!type || type === "internal_message")) {
    return { threadId, messageId }
  }
  // Some Android builds flatten FCM data without type — still hand off if thread present.
  if (threadId) return { threadId, messageId }
  return null
}

async function runHandoff(target: { threadId?: string; messageId?: string; openMissed?: boolean }) {
  const r = await openMessagingAppWithSession({
    threadId: target.threadId ?? null,
    messageId: target.messageId ?? null,
    openMissed: target.openMissed === true,
  })
  if (!r.ok && r.error) {
    try {
      window.alert(r.error)
    } catch {
      /* ignore */
    }
  }
}

/** Flush a tap that arrived before the auth session was ready. */
export function flushPendingMessagingHandoff(): void {
  if (!pendingHandoff) return
  const t = pendingHandoff
  pendingHandoff = null
  void runHandoff(t)
}

export async function initMainAppPushTapListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  if (attached) return () => {}
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    attached = true
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = readPushData(action)
      const target = parseHandoff(data)
      if (!target) return
      // Defer briefly so auth/session can hydrate on cold start.
      window.setTimeout(() => {
        void runHandoff(target).catch(() => {
          pendingHandoff = target
        })
      }, 400)
    })
    return () => {
      attached = false
      void handle.remove()
    }
  } catch {
    attached = false
    return () => {}
  }
}
