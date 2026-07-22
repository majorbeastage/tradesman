/**
 * When a push notification is tapped in Tradesman Messaging, open that thread
 * (or the missed-calls list).
 */
import { Capacitor } from "@capacitor/core"
import {
  isMissedCallPush,
  setPendingMissedCalls,
  setPendingThread,
  threadFromPushData,
} from "./pendingThread"

let attached = false

function readData(action: {
  notification?: { data?: Record<string, unknown>; extra?: Record<string, unknown> }
}): Record<string, unknown> {
  const n = action?.notification
  return {
    ...(n?.extra && typeof n.extra === "object" ? n.extra : {}),
    ...(n?.data && typeof n.data === "object" ? n.data : {}),
  }
}

export async function initMessagingPushTapListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  if (attached) return () => {}
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    attached = true
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = readData(action)
      if (isMissedCallPush(data)) {
        setPendingMissedCalls(true)
        return
      }
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
