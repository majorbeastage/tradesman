import { useCallback, useEffect, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabase"
import { resetCallAudioRoute, setCallSpeakerOn, prepareCallAudio } from "./nativeCallAudio"
import { setVoiceTrafficInCall } from "./voiceTrafficGuard"
import { setAppSessionInCall } from "./appSessions"
import type { Call, Device } from "@twilio/voice-sdk"

/**
 * In-browser Twilio softphone for PSTN dial-out ONLY (calling real phone numbers
 * from the computer mic/speaker via the user's Twilio business number).
 *
 * Internal teammate calls do NOT use this — they run peer-to-peer over WebRTC
 * (see useInternalCall). Twilio is only for the phone network.
 */

export type VoiceCallState = "idle" | "connecting" | "ringing" | "in_call" | "error"
export type VoicePeer = { id: string; label: string }

async function fetchVoiceToken(): Promise<{ token: string | null; error?: string }> {
  if (!supabase) return { token: null, error: "Not signed in." }
  const { data } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  if (!accessToken) return { token: null, error: "Please sign in again." }
  try {
    const resp = await fetch("/api/twilio-voice-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const j = (await resp.json().catch(() => null)) as { token?: string; error?: string } | null
    if (!resp.ok || !j?.token) return { token: null, error: j?.error || `Calling unavailable (HTTP ${resp.status}).` }
    return { token: j.token }
  } catch (e) {
    return { token: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function useVoiceDevice() {
  const [error, setError] = useState<string | null>(null)
  const [callState, setCallState] = useState<VoiceCallState>("idle")
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [peer, setPeer] = useState<VoicePeer | null>(null)

  const deviceRef = useRef<Device | null>(null)
  const callRef = useRef<Call | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speakerSupported = Capacitor.isNativePlatform()

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const teardown = useCallback(() => {
    stopTimer()
    try {
      callRef.current?.disconnect()
    } catch {
      /* ignore */
    }
    callRef.current = null
    try {
      deviceRef.current?.destroy()
    } catch {
      /* ignore */
    }
    deviceRef.current = null
    void resetCallAudioRoute()
    setVoiceTrafficInCall(false)
    void setAppSessionInCall(supabase, "main", false)
    setCallState("idle")
    setMuted(false)
    setSpeakerOn(false)
    setSeconds(0)
    setPeer(null)
  }, [stopTimer])

  useEffect(() => () => teardown(), [teardown])

  const placePhoneCall = useCallback(
    async (e164: string, label?: string) => {
      setError(null)
      setCallState("connecting")
      setPeer({ id: e164, label: label || e164 })
      setVoiceTrafficInCall(true)
      void setAppSessionInCall(supabase, "main", true)
      const { token, error: tErr } = await fetchVoiceToken()
      if (!token) {
        setError(tErr ?? "Calling unavailable.")
        setCallState("error")
        setVoiceTrafficInCall(false)
        void setAppSessionInCall(supabase, "main", false)
        return
      }
      try {
        const { Device } = await import("@twilio/voice-sdk")
        try {
          deviceRef.current?.destroy()
        } catch {
          /* ignore */
        }
        const device = new Device(token, { codecPreferences: ["opus", "pcmu"] as never, logLevel: "error" as never })
        deviceRef.current = device
        device.on("error", (e: { message?: string }) => {
          setError(e?.message || "Call error.")
          setCallState("error")
          stopTimer()
        })
        const call = await device.connect({ params: { To: e164 } })
        callRef.current = call
        setMuted(false)
        setSpeakerOn(false)
        setSeconds(0)
        setCallState("ringing")
        void prepareCallAudio()
        call.on("accept", () => {
          setCallState("in_call")
          void prepareCallAudio()
          stopTimer()
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
        })
        call.on("disconnect", () => teardown())
        call.on("cancel", () => teardown())
        call.on("error", (e: { message?: string }) => {
          setError(e?.message || "Call error.")
          setCallState("error")
          stopTimer()
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setCallState("error")
      }
    },
    [stopTimer, teardown],
  )

  const hangup = useCallback(() => teardown(), [teardown])

  const toggleMute = useCallback(() => {
    const call = callRef.current
    if (!call) return
    setMuted((m) => {
      const next = !m
      try {
        call.mute(next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const sendDigits = useCallback((digits: string) => {
    const call = callRef.current
    if (!call || !digits) return
    try {
      call.sendDigits(digits)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleSpeaker = useCallback(() => {
    if (!speakerSupported) return
    setSpeakerOn((prev) => {
      const next = !prev
      void setCallSpeakerOn(next)
      return next
    })
  }, [speakerSupported])

  return {
    error,
    setError,
    callState,
    muted,
    speakerOn,
    speakerSupported,
    seconds,
    peer,
    placePhoneCall,
    hangup,
    toggleMute,
    toggleSpeaker,
    sendDigits,
  }
}
