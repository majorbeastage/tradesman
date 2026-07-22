/**
 * When a push notification is tapped in Tradesman Messaging, open that thread.
 */
import { Capacitor } from "@capacitor/core"
import { setPendingThread, threadFromPushData } from "./pendingThread"

let attached = false

export async function initMessagingPushTapListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  if (attached) return () => {}
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    attached = true
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action?.notification?.data ?? {}) as Record<string, unknown>
      const pending = threadFromPushData(data)
      if (pending) setPendingThread(pending)
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
