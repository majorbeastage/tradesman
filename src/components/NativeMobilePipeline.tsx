import { useCallback, useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { isNativeApp } from "../lib/capacitorMobile"

/**
 * Native only: registers push token rows and (when GPS opt-in) periodically upserts user_last_locations.
 * Requires SQL: supabase/user-push-devices-and-locations.sql
 */
export default function NativeMobilePipeline() {
  const { user } = useAuth()
  const [gpsOptIn, setGpsOptIn] = useState(false)

  const loadGpsOptIn = useCallback(async () => {
    if (!supabase || !user?.id) return
    const { data } = await supabase.from("profiles").select("metadata").eq("id", user.id).maybeSingle()
    const m = data?.metadata as Record<string, unknown> | undefined
    setGpsOptIn(m?.mobile_gps_opt_in === true)
  }, [user?.id])

  useEffect(() => {
    void loadGpsOptIn()
    const onFocus = () => void loadGpsOptIn()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [loadGpsOptIn])

  useEffect(() => {
    if (!isNativeApp() || !user?.id || !supabase) return

    let cancelled = false
    const cleanups: Array<() => void> = []

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications")
        const h1 = await PushNotifications.addListener("registration", async (t) => {
          if (!supabase || !user?.id || cancelled) return
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android"
          const { error } = await supabase.from("user_push_devices").upsert(
            {
              user_id: user.id,
              token: t.value,
              platform,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,token" },
          )
          if (error) console.warn("[push] user_push_devices upsert:", error.message)
        })
        cleanups.push(() => h1.remove())
        const h2 = await PushNotifications.addListener("registrationError", (err) => {
          console.warn("[push] registrationError", err.error)
        })
        cleanups.push(() => h2.remove())
      } catch (e) {
        console.warn("[push] listener setup failed", e)
      }
    })()

    return () => {
      cancelled = true
      for (const c of cleanups) try { c() } catch { /* ignore */ }
    }
  }, [user?.id])

  useEffect(() => {
    if (!isNativeApp() || !user?.id || !supabase || !gpsOptIn) return

    let timer: ReturnType<typeof setInterval> | undefined
    const tick = async () => {
      if (document.visibilityState !== "visible" || !supabase || !user?.id) return
      try {
        const { Geolocation } = await import("@capacitor/geolocation")
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 25000 })
        const { error } = await supabase.from("user_last_locations").upsert(
          {
            user_id: user.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        if (error) console.warn("[location] upsert:", error.message)
      } catch (e) {
        console.warn("[location] tick failed", e)
      }
    }

    void tick()
    timer = setInterval(tick, 120_000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [gpsOptIn, user?.id])

  return null
}
