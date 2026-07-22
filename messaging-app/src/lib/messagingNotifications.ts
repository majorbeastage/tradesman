import { Capacitor } from "@capacitor/core"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "./supabaseClient"

export type MessagingNotifPrefs = {
  enabled: boolean
  showPreview: boolean
}

const DEFAULT_PREFS: MessagingNotifPrefs = { enabled: true, showPreview: true }

export async function loadMessagingNotifPrefs(userId: string): Promise<MessagingNotifPrefs> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta = (data?.metadata ?? {}) as Record<string, unknown>
  const raw = (meta.messaging_notifications ?? {}) as Record<string, unknown>
  return {
    enabled: raw.enabled !== false,
    showPreview: raw.showPreview !== false,
  }
}

export async function saveMessagingNotifPrefs(userId: string, prefs: MessagingNotifPrefs): Promise<void> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta = { ...((data?.metadata ?? {}) as Record<string, unknown>) }
  meta.messaging_notifications = {
    enabled: prefs.enabled,
    showPreview: prefs.showPreview,
  }
  await supabase.from("profiles").update({ metadata: meta }).eq("id", userId)
}

/**
 * Register FCM for the messaging app and upsert into user_push_devices.
 * Requires @capacitor/push-notifications + google-services when available.
 */
export async function ensureMessagingPush(userId: string, client: SupabaseClient = supabase): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    try {
      const { available } = await MessagingNative.getFcmAvailability()
      if (!available && Capacitor.getPlatform() === "android") {
        console.warn("[messaging-push] Firebase not configured; skipping register()")
        return
      }
    } catch {
      /* continue — iOS may not need this check */
    }

    const { PushNotifications } = await import("@capacitor/push-notifications")
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") return

    await PushNotifications.addListener("registration", async (t) => {
      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android"
      await client.from("user_push_devices").upsert(
        {
          user_id: userId,
          token: t.value,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      )
    })

    await PushNotifications.register()
  } catch (e) {
    console.warn("[messaging-push]", e)
  }
}

export { DEFAULT_PREFS }
