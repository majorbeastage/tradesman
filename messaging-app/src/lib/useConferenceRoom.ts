import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "./supabaseClient"
import { recordMissedCall } from "./missedCalls"

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
type InboxControlPayload = { roomId: string; fromId?: string; video?: boolean }

const RING_TIMEOUT_MS = 40_000

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
  const [sharingScreen, setSharingScreen] = useState(false)

  const roomIdRef = useRef<string | null>(null)
  const roomChanRef = useRef<RealtimeChannel | null>(null)
  const inboxRef = useRef<RealtimeChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inviteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingInviteesRef = useRef<string[]>([])
  const callVideoRef = useRef(false)
  const answeredRef = useRef(false)
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
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current)
      ringTimerRef.current = null
    }
    if (inviteTimeoutRef.current) {
      clearTimeout(inviteTimeoutRef.current)
      inviteTimeoutRef.current = null
    }
    pendingInviteesRef.current = []
    answeredRef.current = false
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
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    localStreamRef.current = null
    cameraTrackRef.current = null
    setSelfStream(null)
    setSharingScreen(false)
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
    answeredRef.current = true
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current)
      ringTimerRef.current = null
    }
    setState("in_call")
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [])

  const broadcastInbox = useCallback(async (userId: string, event: string, payload: unknown) => {
    if (!supabase) return
    const inv = supabase.channel(`rtc-inbox-${userId}`)
    await new Promise<void>((resolve) => {
      inv.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve()
      })
      setTimeout(resolve, 3000)
    })
    await inv.send({ type: "broadcast", event, payload })
    setTimeout(() => {
      try {
        void supabase?.removeChannel(inv)
      } catch {
        /* ignore */
      }
    }, 800)
  }, [])

  const recordUnansweredMissed = useCallback(
    async (calleeIds: string[], roomId: string | null, video: boolean) => {
      const myId = meRef.current
      if (!supabase || !myId) return
      const myName = resolveNameRef.current(myId) || "Teammate"
      for (const calleeId of calleeIds) {
        if (!calleeId || calleeId === myId) continue
        await recordMissedCall(supabase, {
          calleeId,
          callerId: myId,
          callerName: myName,
          video,
          roomId,
          status: "missed",
          notify: true,
        })
      }
    },
    [],
  )

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
    cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
    if (video) {
      setSelfStream(stream)
      setCameraOn(true)
    }
    setMuted(false)
    return stream
  }, [])

  /** Swap the outgoing video track on every peer (camera ↔ screen). Renegotiates if needed. */
  const replaceOutgoingVideo = useCallback(
    async (track: MediaStreamTrack | null) => {
      const myId = meRef.current
      for (const [peerId, pc] of pcsRef.current) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video")
        try {
          if (sender) {
            await sender.replaceTrack(track)
          } else if (track) {
            const stream = localStreamRef.current
            if (stream && !stream.getVideoTracks().includes(track)) stream.addTrack(track)
            pc.addTrack(track, stream ?? new MediaStream([track]))
            // Renegotiate so the far side learns about the new video track.
            if (myId && myId < peerId) {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              sendRoom("signal", { to: peerId, from: myId, kind: "offer", sdp: offer } as SignalPayload)
            }
          }
        } catch {
          /* ignore */
        }
      }
    },
    [sendRoom],
  )

  const stopScreenShare = useCallback(async () => {
    try {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null
    setSharingScreen(false)
    const cam = cameraTrackRef.current
    const local = localStreamRef.current
    if (cam && cam.readyState === "live") {
      // Put camera back into the local preview stream.
      if (local) {
        local.getVideoTracks().forEach((t) => {
          if (t !== cam) {
            try {
              local.removeTrack(t)
            } catch {
              /* ignore */
            }
          }
        })
        if (!local.getVideoTracks().includes(cam)) local.addTrack(cam)
        setSelfStream(new MediaStream([...local.getAudioTracks(), cam]))
      }
      await replaceOutgoingVideo(cam)
      setCameraOn(true)
      setIsVideo(true)
    } else {
      await replaceOutgoingVideo(null)
      setSelfStream(local ? new MediaStream(local.getAudioTracks()) : null)
      setCameraOn(false)
    }
  }, [replaceOutgoingVideo])

  const startScreenShare = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15, displaySurface: "monitor" } as MediaTrackConstraints,
        audio: false,
      })
      const screenTrack = display.getVideoTracks()[0]
      if (!screenTrack) {
        display.getTracks().forEach((t) => t.stop())
        return
      }
      // Remember camera (do not stop it — we may restore later).
      const local = localStreamRef.current
      if (local) {
        const existingCam = local.getVideoTracks()[0]
        if (existingCam && existingCam !== screenTrack) cameraTrackRef.current = existingCam
      }
      screenStreamRef.current = display
      setSharingScreen(true)
      setIsVideo(true)
      setCameraOn(false)
      // Preview shows screen locally.
      const audioTracks = local?.getAudioTracks() ?? []
      setSelfStream(new MediaStream([...audioTracks, screenTrack]))
      await replaceOutgoingVideo(screenTrack)
      screenTrack.onended = () => {
        void stopScreenShare()
      }
    } catch (e) {
      // User cancelled the picker — not an error state for the call.
      if (e instanceof Error && /Permission denied|NotAllowedError|abort/i.test(e.name + e.message)) return
      setError(e instanceof Error ? e.message : "Could not share screen.")
    }
  }, [replaceOutgoingVideo, stopScreenShare])

  // Start an outbound call/conference with the given teammates.
  const startCall = useCallback(
    async (memberIds: string[], opts: { video: boolean }) => {
      if (!supabase || !me) return
      const others = [...new Set(memberIds.filter((id) => id && id !== me))]
      if (others.length === 0) return
      if (roomIdRef.current) return
      setError(null)
      setIsVideo(opts.video)
      callVideoRef.current = opts.video
      answeredRef.current = false
      pendingInviteesRef.current = others
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
          await broadcastInbox(id, "invite", invite)
        }
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current)
        ringTimerRef.current = setTimeout(() => {
          ringTimerRef.current = null
          if (answeredRef.current || roomIdRef.current !== roomId) return
          const unanswered = [...pendingInviteesRef.current]
          void (async () => {
            await recordUnansweredMissed(unanswered, roomId, opts.video)
            for (const id of unanswered) {
              await broadcastInbox(id, "cancel", { roomId, fromId: me, video: opts.video } satisfies InboxControlPayload)
            }
            cleanup()
          })()
        }, RING_TIMEOUT_MS)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the call (camera/mic blocked?).")
        setState("error")
        cleanup()
      }
    },
    [acquireMedia, broadcastInbox, cleanup, joinRoom, me, recordUnansweredMissed, upsertParticipant],
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
    if (inviteTimeoutRef.current) {
      clearTimeout(inviteTimeoutRef.current)
      inviteTimeoutRef.current = null
    }
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
    const inv = incoming
    if (inviteTimeoutRef.current) {
      clearTimeout(inviteTimeoutRef.current)
      inviteTimeoutRef.current = null
    }
    if (inv?.fromId) {
      void broadcastInbox(inv.fromId, "declined", {
        roomId: inv.roomId,
        fromId: meRef.current ?? undefined,
        video: inv.video,
      } satisfies InboxControlPayload)
    }
    setIncoming(null)
    setState("idle")
  }, [broadcastInbox, incoming])

  const hangup = useCallback(() => {
    const roomId = roomIdRef.current
    const invitees = [...pendingInviteesRef.current]
    const wasRinging = !answeredRef.current && Boolean(roomId)
    const video = callVideoRef.current
    const myId = meRef.current
    if (wasRinging && roomId && myId) {
      void (async () => {
        for (const id of invitees) {
          await broadcastInbox(id, "cancel", { roomId, fromId: myId, video } satisfies InboxControlPayload)
        }
      })()
    }
    cleanup()
  }, [broadcastInbox, cleanup])

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

  // Personal inbox: listen for incoming invites / cancel / declined.
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
      if (inviteTimeoutRef.current) clearTimeout(inviteTimeoutRef.current)
      inviteTimeoutRef.current = setTimeout(() => {
        inviteTimeoutRef.current = null
        setIncoming((cur) => {
          if (!cur || cur.roomId !== p.roomId) return cur
          void recordMissedCall(supabase, {
            calleeId: me,
            callerId: p.fromId,
            callerName: p.fromName || resolveNameRef.current(p.fromId) || "Teammate",
            video: Boolean(p.video),
            roomId: p.roomId,
            status: "missed",
            notify: false,
          })
          setState("idle")
          return null
        })
      }, RING_TIMEOUT_MS + 5_000)
    })
    inbox.on("broadcast", { event: "cancel" }, ({ payload }) => {
      const p = payload as InboxControlPayload
      if (!p?.roomId) return
      if (inviteTimeoutRef.current) {
        clearTimeout(inviteTimeoutRef.current)
        inviteTimeoutRef.current = null
      }
      setIncoming((cur) => {
        if (!cur || cur.roomId !== p.roomId) return cur
        setState("idle")
        return null
      })
    })
    inbox.on("broadcast", { event: "declined" }, ({ payload }) => {
      const p = payload as InboxControlPayload
      if (!p?.roomId || !p.fromId) return
      if (roomIdRef.current !== p.roomId) return
      pendingInviteesRef.current = pendingInviteesRef.current.filter((id) => id !== p.fromId)
      removeParticipant(p.fromId)
      if (!answeredRef.current && pendingInviteesRef.current.length === 0) {
        cleanup()
      }
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
    sharingScreen,
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
    startScreenShare,
    stopScreenShare,
  }
}
