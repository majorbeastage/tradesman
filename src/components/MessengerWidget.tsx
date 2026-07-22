import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import { loadOrganizationPeers, type OrganizationPeer } from "../lib/organizationPeers"
import { queueCustomerFocus } from "../lib/customerNavigation"
import {
  createGroupThread,
  deleteThreadMessage,
  editThreadMessage,
  findOrCreateDirectThread,
  loadThreadMessages,
  loadThreadsWithMeta,
  markThreadRead,
  searchMessengerCustomers,
  sendThreadMessage,
  setThreadNotificationMute,
  isThreadPushMuted,
  type CustomerRef,
  type InternalMessage,
  type MessengerCustomer,
  type ThreadSummary,
} from "../lib/internalMessaging"
import { onOpenMessenger, onJoinConference } from "../lib/messengerBus"
import messagingIcon from "../assets/messaging-app-icon.png"
import { useVoiceDevice } from "../lib/useVoiceDevice"
import { useConferenceRoom } from "../lib/useConferenceRoom"
import ConferenceCallView, { ConferenceCallBody, mountReactInPopup, openConferencePopOut } from "./ConferenceCallView"
import InCallControls, { formatCallStateLabel } from "./InCallControls"
import MessageActionTarget from "./MessageActionTarget"
import {
  AVAILABILITY_COLOR,
  AVAILABILITY_LABEL,
  loadMyAvailability,
  saveMyAvailability,
  type Availability,
} from "../lib/messengerAvailability"

type Props = { setPage: (page: string) => void }

type View = "list" | "chat" | "new_group" | "dial"

const POLL_MS = 20_000

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <span style={{ position: "relative", flexShrink: 0 }}>
      <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#e2e8f0", color: theme.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>
        {initials(name)}
      </span>
      {online ? (
        <span style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: "#22c55e", border: "2px solid #fff" }} />
      ) : null}
    </span>
  )
}

export default function MessengerWidget({ setPage }: Props) {
  const { user } = useAuth()
  const me = user?.id ?? null

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>("list")
  const [peers, setPeers] = useState<OrganizationPeer[]>([])
  const [peersLoaded, setPeersLoaded] = useState(false)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [threadsLoaded, setThreadsLoaded] = useState(false)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [availability, setAvailability] = useState<Availability>("available")
  const [availOpen, setAvailOpen] = useState(false)
  const [callPoppedOut, setCallPoppedOut] = useState(false)
  const callPopCloseRef = useRef<(() => void) | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")

  // Customer reference picker
  const [pendingCustomer, setPendingCustomer] = useState<MessengerCustomer | null>(null)
  const [custPickerOpen, setCustPickerOpen] = useState(false)
  const [custQuery, setCustQuery] = useState("")
  const [custResults, setCustResults] = useState<MessengerCustomer[]>([])

  // Dial-out customer search
  const [dialCustQuery, setDialCustQuery] = useState("")
  const [dialCustResults, setDialCustResults] = useState<MessengerCustomer[]>([])
  const [dialSelectedName, setDialSelectedName] = useState<string | null>(null)

  // New group
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set())
  const [groupTitle, setGroupTitle] = useState("")
  const [creatingGroup, setCreatingGroup] = useState(false)

  // Dial out (bridge fallback — rings the user's phone first)
  const [dialNumber, setDialNumber] = useState("")
  const [dialing, setDialing] = useState(false)
  const [dialMsg, setDialMsg] = useState<string | null>(null)

  // Twilio softphone for PSTN dial-out only.
  const voice = useVoiceDevice()

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const selectedThreadIdRef = useRef<string | null>(null)
  selectedThreadIdRef.current = selectedThreadId

  const peerName = useCallback(
    (id: string): string => {
      if (id === me) return "You"
      return peers.find((p) => p.id === id)?.displayName ?? "Member"
    },
    [peers, me],
  )

  // Internal teammate calls/conferences (audio + video) over WebRTC (no Twilio).
  const room = useConferenceRoom(me, peerName)

  // PSTN dial-out panel state (Twilio softphone).
  const active =
    voice.callState !== "idle"
      ? {
          state: voice.callState as string,
          label: voice.peer?.label ?? "Call",
          muted: voice.muted,
          speakerOn: voice.speakerOn,
          speakerSupported: voice.speakerSupported,
          seconds: voice.seconds,
          error: voice.error,
          toggleMute: voice.toggleMute,
          toggleSpeaker: voice.toggleSpeaker,
          sendDigits: voice.sendDigits,
          hangup: voice.hangup,
        }
      : null

  useEffect(() => {
    if (!me || !supabase) return
    void loadMyAvailability(supabase, me).then(setAvailability)
  }, [me])

  const refreshThreads = useCallback(async () => {
    if (!me) return
    const { threads: list } = await loadThreadsWithMeta(supabase, me)
    setThreads(list)
    setThreadsLoaded(true)
  }, [me])

  // Org contacts
  useEffect(() => {
    if (!me || !supabase) return
    let cancelled = false
    void (async () => {
      try {
        const list = await loadOrganizationPeers(supabase, me)
        if (!cancelled) setPeers(list)
      } catch {
        if (!cancelled) setPeers([])
      } finally {
        if (!cancelled) setPeersLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me])

  // Thread poll
  useEffect(() => {
    if (!me) return
    void refreshThreads()
    const id = window.setInterval(() => void refreshThreads(), POLL_MS)
    const onFocus = () => void refreshThreads()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [me, refreshThreads])

  // Realtime: new/updated messages in my threads
  useEffect(() => {
    if (!me || !supabase) return
    const sb = supabase
    const mapRow = (raw: Record<string, unknown>): InternalMessage => ({
      id: raw.id as string,
      created_at: raw.created_at as string,
      thread_id: raw.thread_id as string,
      sender_id: raw.sender_id as string,
      body: (raw.body as string) ?? "",
      customer_ref: (raw.customer_ref as CustomerRef | null) ?? null,
      edited_at: (raw.edited_at as string) ?? null,
      deleted_at: (raw.deleted_at as string) ?? null,
    })
    const channel = sb
      .channel(`internal-msgs-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages" }, (payload) => {
        const raw = payload.new as Record<string, unknown>
        const threadId = raw.thread_id as string
        if (threadId && threadId === selectedThreadIdRef.current) {
          const m = mapRow(raw)
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          if (m.sender_id !== me) void markThreadRead(sb, me, threadId)
        }
        void refreshThreads()
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "internal_messages" }, (payload) => {
        const raw = payload.new as Record<string, unknown>
        const threadId = raw.thread_id as string
        if (threadId && threadId === selectedThreadIdRef.current) {
          const m = mapRow(raw)
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)))
        }
        void refreshThreads()
      })
      .subscribe()
    return () => {
      void sb.removeChannel(channel)
    }
  }, [me, refreshThreads])

  // Presence: who is online
  useEffect(() => {
    if (!me || !supabase) return
    const sb = supabase
    const channel = sb.channel("presence-internal-messaging", { config: { presence: { key: me } } })
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>
        setOnline(new Set(Object.keys(state)))
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online_at: new Date().toISOString() })
      })
    return () => {
      void sb.removeChannel(channel)
    }
  }, [me])

  const openThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId)
      setView("chat")
      setPendingCustomer(null)
      setCustPickerOpen(false)
      const msgs = await loadThreadMessages(supabase, threadId)
      setMessages(msgs)
      await markThreadRead(supabase, me, threadId)
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    },
    [me],
  )

  const openDirect = useCallback(
    async (otherId: string) => {
      const { threadId, error } = await findOrCreateDirectThread(supabase, me, otherId)
      if (!threadId) {
        alert(error ?? "Could not open chat.")
        return
      }
      await refreshThreads()
      await openThread(threadId)
    },
    [me, openThread, refreshThreads],
  )

  // Open from the dashboard tile
  useEffect(() => {
    return onOpenMessenger((detail) => {
      setOpen(true)
      if (detail.otherUserId) void openDirect(detail.otherUserId)
      else setView("list")
    })
  }, [openDirect])

  useEffect(() => {
    if (view === "chat" && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, view])

  // Customer search (debounced) when picker open
  useEffect(() => {
    if (!custPickerOpen) return
    let cancelled = false
    const id = window.setTimeout(async () => {
      const rows = await searchMessengerCustomers(supabase, me, custQuery)
      if (!cancelled) setCustResults(rows)
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [custPickerOpen, custQuery, me])

  // Dialer customer search
  useEffect(() => {
    if (view !== "dial") return
    let cancelled = false
    const id = window.setTimeout(async () => {
      const rows = await searchMessengerCustomers(supabase, me, dialCustQuery)
      if (!cancelled) setDialCustResults(rows)
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [view, dialCustQuery, me])

  const selectedThread = useMemo(() => threads.find((t) => t.id === selectedThreadId) ?? null, [threads, selectedThreadId])

  function threadTitle(t: ThreadSummary): string {
    if (t.is_group) return t.title?.trim() || "Group chat"
    const other = t.members.find((id) => id !== me)
    return other ? peerName(other) : "Direct message"
  }

  function threadOnline(t: ThreadSummary): boolean {
    if (t.is_group) return false
    const other = t.members.find((id) => id !== me)
    return other ? online.has(other) : false
  }

  const totalUnread = threads.reduce((a, t) => a + t.unread, 0)
  // Members without an existing 1:1 thread — offer as quick "start chat".
  const directPartnerIds = new Set(threads.filter((t) => !t.is_group).map((t) => t.members.find((id) => id !== me)).filter(Boolean) as string[])
  const startablePeers = peers.filter((p) => !directPartnerIds.has(p.id))

  async function handleSend() {
    if (!selectedThreadId || sending) return
    if (!input.trim() && !pendingCustomer) return
    setSending(true)
    const body = input.trim()
    const ref: CustomerRef | null = pendingCustomer ? { customerId: pendingCustomer.id, name: pendingCustomer.name } : null
    setInput("")
    setPendingCustomer(null)
    const res = await sendThreadMessage(supabase, me, selectedThreadId, body, ref)
    setSending(false)
    if (res.ok && res.message) {
      setMessages((prev) => (prev.some((x) => x.id === res.message!.id) ? prev : [...prev, res.message as InternalMessage]))
      void refreshThreads()
    } else {
      setInput(body)
      if (ref) setPendingCustomer({ id: ref.customerId, name: ref.name, phone: null })
      alert(res.error ?? "Could not send message.")
    }
  }

  async function handleCreateGroup() {
    if (creatingGroup) return
    setCreatingGroup(true)
    const { threadId, error } = await createGroupThread(supabase, me, [...groupSel], groupTitle)
    setCreatingGroup(false)
    if (!threadId) {
      alert(error ?? "Could not create group.")
      return
    }
    setGroupSel(new Set())
    setGroupTitle("")
    await refreshThreads()
    await openThread(threadId)
  }

  function openCustomerRef(ref: CustomerRef) {
    queueCustomerFocus(ref.customerId)
    setOpen(false)
    setPage("customers")
  }

  async function handleDial() {
    const digits = dialNumber.replace(/\D/g, "")
    if (digits.length < 10) {
      setDialMsg("Enter a 10-digit number.")
      return
    }
    setDialing(true)
    setDialMsg(null)
    try {
      const { data, error } = await supabase!.functions.invoke("twilio-bridge-call", { body: { customer_phone: dialNumber } })
      const d = (data ?? null) as { ok?: boolean; error?: string; message?: string } | null
      if (error) setDialMsg(d?.error || error.message)
      else if (d?.ok) setDialMsg(d.message || "Calling — your phone will ring first, then connect.")
      else setDialMsg(d?.error || "Could not place the call.")
    } catch (e) {
      setDialMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setDialing(false)
    }
  }

  // Twilio softphone: dial out to a phone number (PSTN).
  function startWebCall() {
    const digits = dialNumber.replace(/\D/g, "")
    if (digits.length < 10) {
      voice.setError("Enter a 10-digit number.")
      return
    }
    setDialMsg(null)
    const to = digits.length === 10 ? `+1${digits}` : `+${digits}`
    void voice.placePhoneCall(to, dialNumber)
  }

  // Start an internal call/conference (audio or video) with everyone in the open thread.
  function callThread(video: boolean) {
    if (!selectedThread) return
    const others = selectedThread.members.filter((id) => id !== me)
    if (others.length === 0) return
    setOpen(true)
    // Stay in the chat so you can keep messaging during the call.
    setView("chat")
    void room.startCall(others, { video })
  }

  // Surface an incoming team call: open the widget. Prefer staying on chat when possible.
  useEffect(() => {
    if (room.state === "incoming") {
      setOpen(true)
      setView("dial")
    } else if (room.state === "ringing" || room.state === "in_call") {
      setOpen(true)
      if (selectedThreadIdRef.current) setView("chat")
    }
  }, [room.state])

  // When accepting an incoming call with no thread open, open/create a DM with the first remote peer.
  useEffect(() => {
    if (room.state !== "in_call" || selectedThreadIdRef.current || !me) return
    const other = room.participants[0]?.id
    if (!other) return
    void findOrCreateDirectThread(supabase, me, other).then((r) => {
      if (r.threadId) {
        setSelectedThreadId(r.threadId)
        setView("chat")
        void loadThreadMessages(supabase, r.threadId).then(setMessages)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.state, room.participants])

  async function handlePopOut() {
    if (callPopCloseRef.current) return
    try {
      const close = await openConferencePopOut((mount) =>
        mountReactInPopup(
          mount,
          <ConferenceCallBody room={room} selfName="You" />,
        ),
      )
      callPopCloseRef.current = close
      setCallPoppedOut(true)
    } catch (e) {
      room.setError(e instanceof Error ? e.message : "Could not open video popup.")
    }
  }

  function handleReturnFromPopOut() {
    try {
      callPopCloseRef.current?.()
    } catch {
      /* ignore */
    }
    callPopCloseRef.current = null
    setCallPoppedOut(false)
  }

  useEffect(() => {
    if (room.state === "idle" && callPoppedOut) handleReturnFromPopOut()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.state])

  useEffect(() => () => {
    try {
      callPopCloseRef.current?.()
    } catch {
      /* ignore */
    }
  }, [])

  // Join a scheduled calendar video call (stable room) from anywhere in the app.
  useEffect(() => {
    return onJoinConference(({ roomId, video }) => {
      setOpen(true)
      setView("dial")
      void room.joinNamedRoom(roomId, { video })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!me) return null

  const callActive = active != null
  const roomActive = room.state !== "idle"

  const inCallChat =
    roomActive && selectedThreadId
      ? {
          messages: messages.slice(-40).map((m) => ({
            id: m.id,
            mine: m.sender_id === me,
            senderLabel: peerName(m.sender_id),
            body: m.body || (m.customer_ref ? `👤 ${m.customer_ref.name}` : ""),
          })),
          onSend: (text: string) => {
            void (async () => {
              if (!me || !selectedThreadId) return
              const res = await sendThreadMessage(supabase, me, selectedThreadId, text, null)
              if (res.ok && res.message) {
                setMessages((prev) => (prev.some((x) => x.id === res.message!.id) ? prev : [...prev, res.message!]))
                void refreshThreads()
              }
            })()
          },
          sending,
        }
      : null

  const callPanel =
    roomActive ? (
      <div style={{ padding: view === "chat" ? "8px 8px 0" : 0 }}>
        <ConferenceCallView
          room={room}
          selfName="You"
          compact={view === "chat"}
          chat={inCallChat}
          onPopOut={() => void handlePopOut()}
          poppedOut={callPoppedOut}
          onReturnFromPopOut={handleReturnFromPopOut}
        />
      </div>
    ) : null

  const headerTitle =
    view === "chat" ? (selectedThread ? threadTitle(selectedThread) : "Message") : view === "dial" ? "Dial out" : view === "new_group" ? "New group" : "Instant messaging"

  return (
    <div style={{ position: "fixed", right: 18, bottom: 80, zIndex: 12000 }}>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 58,
            width: 380,
            maxWidth: "calc(100vw - 36px)",
            height: "min(74vh, 620px)",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            boxShadow: "0 18px 48px rgba(15,23,42,0.30)",
            overflow: "hidden",
          }}
        >
          {/* Header — profile + availability on the left (desktop messenger) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: theme.primary, color: "#fff" }}>
            {view === "list" ? (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setAvailOpen((v) => !v)}
                  title="Your availability"
                  style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "3px 8px 3px 3px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                >
                  <span style={{ position: "relative", width: 28, height: 28, borderRadius: "50%", background: "#fff", color: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>
                    {initials(user?.user_metadata?.display_name || user?.email?.split("@")[0] || "You")}
                    <span style={{ position: "absolute", right: -1, bottom: -1, width: 9, height: 9, borderRadius: "50%", background: AVAILABILITY_COLOR[availability], border: "2px solid #fff" }} />
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{AVAILABILITY_LABEL[availability]}</span>
                </button>
                {availOpen ? (
                  <div style={{ position: "absolute", top: 36, left: 0, zIndex: 5, background: "#fff", color: theme.text, borderRadius: 10, border: `1px solid ${theme.border}`, boxShadow: "0 8px 24px rgba(15,23,42,0.18)", padding: 6, display: "grid", gap: 4, minWidth: 140 }}>
                    {(["available", "away", "busy"] as Availability[]).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          setAvailability(a)
                          setAvailOpen(false)
                          if (me) void saveMyAvailability(supabase, me, a)
                        }}
                        style={{ border: "none", background: availability === a ? "#f1f5f9" : "transparent", textAlign: "left", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 12, color: "#0f172a" }}
                      >
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: AVAILABILITY_COLOR[a], marginRight: 6 }} />
                        {AVAILABILITY_LABEL[a]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setView("list")
                  setSelectedThreadId(null)
                }}
                aria-label="Back"
                style={{ border: "none", background: "transparent", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              >
                ‹
              </button>
            )}
            <span style={{ fontWeight: 800, fontSize: 14, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {headerTitle}
              {view === "chat" && selectedThread?.is_group ? (
                <span style={{ fontWeight: 500, opacity: 0.85 }}> · {selectedThread.members.length} members</span>
              ) : null}
            </span>
            {view === "list" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setGroupSel(new Set())
                    setGroupTitle("")
                    setView("new_group")
                  }}
                  title="New group"
                  aria-label="New group"
                  style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                >
                  ＋ Group
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView("dial")
                    setDialMsg(null)
                  }}
                  title="Dial out"
                  aria-label="Dial out"
                  style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                >
                  ☎
                </button>
              </>
            ) : null}
            {view === "chat" && selectedThread ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const muted = isThreadPushMuted(selectedThread)
                    if (muted) {
                      void setThreadNotificationMute(supabase, me, selectedThread.id, false, null).then((r) => {
                        if (r.ok) {
                          setThreads((prev) =>
                            prev.map((t) => (t.id === selectedThread.id ? { ...t, notificationsMuted: false, mutedUntil: null } : t)),
                          )
                        }
                      })
                      return
                    }
                    const choice = window.prompt("Mute notifications: forever / 1h / 8h / 24h", "forever")
                    if (choice == null) return
                    const c = choice.trim().toLowerCase()
                    let until: string | null = null
                    if (c === "1h" || c === "1") until = new Date(Date.now() + 3600_000).toISOString()
                    else if (c === "8h" || c === "8") until = new Date(Date.now() + 8 * 3600_000).toISOString()
                    else if (c === "24h" || c === "24") until = new Date(Date.now() + 24 * 3600_000).toISOString()
                    void setThreadNotificationMute(supabase, me, selectedThread.id, true, until).then((r) => {
                      if (r.ok) {
                        setThreads((prev) =>
                          prev.map((t) =>
                            t.id === selectedThread.id ? { ...t, notificationsMuted: true, mutedUntil: until } : t,
                          ),
                        )
                      }
                    })
                  }}
                  title={isThreadPushMuted(selectedThread) ? "Unmute notifications" : "Mute notifications"}
                  aria-label="Chat notifications"
                  style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                >
                  {isThreadPushMuted(selectedThread) ? "🔕" : "🔔"}
                </button>
                <button
                  type="button"
                  onClick={() => callThread(false)}
                  title="Audio call"
                  aria-label="Audio call"
                  style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                >
                  📞
                </button>
                <button
                  type="button"
                  onClick={() => callThread(true)}
                  title="Video call"
                  aria-label="Video call"
                  style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                >
                  🎥
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "transparent", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Body */}
          {view === "list" ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!threadsLoaded && !peersLoaded ? (
                <div style={{ padding: 20, color: "#94a3b8", fontSize: 13 }}>Loading…</div>
              ) : (
                <>
                  {threads.length > 0 ? (
                    <div>
                      <div style={{ padding: "8px 12px 4px", fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Conversations</div>
                      {threads.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => void openThread(t.id)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", borderBottom: `1px solid ${theme.border}`, background: t.unread > 0 ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left" }}
                        >
                          {t.is_group ? (
                            <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#ede9fe", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>👥</span>
                          ) : (
                            <Avatar name={threadTitle(t)} online={threadOnline(t)} />
                          )}
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{threadTitle(t)}</span>
                            {t.lastMessage ? (
                              <span style={{ display: "block", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {t.lastMessage.customer_ref ? `👤 ${t.lastMessage.customer_ref.name}` : t.lastMessage.body}
                              </span>
                            ) : null}
                          </span>
                          {t.unread > 0 ? (
                            <span style={{ minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.unread > 99 ? "99+" : t.unread}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ padding: "8px 12px 4px", fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Team</div>
                  {startablePeers.length === 0 && threads.length === 0 ? (
                    <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>No other members in your organization yet.</div>
                  ) : (
                    startablePeers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => void openDirect(p.id)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", borderBottom: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", textAlign: "left" }}
                      >
                        <Avatar name={p.displayName} online={online.has(p.id)} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.displayName}</span>
                          {p.role ? <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>{p.role.replace(/_/g, " ")}</span> : null}
                        </span>
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          ) : view === "chat" ? (
            <>
              {callPanel}
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#f8fafc" }}>
                {messages.length === 0 ? (
                  <div style={{ margin: "auto", color: "#94a3b8", fontSize: 13 }}>No messages yet. Say hello 👋</div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === me
                    const showSender = !mine && selectedThread?.is_group
                    const deleted = Boolean(m.deleted_at)
                    return (
                      <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                        {showSender ? <div style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 2px 4px", fontWeight: 700 }}>{peerName(m.sender_id)}</div> : null}
                        <MessageActionTarget
                          mine={mine && !deleted}
                          onEdit={() => {
                            setEditingId(m.id)
                            setEditingBody(m.body)
                          }}
                          onDelete={() => {
                            if (!confirm("Delete this message?")) return
                            void deleteThreadMessage(supabase, me, m.id).then((r) => {
                              if (r.ok && r.message) setMessages((prev) => prev.map((x) => (x.id === r.message!.id ? r.message! : x)))
                            })
                          }}
                        >
                          <div style={{ padding: "8px 11px", borderRadius: 12, background: mine ? theme.primary : "#fff", color: mine ? "#fff" : theme.text, border: mine ? "none" : `1px solid ${theme.border}`, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", fontStyle: deleted ? "italic" : undefined, opacity: deleted ? 0.85 : 1 }}>
                            {deleted ? "Message deleted" : m.body}
                            {!deleted && m.edited_at ? (
                              <span style={{ display: "block", marginTop: 4, fontSize: 10, opacity: 0.75 }}>edited</span>
                            ) : null}
                            {!deleted && m.customer_ref ? (
                              <button
                                type="button"
                                onClick={() => openCustomerRef(m.customer_ref as CustomerRef)}
                                style={{ display: "flex", alignItems: "center", gap: 6, marginTop: m.body ? 6 : 0, padding: "6px 8px", borderRadius: 8, border: mine ? "1px solid rgba(255,255,255,0.5)" : `1px solid ${theme.border}`, background: mine ? "rgba(255,255,255,0.14)" : "#f8fafc", color: mine ? "#fff" : theme.primary, cursor: "pointer", fontWeight: 700, fontSize: 12, width: "100%", textAlign: "left" }}
                              >
                                <span>👤</span>
                                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.customer_ref.name}</span>
                                <span style={{ opacity: 0.7 }}>Open ›</span>
                              </button>
                            ) : null}
                          </div>
                        </MessageActionTarget>
                        {editingId === m.id ? (
                          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                            <textarea
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              rows={2}
                              style={{ width: "100%", borderRadius: 8, border: `1px solid ${theme.border}`, padding: 8, fontSize: 13, resize: "vertical" }}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  void editThreadMessage(supabase, me, m.id, editingBody).then((r) => {
                                    if (r.ok && r.message) {
                                      setMessages((prev) => prev.map((x) => (x.id === r.message!.id ? r.message! : x)))
                                      setEditingId(null)
                                    } else if (r.error) alert(r.error)
                                  })
                                }}
                                style={{ border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                              >
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingId(null)} style={{ border: `1px solid ${theme.border}`, background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>

              {pendingCustomer ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f1f5f9", borderTop: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>👤 {pendingCustomer.name}</span>
                  <button type="button" onClick={() => setPendingCustomer(null)} style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
              ) : null}

              {custPickerOpen ? (
                <div style={{ borderTop: `1px solid ${theme.border}`, maxHeight: 180, display: "flex", flexDirection: "column" }}>
                  <input
                    autoFocus
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    placeholder="Search your customers…"
                    style={{ margin: 8, padding: "7px 9px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13, color: "#0f172a", background: "#fff" }}
                  />
                  <div style={{ overflowY: "auto" }}>
                    {custResults.length === 0 ? (
                      <div style={{ padding: "4px 12px 10px", color: "#94a3b8", fontSize: 12 }}>No matches.</div>
                    ) : (
                      custResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setPendingCustomer(c)
                            setCustPickerOpen(false)
                            setCustQuery("")
                          }}
                          style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderTop: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontSize: 13, color: theme.text }}
                        >
                          👤 {c.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${theme.border}`, alignItems: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCustPickerOpen((v) => !v)
                    setCustQuery("")
                  }}
                  title="Reference a customer"
                  aria-label="Reference a customer"
                  style={{ border: `1px solid ${theme.border}`, background: custPickerOpen ? "#eff6ff" : "#fff", color: theme.primary, borderRadius: 8, width: 38, height: 38, cursor: "pointer", fontSize: 16, flexShrink: 0 }}
                >
                  👤
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Type a message…"
                  rows={1}
                  style={{ flex: 1, resize: "none", padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13, fontFamily: "inherit", maxHeight: 90, color: "#0f172a", background: "#fff" }}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending || (!input.trim() && !pendingCustomer)}
                  style={{ border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "0 14px", height: 38, fontWeight: 700, cursor: sending || (!input.trim() && !pendingCustomer) ? "default" : "pointer", opacity: sending || (!input.trim() && !pendingCustomer) ? 0.6 : 1, flexShrink: 0 }}
                >
                  Send
                </button>
              </div>
            </>
          ) : view === "new_group" ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group name (optional)"
                style={{ margin: 10, padding: "9px 11px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, color: "#0f172a", background: "#fff" }}
              />
              <div style={{ padding: "0 12px 6px", fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Add members</div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {peers.length === 0 ? (
                  <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>No other members to add.</div>
                ) : (
                  peers.map((p) => {
                    const checked = groupSel.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setGroupSel((prev) => {
                            const next = new Set(prev)
                            if (next.has(p.id)) next.delete(p.id)
                            else next.add(p.id)
                            return next
                          })
                        }
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "none", borderBottom: `1px solid ${theme.border}`, background: checked ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? theme.primary : "#cbd5e1"}`, background: checked ? theme.primary : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{checked ? "✓" : ""}</span>
                        <Avatar name={p.displayName} online={online.has(p.id)} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.displayName}</span>
                      </button>
                    )
                  })
                )}
              </div>
              <div style={{ padding: 10, borderTop: `1px solid ${theme.border}` }}>
                <button
                  type="button"
                  onClick={() => void handleCreateGroup()}
                  disabled={creatingGroup || groupSel.size === 0}
                  style={{ width: "100%", border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "10px 14px", fontWeight: 700, cursor: creatingGroup || groupSel.size === 0 ? "default" : "pointer", opacity: creatingGroup || groupSel.size === 0 ? 0.6 : 1 }}
                >
                  {creatingGroup ? "Creating…" : `Create group${groupSel.size ? ` (${groupSel.size})` : ""}`}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
              {roomActive ? (
                <ConferenceCallView
                  room={room}
                  selfName="You"
                  chat={inCallChat}
                  onPopOut={() => void handlePopOut()}
                  poppedOut={callPoppedOut}
                  onReturnFromPopOut={handleReturnFromPopOut}
                />
              ) : callActive && active ? (
                <InCallControls
                  label={active.label}
                  stateLabel={formatCallStateLabel(active.state, active.seconds)}
                  muted={active.muted}
                  speakerOn={active.speakerOn}
                  speakerSupported={active.speakerSupported}
                  canInteract={active.state === "in_call"}
                  error={active.error}
                  onToggleMute={active.toggleMute}
                  onToggleSpeaker={active.toggleSpeaker}
                  onHangup={active.hangup}
                  onSendDigit={active.sendDigits}
                />
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Call from this computer using your Tradesman business number. Search a customer or type a number.
                  </p>
                  <input
                    value={dialCustQuery}
                    onChange={(e) => {
                      setDialCustQuery(e.target.value)
                      setDialSelectedName(null)
                    }}
                    placeholder="Search customer…"
                    style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, color: "#0f172a", background: "#fff" }}
                  />
                  {dialCustResults.length > 0 && !dialSelectedName ? (
                    <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff" }}>
                      {dialCustResults.slice(0, 8).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!c.phone}
                          onClick={() => {
                            if (!c.phone) return
                            setDialNumber(c.phone)
                            setDialSelectedName(c.name)
                            setDialCustQuery(c.name)
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            borderBottom: `1px solid ${theme.border}`,
                            background: "#fff",
                            padding: "8px 10px",
                            cursor: c.phone ? "pointer" : "default",
                            opacity: c.phone ? 1 : 0.5,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{c.phone || "No phone on file"}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {dialSelectedName ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#059669", fontWeight: 700 }}>Calling: {dialSelectedName}</p>
                  ) : null}
                  <input
                    type="tel"
                    inputMode="tel"
                    value={dialNumber}
                    onChange={(e) => {
                      setDialNumber(e.target.value)
                      setDialSelectedName(null)
                    }}
                    placeholder="(555) 123-4567"
                    style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 16, color: "#0f172a", background: "#fff" }}
                  />
                  <button
                    type="button"
                    onClick={() => startWebCall()}
                    style={{ border: "none", background: "#059669", color: "#fff", borderRadius: 8, padding: "12px 14px", fontWeight: 800, cursor: "pointer", fontSize: 15 }}
                  >
                    📞 Call
                  </button>
                  {voice.error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626", lineHeight: 1.45 }}>{voice.error}</p> : null}
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, display: "grid", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => void handleDial()}
                      disabled={dialing}
                      style={{ border: `1px solid ${theme.border}`, background: "#fff", color: "#334155", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: dialing ? "default" : "pointer", opacity: dialing ? 0.6 : 1, fontSize: 13 }}
                    >
                      {dialing ? "Calling…" : "Ring my phone instead"}
                    </button>
                    {dialMsg ? <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>{dialMsg}</p> : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Instant messaging"
        title="Instant messaging"
        style={{ position: "relative", width: 48, height: 48, borderRadius: "50%", border: "none", padding: 0, background: "#fff", cursor: "pointer", boxShadow: "0 8px 24px rgba(15,23,42,0.28)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <img src={messagingIcon} alt="" width={48} height={48} style={{ display: "block", objectFit: "cover" }} />
        {totalUnread > 0 ? (
          <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        ) : null}
      </button>
    </div>
  )
}
