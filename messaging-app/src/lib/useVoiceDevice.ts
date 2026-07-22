import { useCallback, useEffect, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabaseClient"
import { setVoiceTrafficInCall } from "./voiceTrafficGuard"
import { setAppSessionInCall } from "./appSessions"
import type { Call, Device } from "@twilio/voice-sdk"

/**
 * In-app Twilio softphone — dials PSTN from the device mic/speaker using the
 * user's Tradesman Twilio business number. Does NOT ring the user's personal
 * phone first (that was the old bridge flow).
 */

export type VoiceCallState = "idle" | "connecting" | "ringing" | "in_call" | "error"
export type VoicePeer = { id: string; label: string }

function apiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (raw) return raw.replace(/\/$/, "")
  return "https://www.tradesman-us.com"
}

export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`
  return null
}

async function setCallSpeakerOn(on: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    await MessagingNative.setSpeakerOn({ enabled: on })
    window.setTimeout(() => {
      void MessagingNative.setSpeakerOn({ enabled: on }).catch(() => undefined)
    }, 250)
  } catch {
    /* ignore */
  }
}

async function prepareCallAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    if (typeof MessagingNative.prepareCallAudio === "function") {
      await MessagingNative.prepareCallAudio()
    }
  } catch {
    /* ignore */
  }
}

async function resetCallAudioRoute(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { MessagingNative } = await import("../plugins/messaging-native")
    await MessagingNative.resetCallAudio()
  } catch {
    /* ignore */
  }
}

async function fetchVoiceToken(): Promise<{ token: string | null; error?: string }> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  if (!accessToken) return { token: null, error: "Please sign in again." }
  try {
    const resp = await fetch(`${apiBase()}/api/twilio-voice-token`, {
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
    void setAppSessionInCall(supabase, "messaging", false)
    setCallState("idle")
    setMuted(false)
    setSpeakerOn(false)
    setSeconds(0)
    setPeer(null)
  }, [stopTimer])

  useEffect(() => () => teardown(), [teardown])

  const placePhoneCall = useCallback(
    async (rawNumber: string, label?: string) => {
      const e164 = toE164(rawNumber)
      if (!e164) {
        setError("Enter a valid 10-digit phone number.")
        setCallState("error")
        return
      }
      setError(null)
      setCallState("connecting")
      setPeer({ id: e164, label: label || e164 })
      setVoiceTrafficInCall(true)
      void setAppSessionInCall(supabase, "messaging", true)
      const { token, error: tErr } = await fetchVoiceToken()
      if (!token) {
        setError(tErr ?? "Calling unavailable.")
        setCallState("error")
        setVoiceTrafficInCall(false)
        void setAppSessionInCall(supabase, "messaging", false)
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
