/**
 * Main Tradesman app: when an Instant Messaging push is tapped, open Messaging to that thread.
 */
import { Capacitor } from "@capacitor/core"
import { openMessagingAppWithSession } from "./messagingHandoff"

let attached = false

function threadFromData(data: Record<string, unknown> | undefined): { threadId: string; messageId?: string } | null {
  if (!data) return null
  const type = String(data.type ?? "")
  const threadId = String(data.threadId ?? data.thread_id ?? data.thread ?? "").trim()
  if (!threadId) return null
  if (type && type !== "internal_message") return null
  const messageId = String(data.messageId ?? data.message_id ?? "").trim() || undefined
  return { threadId, messageId }
}

export async function initMainAppPushTapListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  if (attached) return () => {}
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    attached = true
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action?.notification?.data ?? {}) as Record<string, unknown>
      const pending = threadFromData(data)
      if (!pending) return
      void openMessagingAppWithSession({
        threadId: pending.threadId,
        messageId: pending.messageId,
      }).then((r) => {
        if (!r.ok && r.error) {
          try {
            window.alert(r.error)
          } catch {
            /* ignore */
          }
        }
      })
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
