import { Capacitor } from "@capacitor/core"
import type { SupabaseClient } from "@supabase/supabase-js"

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

let pushListenerCleanups: Array<() => void | Promise<void>> = []
let pushListenersAttachedForUserId: string | null = null
/** Serializes FCM `register()` — back-to-back calls can crash some Android WebViews. */
let pushRegisterChain: Promise<void> = Promise.resolve()
const MIN_MS_BETWEEN_PUSH_REGISTER = 2200
let lastPushRegisterAt = 0
const ANDROID_PUSH_CHANNEL_ID = "tradesman_alerts"

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

/**
 * Android: Capacitor `PushNotifications.register()` calls Firebase Messaging; without
 * `google-services.json` the default FirebaseApp never initializes and the native layer crashes.
 * iOS/Web: no-op guard (always registers when reached).
 */
async function registerPushIfFirebaseReady(reason: string): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications")
  if (Capacitor.getPlatform() === "android") {
    try {
      await PushNotifications.createChannel({
        id: ANDROID_PUSH_CHANNEL_ID,
        name: "Tradesman Alerts",
        description: "Dispatch updates, messages, and reminders",
        importance: 5,
        visibility: 1,
        sound: "default",
      })
    } catch (e) {
      console.warn("[push] createChannel failed", e)
    }
    try {
      const { TradesmanNative } = await import("../plugins/tradesman-native")
      const { available } = await TradesmanNative.getFcmAvailability()
      if (!available) {
        console.warn(
          `[push] ${reason}: Firebase not initialized for this Android build. Add Firebase \`google-services.json\` under \`android/app/\`, rebuild, then FCM registration will run. Skipping register() to prevent a crash.`,
        )
        return
      }
    } catch (e) {
      console.warn(`[push] ${reason}: FCM availability check failed; skipping register() on Android.`, e)
      return
    }
  }
  await PushNotifications.register()
}

function schedulePushRegister(task: () => Promise<void>): Promise<void> {
  pushRegisterChain = pushRegisterChain.then(
    () =>
      new Promise<void>((resolve) => {
        const run = () => {
          const gap = Date.now() - lastPushRegisterAt
          const wait = gap < MIN_MS_BETWEEN_PUSH_REGISTER ? MIN_MS_BETWEEN_PUSH_REGISTER - gap : 0
          window.setTimeout(() => {
            void (async () => {
              try {
                await task()
              } finally {
                lastPushRegisterAt = Date.now()
                resolve()
              }
            })()
          }, wait)
        }
        window.requestAnimationFrame(() => window.requestAnimationFrame(run))
      }),
  )
  return pushRegisterChain
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
    /** Never call `requestPermissions()` if already granted — a second OS prompt can destabilize some WebViews. */
    const perm =
      existing.receive === "granted" ? existing : await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") {
      return {
        ok: false,
        message:
          "Notification permission was not granted. You can enable it under Settings → Apps → Tradesman → Notifications, or use “Open system settings” below.",
      }
    }
    /**
     * If permission was just granted via a fresh OS prompt, avoid immediate `register()` in this tick.
     * Some Android WebViews crash when FCM register runs right after the system permission dialog returns.
     * Startup sync (`syncPushTokenIfPermissionGranted`) and this delayed task will complete registration.
     */
    const wasAlreadyGranted = existing.receive === "granted"
    if (!wasAlreadyGranted) {
      window.setTimeout(() => {
        void schedulePushRegister(async () => {
          try {
            await registerPushIfFirebaseReady("delayed-after-grant")
          } catch (regErr) {
            console.warn("[push] delayed register() after grant", regErr)
          }
        })
      }, 4500)
      return {
        ok: true,
        message:
          "Notifications enabled. Finishing device registration in the background; wait a few seconds before test push.",
      }
    }
    // Permission was already granted before this action: safe to register now.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 900)
    })
    await schedulePushRegister(async () => {
      try {
        await registerPushIfFirebaseReady("permission-flow")
      } catch (regErr) {
        console.warn("[push] register()", regErr)
        throw regErr
      }
    })
    // Ensure this device row exists before user taps "Send test push".
    if (supabase && userId) {
      const started = Date.now()
      while (Date.now() - started < 3000) {
        const { data } = await supabase
          .from("user_push_devices")
          .select("id")
          .eq("user_id", userId)
          .limit(1)
        if ((data?.length ?? 0) > 0) {
          return { ok: true, message: "Registered for push notifications on this device." }
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
      }
      return {
        ok: true,
        message:
          "Permission granted. Token registration may still be syncing; wait a few seconds, then send test push again.",
      }
    }
    return { ok: true, message: "Registered for push notifications on this device." }
  } catch (e) {
    return { ok: false, message: humanizePermissionError(e, "notifications") }
  }
}

export type SyncPushStartupOptions = {
  /**
   * When true and the OS status is `prompt`, calls `requestPermissions()` so the system sheet appears
   * (user must have opted in under MyT — same idea as GPS after enabling location).
   */
  requestPermissionIfPrompt?: boolean
}

/**
 * Startup sync for native installs: attach listeners and register with FCM when allowed.
 * By default does not show the permission sheet unless `requestPermissionIfPrompt` is true and status is `prompt`.
 */
export async function syncPushTokenIfPermissionGranted(
  supabase: SupabaseClient | null,
  userId: string | null,
  options?: SyncPushStartupOptions,
): Promise<void> {
  if (!isNativeApp() || !supabase || !userId) return
  try {
    await attachPushTokenUpsertListeners(supabase, userId)
    const { PushNotifications } = await import("@capacitor/push-notifications")
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === "denied") return
    if (perm.receive !== "granted") {
      if (options?.requestPermissionIfPrompt && perm.receive === "prompt") {
        perm = await PushNotifications.requestPermissions()
      }
      if (perm.receive !== "granted") return
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 2000))
    await schedulePushRegister(async () => {
      try {
        await registerPushIfFirebaseReady("startup-sync")
      } catch (regErr) {
        console.warn("[push] startup register()", regErr)
      }
    })
  } catch (e) {
    console.warn("[push] startup sync failed", e)
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
    if (hadFine || hadCoarse) {
      await new Promise<void>((r) => window.setTimeout(r, 400))
      await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
      return { ok: true, message: "Location access is already enabled for this app." }
    }
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      return {
        ok: false,
        message:
          "Location permission was not granted. Use “Open system settings” → Permissions → Location → Allow while using the app.",
      }
    }
    await new Promise<void>((r) => window.setTimeout(r, 500))
    await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
    return { ok: true, message: "Location access is enabled for this app." }
  } catch (e) {
    return { ok: false, message: humanizePermissionError(e, "location") }
  }
}
