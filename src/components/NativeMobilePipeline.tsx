import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { attachPushTokenUpsertListeners, detachPushTokenUpsertListeners, isNativeApp } from "../lib/capacitorMobile"

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
    const t = window.setTimeout(() => void attachPushTokenUpsertListeners(supabase, user.id), 400)
    return () => {
      window.clearTimeout(t)
      void detachPushTokenUpsertListeners()
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
