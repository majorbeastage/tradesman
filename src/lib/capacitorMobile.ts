import { Capacitor } from "@capacitor/core"

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** Opens this app’s page in system Settings (location / notifications toggles). */
export async function openAppSystemSettings(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) {
    return { ok: false, message: "On web, use your browser’s site settings to allow location or notifications." }
  }
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import("capacitor-native-settings")
    await NativeSettings.open({
      optionAndroid: AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App,
    })
    return { ok: true, message: "" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

function humanizePermissionError(e: unknown, kind: "location" | "notifications"): string {
  const raw = e instanceof Error ? e.message : String(e)
  const lower = raw.toLowerCase()
  if (kind === "location") {
    if (lower.includes("permission") || lower.includes("access_fine_location") || lower.includes("access_coarse_location")) {
      return "Android needs location permission for Tradesman. Use “Open system settings” below, then Permissions → Location → Allow."
    }
  } else {
    if (lower.includes("permission") || lower.includes("post_notifications")) {
      return "Android needs notification permission. Use “Open system settings” below, then Notifications → Allow."
    }
  }
  return raw || "Permission request failed."
}

export async function requestPushPermissionAndRegister(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) {
    return { ok: false, message: "Push on this build: use the Tradesman app from the store. Web: enable notifications in the browser when prompted." }
  }
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    const existing = await PushNotifications.checkPermissions()
    if (existing.receive === "denied") {
      return {
        ok: false,
        message:
          "Notifications were denied for this app. Tap “Open system settings”, turn notifications on for Tradesman, then try again.",
      }
    }
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") {
      return {
        ok: false,
        message:
          "Notification permission was not granted. You can enable it under Settings → Apps → Tradesman → Notifications, or use “Open system settings” below.",
      }
    }
    await PushNotifications.register()
    return { ok: true, message: "Registered for push notifications on this device." }
  } catch (e) {
    return { ok: false, message: humanizePermissionError(e, "notifications") }
  }
}

export async function requestGpsPermission(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) {
    return { ok: false, message: "GPS: allow location in the browser when prompted, or use the mobile app for device location (when enabled)." }
  }
  try {
    const { Geolocation } = await import("@capacitor/geolocation")
    let existing: { location: string; coarseLocation: string }
    try {
      existing = await Geolocation.checkPermissions()
    } catch {
      existing = { location: "prompt", coarseLocation: "prompt" }
    }
    const hadFine = existing.location === "granted"
    const hadCoarse = existing.coarseLocation === "granted"
    if (!hadFine && !hadCoarse && (existing.location === "denied" || existing.coarseLocation === "denied")) {
      return {
        ok: false,
        message:
          "Location was denied for this app. Tap “Open system settings”, allow Location for Tradesman, then try again.",
      }
    }
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      return {
        ok: false,
        message:
          "Location permission was not granted. Use “Open system settings” → Permissions → Location → Allow while using the app.",
      }
    }
    await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
    return { ok: true, message: "Location access is enabled for this app." }
  } catch (e) {
    return { ok: false, message: humanizePermissionError(e, "location") }
  }
}
