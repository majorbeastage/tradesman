import { Capacitor } from "@capacitor/core"
import { setPendingDial } from "./pendingDial"

/** Android tel: / PhoneAccount handoff → Phone tab (and auto-dial when chosen from the system). */
export async function initSystemDialHandler(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => undefined
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    const launch = await MessagingNative.consumePendingDial()
    if (launch?.phone?.trim()) {
      setPendingDial({ phone: launch.phone.trim(), label: launch.label?.trim() || undefined, autoStart: true })
    }
    const handle = await MessagingNative.addListener("pendingDial", (data) => {
      const phone = data?.phone?.trim()
      if (!phone) return
      setPendingDial({ phone, label: data.label?.trim() || undefined, autoStart: true })
    })
    return () => {
      void handle.remove()
    }
  } catch {
    return () => undefined
  }
}
