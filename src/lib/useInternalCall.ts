import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "./supabase"

/**
 * Peer-to-peer internal team voice calls over WebRTC. No Twilio.
 *
 * Signaling rides on Supabase Realtime broadcast:
 *  - Each user listens on their personal inbox channel `rtc-inbox-<userId>` for
 *    call invites (SDP offer).
 *  - Per-call channel `rtc-call-<callId>` carries answer, ICE candidates, and
 *    hangup/decline for the duration of the call.
 *
 * Media is direct peer-to-peer using public STUN (works on most networks). Some
 * strict corporate networks need a TURN relay; add TURN servers to ICE_SERVERS
 * later if calls fail to connect.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

export type InternalCallState = "idle" | "calling" | "incoming" | "connecting" | "in_call" | "error"
export type InternalCallPeer = { id: string; name: string }

type InvitePayload = { callId: string; fromId: string; fromName: string; offer: RTCSessionDescriptionInit }
type AnswerPayload = { answer: RTCSessionDescriptionInit }
type IcePayload = { candidate: RTCIceCandidateInit }

export function useInternalCall(me: string | null | undefined, resolveName: (id: string) => string) {
  const [callState, setCallState] = useState<InternalCallState>("idle")
  const [peer, setPeer] = useState<InternalCallPeer | null>(null)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const callChannelRef = useRef<RealtimeChannel | null>(null)
  const inboxRef = useRef<RealtimeChannel | null>(null)
  const callIdRef = useRef<string | null>(null)
  const roleRef = useRef<"caller" | "callee" | null>(null)
  const remoteSetRef = useRef(false)
  const localIceBufRef = useRef<RTCIceCandidateInit[]>([])
  const pendingRemoteIceRef = useRef<RTCIceCandidateInit[]>([])
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolveNameRef = useRef(resolveName)
  resolveNameRef.current = resolveName

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    stopTimer()
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop())
    } catch {
      /* ignore */
    }
    try {
      pcRef.current?.close()
    } catch {
      /* ignore */
    }
    pcRef.current = null
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    localStreamRef.current = null
    if (audioElRef.current) {
      try {
        audioElRef.current.pause()
        audioElRef.current.srcObject = null
      } catch {
        /* ignore */
      }
    }
    if (callChannelRef.current) {
      try {
        void supabase?.removeChannel(callChannelRef.current)
      } catch {
        /* ignore */
      }
      callChannelRef.current = null
    }
    callIdRef.current = null
    roleRef.current = null
    remoteSetRef.current = false
    localIceBufRef.current = []
    pendingRemoteIceRef.current = []
    incomingOfferRef.current = null
    setMuted(false)
    setSeconds(0)
    setPeer(null)
    setCallState("idle")
  }, [stopTimer])

  const broadcastOnce = useCallback(async (channelName: string, event: string, payload: unknown) => {
    if (!supabase) return
    const ch = supabase.channel(channelName)
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve()
      })
      setTimeout(resolve, 4000)
    })
    try {
      await ch.send({ type: "broadcast", event, payload })
    } finally {
      setTimeout(() => {
        try {
          void supabase?.removeChannel(ch)
        } catch {
          /* ignore */
        }
      }, 500)
    }
  }, [])

  const sendOnCall = useCallback((event: string, payload: unknown) => {
    const ch = callChannelRef.current
    if (!ch) return
    void ch.send({ type: "broadcast", event, payload })
  }, [])

  const attachRemoteAudio = useCallback((stream: MediaStream) => {
    let el = audioElRef.current
    if (!el) {
      el = new Audio()
      el.autoplay = true
      audioElRef.current = el
    }
    el.srcObject = stream
    void el.play().catch(() => {
      /* autoplay may require the user gesture that already triggered the call */
    })
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [stopTimer])

  const buildPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const cand = e.candidate.toJSON()
      if (remoteSetRef.current) sendOnCall("ice", { candidate: cand } satisfies IcePayload)
      else localIceBufRef.current.push(cand)
    }
    pc.ontrack = (e) => {
      if (e.streams[0]) attachRemoteAudio(e.streams[0])
    }
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === "connected") {
        setCallState("in_call")
        startTimer()
      } else if (st === "failed" || st === "closed" || st === "disconnected") {
        cleanup()
      }
    }
    return pc
  }, [attachRemoteAudio, cleanup, sendOnCall, startTimer])

  const flushLocalIce = useCallback(() => {
    remoteSetRef.current = true
    const buf = localIceBufRef.current
    localIceBufRef.current = []
    for (const c of buf) sendOnCall("ice", { candidate: c } satisfies IcePayload)
  }, [sendOnCall])

  const flushRemoteIce = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    const buf = pendingRemoteIceRef.current
    pendingRemoteIceRef.current = []
    for (const c of buf) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const wireCallChannel = useCallback(
    (channel: RealtimeChannel) => {
      channel.on("broadcast", { event: "answer" }, async ({ payload }) => {
        const pc = pcRef.current
        if (!pc || roleRef.current !== "caller") return
        try {
          await pc.setRemoteDescription((payload as AnswerPayload).answer)
          setCallState("connecting")
          flushLocalIce()
          await flushRemoteIce()
        } catch {
          /* ignore */
        }
      })
      channel.on("broadcast", { event: "ice" }, async ({ payload }) => {
        const pc = pcRef.current
        if (!pc) return
        const cand = (payload as IcePayload).candidate
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(cand)
          } catch {
            /* ignore */
          }
        } else {
          pendingRemoteIceRef.current.push(cand)
        }
      })
      channel.on("broadcast", { event: "reject" }, () => {
        setError("Call declined.")
        cleanup()
      })
      channel.on("broadcast", { event: "bye" }, () => cleanup())
    },
    [cleanup, flushLocalIce, flushRemoteIce],
  )

  // Outbound teammate call.
  const placeCall = useCallback(
    async (peerId: string, name: string) => {
      if (!supabase || !me) return
      if (pcRef.current) return
      setError(null)
      setPeer({ id: peerId, name })
      setCallState("calling")
      const callId = `${me}-${peerId}-${Date.now()}`
      callIdRef.current = callId
      roleRef.current = "caller"
      remoteSetRef.current = false
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = stream
        const pc = buildPeerConnection()
        pcRef.current = pc
        stream.getTracks().forEach((t) => pc.addTrack(t, stream))

        const channel = supabase.channel(`rtc-call-${callId}`, { config: { broadcast: { self: false } } })
        wireCallChannel(channel)
        callChannelRef.current = channel
        await new Promise<void>((resolve) => {
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") resolve()
          })
          setTimeout(resolve, 4000)
        })

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await broadcastOnce(`rtc-inbox-${peerId}`, "invite", {
          callId,
          fromId: me,
          fromName: resolveNameRef.current(me),
          offer,
        } satisfies InvitePayload)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the call (microphone blocked?).")
        setCallState("error")
        cleanup()
      }
    },
    [broadcastOnce, buildPeerConnection, cleanup, me, wireCallChannel],
  )

  // Accept an incoming call.
  const accept = useCallback(async () => {
    const callId = callIdRef.current
    const offer = incomingOfferRef.current
    if (!supabase || !callId || !offer) return
    setCallState("connecting")
    roleRef.current = "callee"
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = buildPeerConnection()
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const channel = supabase.channel(`rtc-call-${callId}`, { config: { broadcast: { self: false } } })
      wireCallChannel(channel)
      callChannelRef.current = channel
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve()
        })
        setTimeout(resolve, 4000)
      })

      await pc.setRemoteDescription(offer)
      remoteSetRef.current = true
      await flushRemoteIce()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendOnCall("answer", { answer } satisfies AnswerPayload)
      // Any ICE buffered before remote was set:
      const buf = localIceBufRef.current
      localIceBufRef.current = []
      for (const c of buf) sendOnCall("ice", { candidate: c } satisfies IcePayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not answer (microphone blocked?).")
      setCallState("error")
      cleanup()
    }
  }, [buildPeerConnection, cleanup, flushRemoteIce, sendOnCall, wireCallChannel])

  const reject = useCallback(() => {
    const callId = callIdRef.current
    if (callId) void broadcastOnce(`rtc-call-${callId}`, "reject", {})
    cleanup()
  }, [broadcastOnce, cleanup])

  const hangup = useCallback(() => {
    sendOnCall("bye", {})
    const callId = callIdRef.current
    // If we never joined the call channel (rare), still tell the far side.
    if (callId && !callChannelRef.current) void broadcastOnce(`rtc-call-${callId}`, "bye", {})
    cleanup()
  }, [broadcastOnce, cleanup, sendOnCall])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    setMuted((m) => {
      const next = !m
      stream.getAudioTracks().forEach((t) => (t.enabled = !next))
      return next
    })
  }, [])

  // Listen for incoming invites on the personal inbox channel.
  useEffect(() => {
    if (!supabase || !me) return
    const inbox = supabase.channel(`rtc-inbox-${me}`, { config: { broadcast: { self: false } } })
    inbox.on("broadcast", { event: "invite" }, ({ payload }) => {
      const p = payload as InvitePayload
      if (!p?.callId || !p?.offer) return
      // Busy → auto-decline the newcomer.
      if (pcRef.current || callState !== "idle") {
        void broadcastOnce(`rtc-call-${p.callId}`, "reject", {})
        return
      }
      callIdRef.current = p.callId
      incomingOfferRef.current = p.offer
      roleRef.current = "callee"
      remoteSetRef.current = false
      setError(null)
      setPeer({ id: p.fromId, name: resolveNameRef.current(p.fromId) || p.fromName || "Teammate" })
      setCallState("incoming")
    })
    inbox.subscribe()
    inboxRef.current = inbox
    return () => {
      try {
        void supabase?.removeChannel(inbox)
      } catch {
        /* ignore */
      }
      inboxRef.current = null
    }
    // callState intentionally excluded: we read it via closure only for the busy check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, broadcastOnce])

  useEffect(() => () => cleanup(), [cleanup])

  return { callState, peer, muted, seconds, error, setError, placeCall, accept, reject, hangup, toggleMute }
}
