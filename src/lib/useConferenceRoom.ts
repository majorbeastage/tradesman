import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "./supabase"

/**
 * Multi-party internal team calls (audio + video) over WebRTC — no Twilio.
 *
 * Topology: full mesh. Each participant holds one RTCPeerConnection to every
 * other participant. Good for small team huddles (~up to 5-6). Larger rooms
 * would need an SFU media server later.
 *
 * Signaling on Supabase Realtime:
 *  - Personal inbox `rtc-inbox-<userId>` receives call invites.
 *  - Room channel `rtc-room-<roomId>` uses Presence to track who is in the room
 *    and broadcast targeted offer/answer/ICE between members.
 *
 * Glare avoidance: for any pair, the member with the smaller user id creates the
 * offer; the other waits.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

export type RoomState = "idle" | "ringing" | "incoming" | "in_call" | "error"

export type RoomParticipant = {
  id: string
  name: string
  stream: MediaStream | null
  connected: boolean
}

export type RoomIncoming = {
  roomId: string
  fromId: string
  fromName: string
  members: string[]
  video: boolean
}

type SignalPayload = {
  to: string
  from: string
  kind: "offer" | "answer" | "ice"
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}
type InvitePayload = { roomId: string; fromId: string; fromName: string; members: string[]; video: boolean }

export function useConferenceRoom(me: string | null | undefined, resolveName: (id: string) => string) {
  const [state, setState] = useState<RoomState>("idle")
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [incoming, setIncoming] = useState<RoomIncoming | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [isVideo, setIsVideo] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selfStream, setSelfStream] = useState<MediaStream | null>(null)

  const roomIdRef = useRef<string | null>(null)
  const roomChanRef = useRef<RealtimeChannel | null>(null)
  const inboxRef = useRef<RealtimeChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedTimerRef = useRef(false)
  const resolveNameRef = useRef(resolveName)
  resolveNameRef.current = resolveName
  const meRef = useRef<string | null | undefined>(me)
  meRef.current = me

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    startedTimerRef.current = false
  }, [])

  const upsertParticipant = useCallback((id: string, patch: Partial<RoomParticipant>) => {
    setParticipants((list) => {
      const idx = list.findIndex((p) => p.id === id)
      if (idx === -1) {
        return [...list, { id, name: resolveNameRef.current(id), stream: null, connected: false, ...patch }]
      }
      const next = [...list]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  const removeParticipant = useCallback((id: string) => {
    const pc = pcsRef.current.get(id)
    if (pc) {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      pcsRef.current.delete(id)
    }
    pendingIceRef.current.delete(id)
    setParticipants((list) => list.filter((p) => p.id !== id))
  }, [])

  const cleanup = useCallback(() => {
    stopTimer()
    for (const pc of pcsRef.current.values()) {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    }
    pcsRef.current.clear()
    pendingIceRef.current.clear()
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    localStreamRef.current = null
    setSelfStream(null)
    if (roomChanRef.current) {
      try {
        void supabase?.removeChannel(roomChanRef.current)
      } catch {
        /* ignore */
      }
      roomChanRef.current = null
    }
    roomIdRef.current = null
    setParticipants([])
    setIncoming(null)
    setMuted(false)
    setCameraOn(false)
    setIsVideo(false)
    setSeconds(0)
    setState("idle")
  }, [stopTimer])

  const maybeStartTimer = useCallback(() => {
    if (startedTimerRef.current) return
    startedTimerRef.current = true
    setState("in_call")
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [])

  const sendRoom = useCallback((event: string, payload: unknown) => {
    const ch = roomChanRef.current
    if (!ch) return
    void ch.send({ type: "broadcast", event, payload })
  }, [])

  const createPeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId)
      if (existing) return existing
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const local = localStreamRef.current
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local))
      pc.onicecandidate = (e) => {
        if (e.candidate) sendRoom("signal", { to: peerId, from: meRef.current, kind: "ice", candidate: e.candidate.toJSON() } as SignalPayload)
      }
      pc.ontrack = (e) => {
        if (e.streams[0]) upsertParticipant(peerId, { stream: e.streams[0] })
      }
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        if (st === "connected") {
          upsertParticipant(peerId, { connected: true })
          maybeStartTimer()
        } else if (st === "failed" || st === "closed" || st === "disconnected") {
          upsertParticipant(peerId, { connected: false })
        }
      }
      pcsRef.current.set(peerId, pc)
      upsertParticipant(peerId, {})
      return pc
    },
    [maybeStartTimer, sendRoom, upsertParticipant],
  )

  const callPeer = useCallback(
    async (peerId: string) => {
      const pc = createPeer(peerId)
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendRoom("signal", { to: peerId, from: meRef.current, kind: "offer", sdp: offer } as SignalPayload)
      } catch {
        /* ignore */
      }
    },
    [createPeer, sendRoom],
  )

  const flushPendingIce = useCallback(async (peerId: string) => {
    const pc = pcsRef.current.get(peerId)
    if (!pc) return
    const buf = pendingIceRef.current.get(peerId)
    if (!buf) return
    pendingIceRef.current.delete(peerId)
    for (const c of buf) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const handleSignal = useCallback(
    async (sig: SignalPayload) => {
      const myId = meRef.current
      if (!myId || sig.to !== myId) return
      const from = sig.from
      if (sig.kind === "offer" && sig.sdp) {
        const pc = createPeer(from)
        try {
          await pc.setRemoteDescription(sig.sdp)
          await flushPendingIce(from)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sendRoom("signal", { to: from, from: myId, kind: "answer", sdp: answer } as SignalPayload)
        } catch {
          /* ignore */
        }
      } else if (sig.kind === "answer" && sig.sdp) {
        const pc = pcsRef.current.get(from)
        if (pc) {
          try {
            await pc.setRemoteDescription(sig.sdp)
            await flushPendingIce(from)
          } catch {
            /* ignore */
          }
        }
      } else if (sig.kind === "ice" && sig.candidate) {
        const pc = pcsRef.current.get(from)
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(sig.candidate)
          } catch {
            /* ignore */
          }
        } else {
          const buf = pendingIceRef.current.get(from) ?? []
          buf.push(sig.candidate)
          pendingIceRef.current.set(from, buf)
        }
      }
    },
    [createPeer, flushPendingIce, sendRoom],
  )

  const joinRoom = useCallback(
    async (roomId: string) => {
      if (!supabase || !me) return
      const channel = supabase.channel(`rtc-room-${roomId}`, {
        config: { presence: { key: me }, broadcast: { self: false } },
      })
      channel.on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as SignalPayload))
      channel.on("presence", { event: "join" }, ({ key }) => {
        if (!key || key === me) return
        upsertParticipant(key, {})
        // Deterministic offerer: smaller id initiates.
        if (me < key) void callPeer(key)
      })
      channel.on("presence", { event: "leave" }, ({ key }) => {
        if (key && key !== me) removeParticipant(key)
      })
      channel.on("presence", { event: "sync" }, () => {
        const stateObj = channel.presenceState()
        for (const key of Object.keys(stateObj)) {
          if (key === me) continue
          upsertParticipant(key, {})
          if (me < key && !pcsRef.current.has(key)) void callPeer(key)
        }
      })
      roomChanRef.current = channel
      roomIdRef.current = roomId
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void channel.track({ id: me, at: Date.now() })
            resolve()
          }
        })
        setTimeout(resolve, 4000)
      })
    },
    [callPeer, handleSignal, me, removeParticipant, upsertParticipant],
  )

  const acquireMedia = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
    localStreamRef.current = stream
    if (video) {
      setSelfStream(stream)
      setCameraOn(true)
    }
    setMuted(false)
    return stream
  }, [])

  // Start an outbound call/conference with the given teammates.
  const startCall = useCallback(
    async (memberIds: string[], opts: { video: boolean }) => {
      if (!supabase || !me) return
      const others = [...new Set(memberIds.filter((id) => id && id !== me))]
      if (others.length === 0) return
      if (roomIdRef.current) return
      setError(null)
      setIsVideo(opts.video)
      setState("ringing")
      const roomId = `${me}-${Date.now()}`
      try {
        await acquireMedia(opts.video)
        for (const id of others) upsertParticipant(id, {})
        await joinRoom(roomId)
        const invite: InvitePayload = {
          roomId,
          fromId: me,
          fromName: resolveNameRef.current(me),
          members: [me, ...others],
          video: opts.video,
        }
        for (const id of others) {
          const inv = supabase.channel(`rtc-inbox-${id}`)
          await new Promise<void>((resolve) => {
            inv.subscribe((status) => {
              if (status === "SUBSCRIBED") resolve()
            })
            setTimeout(resolve, 3000)
          })
          await inv.send({ type: "broadcast", event: "invite", payload: invite })
          setTimeout(() => {
            try {
              void supabase?.removeChannel(inv)
            } catch {
              /* ignore */
            }
          }, 800)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the call (camera/mic blocked?).")
        setState("error")
        cleanup()
      }
    },
    [acquireMedia, cleanup, joinRoom, me, upsertParticipant],
  )

  // Join a stable, pre-agreed room (e.g. a scheduled calendar video call).
  // No invites are sent — every participant joins the same room id and presence
  // wires up the mesh.
  const joinNamedRoom = useCallback(
    async (roomId: string, opts: { video: boolean }) => {
      if (!supabase || !me) return
      if (roomIdRef.current) return
      setError(null)
      setIsVideo(opts.video)
      setState("ringing")
      try {
        await acquireMedia(opts.video)
        await joinRoom(roomId)
        maybeStartTimer()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not join the call (camera/mic blocked?).")
        setState("error")
        cleanup()
      }
    },
    [acquireMedia, cleanup, joinRoom, maybeStartTimer, me],
  )

  const accept = useCallback(async () => {
    const inv = incoming
    if (!inv) return
    setError(null)
    setIsVideo(inv.video)
    try {
      await acquireMedia(inv.video)
      // Pre-populate other invited members so tiles show while connecting.
      for (const id of inv.members) if (id !== me) upsertParticipant(id, {})
      await joinRoom(inv.roomId)
      setIncoming(null)
      maybeStartTimer()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not answer (camera/mic blocked?).")
      setState("error")
      cleanup()
    }
  }, [acquireMedia, cleanup, incoming, joinRoom, maybeStartTimer, me, upsertParticipant])

  const decline = useCallback(() => {
    setIncoming(null)
    setState("idle")
  }, [])

  const hangup = useCallback(() => cleanup(), [cleanup])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    setMuted((m) => {
      const next = !m
      stream.getAudioTracks().forEach((t) => (t.enabled = !next))
      return next
    })
  }, [])

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length === 0) return
    setCameraOn((c) => {
      const next = !c
      videoTracks.forEach((t) => (t.enabled = next))
      return next
    })
  }, [])

  // Personal inbox: listen for incoming invites.
  useEffect(() => {
    if (!supabase || !me) return
    const inbox = supabase.channel(`rtc-inbox-${me}`, { config: { broadcast: { self: false } } })
    inbox.on("broadcast", { event: "invite" }, ({ payload }) => {
      const p = payload as InvitePayload
      if (!p?.roomId) return
      if (roomIdRef.current || state !== "idle") return // busy
      setIncoming({
        roomId: p.roomId,
        fromId: p.fromId,
        fromName: resolveNameRef.current(p.fromId) || p.fromName || "Teammate",
        members: p.members ?? [],
        video: Boolean(p.video),
      })
      setState("incoming")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  useEffect(() => () => cleanup(), [cleanup])

  return {
    state,
    participants,
    incoming,
    muted,
    cameraOn,
    isVideo,
    seconds,
    error,
    setError,
    selfStream,
    startCall,
    joinNamedRoom,
    accept,
    decline,
    hangup,
    toggleMute,
    toggleCamera,
  }
}
