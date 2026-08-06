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

function applyPushData(data: Record<string, unknown>): void {
  if (isMissedCallPush(data)) {
    setPendingMissedCalls(true)
    return
  }
  const pending = threadFromPushData(data)
  if (pending) setPendingThread(pending)
}

async function attachAndroidLaunchPushHandlers(
  removeFns: Array<() => void | Promise<void>>,
): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    const launch = await MessagingNative.consumeLaunchPushData()
    if (launch && Object.keys(launch).length) applyPushData(launch)
    const launchHandle = await MessagingNative.addListener("pushLaunch", (data) => {
      if (data && Object.keys(data).length) applyPushData(data)
    })
    removeFns.push(() => void launchHandle.remove())
  } catch {
    /* native bridge unavailable */
  }
}

export async function initMessagingPushTapListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  if (attached) return () => {}
  const removeFns: Array<() => void | Promise<void>> = []
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    attached = true
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      applyPushData(readData(action))
    })
    removeFns.push(() => void handle.remove())
    await attachAndroidLaunchPushHandlers(removeFns)
    return () => {
      attached = false
      for (const remove of removeFns) void remove()
    }
  } catch {
    attached = false
    return () => {}
  }
}
