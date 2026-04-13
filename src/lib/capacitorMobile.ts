import { Capacitor } from "@capacitor/core"

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export async function requestPushPermissionAndRegister(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) {
    return { ok: false, message: "Push on this build: use the Tradesman app from the store. Web: enable notifications in the browser when prompted." }
  }
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") {
      return { ok: false, message: "Notification permission was not granted. You can enable it in system Settings for Tradesman." }
    }
    await PushNotifications.register()
    return { ok: true, message: "Registered for push notifications on this device." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function requestGpsPermission(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) {
    return { ok: false, message: "GPS: allow location in the browser when prompted, or use the mobile app for background-friendly location (when enabled)." }
  }
  try {
    const { Geolocation } = await import("@capacitor/geolocation")
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      return { ok: false, message: "Location permission was not granted." }
    }
    await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
    return { ok: true, message: "Location access is enabled for this app." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
