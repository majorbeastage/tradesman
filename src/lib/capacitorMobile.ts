import { Capacitor } from "@capacitor/core"
import type { SupabaseClient } from "@supabase/supabase-js"

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

let pushListenerCleanups: Array<() => void | Promise<void>> = []
let pushListenersAttachedForUserId: string | null = null

/** Remove FCM registration listeners (e.g. on sign-out or before re-attaching for another user). */
export async function detachPushTokenUpsertListeners(): Promise<void> {
  for (const c of pushListenerCleanups) {
    try {
      const r = c()
      if (r && typeof (r as Promise<void>).then === "function") await (r as Promise<void>)
    } catch {
      /* ignore */
    }
  }
  pushListenerCleanups = []
  pushListenersAttachedForUserId = null
}

/**
 * Must run **before** `PushNotifications.register()` so the `registration` event is not missed (Capacitor / FCM).
 * Upserts into `user_push_devices` for the given Supabase user id.
 */
export async function attachPushTokenUpsertListeners(
  supabase: SupabaseClient | null,
  userId: string | null,
): Promise<void> {
  if (!isNativeApp() || !supabase || !userId) return
  if (pushListenersAttachedForUserId === userId && pushListenerCleanups.length > 0) return
  await detachPushTokenUpsertListeners()
  pushListenersAttachedForUserId = userId
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    const h1 = await PushNotifications.addListener("registration", async (t) => {
      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android"
      const { error } = await supabase.from("user_push_devices").upsert(
        {
          user_id: userId,
          token: t.value,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      )
      if (error) console.warn("[push] user_push_devices upsert:", error.message)
    })
    pushListenerCleanups.push(() => void h1.remove())
    const h2 = await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registrationError", err.error)
    })
    pushListenerCleanups.push(() => void h2.remove())
  } catch (e) {
    pushListenersAttachedForUserId = null
    console.warn("[push] listener attach failed", e)
  }
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

export async function requestPushPermissionAndRegister(
  supabase: SupabaseClient | null,
  userId: string | null,
): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) {
    return { ok: false, message: "Push on this build: use the Tradesman app from the store. Web: enable notifications in the browser when prompted." }
  }
  if (!userId) {
    return { ok: false, message: "Sign in on this device to register for push notifications." }
  }
  try {
    await attachPushTokenUpsertListeners(supabase, userId)
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
    // Brief yield so native FCM / listener wiring can settle (reduces rare crashes right after the OS dialog).
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 150)
    })
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
