import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react"
import { supabase } from "../lib/supabaseClient"
import { useConferenceRoom } from "../lib/useConferenceRoom"
import { useVoiceDevice } from "../lib/useVoiceDevice"
import ConferenceCallView from "./ConferenceCallView"
import InCallControls, { formatCallStateLabel } from "../components/InCallControls"
import logo from "../assets/logo.png"
import {
  AVAILABILITY_COLOR,
  AVAILABILITY_LABEL,
  loadDisplayName,
  loadMyAvailability,
  saveMyAvailability,
  type Availability,
} from "../lib/availability"
import {
  formatDayHeader,
  formatEventTime,
  loadUpcomingCalendarEvents,
  startOfWeek,
  endOfWeek,
  type MobileCalendarEvent,
} from "../lib/calendarEvents"
import {
  createGroupThread,
  deleteThreadMessage,
  editThreadMessage,
  findOrCreateDirectThread,
  loadOrgPeers,
  loadPeerNames,
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
import MessageActionTarget from "../components/MessageActionTarget"
import { ensureMessagingPush, loadMessagingNotifPrefs, saveMessagingNotifPrefs } from "../lib/messagingNotifications"
import { PENDING_DIAL_EVENT, takePendingDial, type PendingDial } from "../lib/pendingDial"

type Peer = { id: string; name: string }
type Tab = "chats" | "new" | "phone" | "calendar" | "settings"

const EMOJIS = ["😀", "😂", "👍", "👏", "🙏", "🔥", "❤️", "✅", "❗", "📅", "📞", "🛠️", "🚗", "📦", "💡", "👋"]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function MessengerScreen({ me }: { me: string }) {
  const [tab, setTab] = useState<Tab>("chats")
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [input, setInput] = useState("")
  const [myName, setMyName] = useState("You")
  const [availability, setAvailability] = useState<Availability>("available")
  const [availOpen, setAvailOpen] = useState(false)

  // New chat multi-select
  const [newSel, setNewSel] = useState<Set<string>>(new Set())
  const [startingChat, setStartingChat] = useState(false)

  // Customer reference
  const [pendingCustomer, setPendingCustomer] = useState<CustomerRef | null>(null)
  const [custPickerOpen, setCustPickerOpen] = useState(false)
  const [custQuery, setCustQuery] = useState("")
  const [custResults, setCustResults] = useState<MessengerCustomer[]>([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")
  const [muteMenuOpen, setMuteMenuOpen] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [notifPreview, setNotifPreview] = useState(true)

  // Phone (softphone)
  const [dialNumber, setDialNumber] = useState("")
  const [dialCustQuery, setDialCustQuery] = useState("")
  const [dialCustResults, setDialCustResults] = useState<MessengerCustomer[]>([])
  const [dialSelectedName, setDialSelectedName] = useState<string | null>(null)
  const voice = useVoiceDevice()

  // Prefill Phone tab when Main app hands off a customer number.
  useEffect(() => {
    function applyDial(d: PendingDial) {
      setTab("phone")
      setDialNumber(d.phone)
      setDialSelectedName(d.label ?? null)
      setDialCustQuery(d.label ?? "")
    }
    const existing = takePendingDial()
    if (existing) applyDial(existing)
    const handler = (e: Event) => {
      const d = (e as CustomEvent<PendingDial>).detail
      if (d?.phone?.trim()) {
        takePendingDial()
        applyDial({ phone: d.phone.trim(), label: d.label?.trim() || undefined })
      }
    }
    window.addEventListener(PENDING_DIAL_EVENT, handler)
    return () => window.removeEventListener(PENDING_DIAL_EVENT, handler)
  }, [])

  // Calendar
  const [calEvents, setCalEvents] = useState<MobileCalendarEvent[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()))

  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const peerName = useCallback((id: string) => (id === me ? "You" : names.get(id) ?? "Member"), [names, me])
  const room = useConferenceRoom(me, peerName)

  const refresh = useCallback(async () => {
    const { threads: list } = await loadThreadsWithMeta(supabase, me)
    setThreads(list)
    const ids = list.flatMap((t) => t.members)
    setNames(await loadPeerNames(supabase, ids))
  }, [me])

  useEffect(() => {
    void refresh()
    void loadOrgPeers(supabase, me).then(setPeers)
    void loadDisplayName(supabase, me).then(setMyName)
    void loadMyAvailability(supabase, me).then(setAvailability)
    void loadMessagingNotifPrefs(me).then((p) => {
      setNotifEnabled(p.enabled)
      setNotifPreview(p.showPreview)
      if (p.enabled) void ensureMessagingPush(me)
    })
    const id = window.setInterval(() => void refresh(), 20_000)
    return () => window.clearInterval(id)
  }, [me, refresh])

  useEffect(() => {
    const channel = supabase
      .channel(`im-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages" }, (payload) => {
        const raw = payload.new as Record<string, unknown>
        if ((raw.thread_id as string) === selectedRef.current) {
          void loadThreadMessages(supabase, selectedRef.current).then(setMessages)
        }
        void refresh()
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "internal_messages" }, (payload) => {
        const raw = payload.new as Record<string, unknown>
        if ((raw.thread_id as string) === selectedRef.current) {
          void loadThreadMessages(supabase, selectedRef.current).then(setMessages)
        }
        void refresh()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [me, refresh])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!custPickerOpen) return
    const h = window.setTimeout(() => {
      void searchMessengerCustomers(supabase, me, custQuery).then(setCustResults)
    }, 200)
    return () => window.clearTimeout(h)
  }, [custPickerOpen, custQuery, me])

  useEffect(() => {
    if (tab !== "phone") return
    const h = window.setTimeout(() => {
      void searchMessengerCustomers(supabase, me, dialCustQuery).then(setDialCustResults)
    }, 200)
    return () => window.clearTimeout(h)
  }, [tab, dialCustQuery, me])

  useEffect(() => {
    if (tab !== "calendar") return
    setCalLoading(true)
    const from = startOfWeek(weekAnchor)
    const to = endOfWeek(weekAnchor)
    void loadUpcomingCalendarEvents(supabase, me, { from, to })
      .then(setCalEvents)
      .finally(() => setCalLoading(false))
  }, [tab, me, weekAnchor])

  // Soft status bar: don't draw under the system clock/battery strip.
  useEffect(() => {
    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar")
        await StatusBar.setOverlaysWebView({ overlay: false })
        await StatusBar.setStyle({ style: Style.Light })
        await StatusBar.setBackgroundColor({ color: "#f97316" })
      } catch {
        /* web / plugin missing */
      }
    })()
  }, [])

  const openThread = useCallback(
    async (threadId: string) => {
      setSelected(threadId)
      setTab("chats")
      setMessages(await loadThreadMessages(supabase, threadId))
      await markThreadRead(supabase, me, threadId)
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    },
    [me],
  )

  async function startSelectedChat() {
    if (newSel.size === 0) return
    setStartingChat(true)
    try {
      const ids = [...newSel]
      let threadId: string | null = null
      if (ids.length === 1) {
        const r = await findOrCreateDirectThread(supabase, me, ids[0])
        threadId = r.threadId
      } else {
        const r = await createGroupThread(supabase, me, ids, "")
        threadId = r.threadId
      }
      if (threadId) {
        setNewSel(new Set())
        await refresh()
        await openThread(threadId)
      }
    } finally {
      setStartingChat(false)
    }
  }

  async function send() {
    if (!selected) return
    if (!input.trim() && !pendingCustomer) return
    const body = input.trim()
    const ref = pendingCustomer
    setInput("")
    setPendingCustomer(null)
    setEmojiOpen(false)
    const res = await sendThreadMessage(supabase, me, selected, body, ref)
    const msg = res.message
    if (res.ok && msg) {
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]))
      void refresh()
    } else {
      setInput(body)
      setPendingCustomer(ref)
    }
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !selected) return
    setFileBusy(true)
    try {
      // Reuse the platform bucket (already provisioned) under the signed-in user prefix.
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file"
      const path = `${me}/messenger/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from("comm-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
      if (upErr) {
        await sendThreadMessage(
          supabase,
          me,
          selected,
          `📎 ${file.name} (upload failed: ${upErr.message})`,
          null,
        )
      } else {
        const { data } = supabase.storage.from("comm-attachments").getPublicUrl(path)
        const url = data?.publicUrl?.trim()
        const body = url ? `📎 ${file.name}\n${url}` : `📎 ${file.name}`
        await sendThreadMessage(supabase, me, selected, body, null)
      }
      if (selected) setMessages(await loadThreadMessages(supabase, selected))
      void refresh()
    } finally {
      setFileBusy(false)
    }
  }

  async function setAvail(next: Availability) {
    setAvailability(next)
    setAvailOpen(false)
    await saveMyAvailability(supabase, me, next)
  }

  function threadTitle(t: ThreadSummary): string {
    if (t.is_group) return t.title?.trim() || "Group chat"
    const other = t.members.find((id) => id !== me)
    return other ? peerName(other) : "Direct message"
  }

  const selectedThread = useMemo(() => threads.find((t) => t.id === selected) ?? null, [threads, selected])

  function callThread(t: ThreadSummary, video: boolean) {
    const others = t.members.filter((id) => id !== me)
    if (others.length === 0) return
    void room.startCall(others, { video })
  }

  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAnchor)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }, [weekAnchor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, MobileCalendarEvent[]>()
    for (const ev of calEvents) {
      const d = new Date(ev.start_at)
      if (Number.isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const arr = map.get(key) ?? []
      arr.push(ev)
      map.set(key, arr)
    }
    return map
  }, [calEvents])

  const inCallChat =
    selected && room.state !== "idle"
      ? {
          messages: messages.slice(-40).map((m) => ({
            id: m.id,
            mine: m.sender_id === me,
            senderLabel: peerName(m.sender_id),
            body: m.body || (m.customer_ref ? `👤 ${m.customer_ref.name}` : ""),
          })),
          onSend: (text: string) => {
            if (!selected) return
            void sendThreadMessage(supabase, me, selected, text, null).then((res) => {
              if (res.ok && res.message) {
                const msg = res.message
                setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]))
                void refresh()
              }
            })
          },
        }
      : null

  if (room.state !== "idle") {
    return <ConferenceCallView room={room} selfName={myName} chat={inCallChat} />
  }

  const topNav = (
    <div className="app-header">
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 6px" }}>
        <button
          type="button"
          onClick={() => {
            setSelected(null)
            setTab("settings")
          }}
          title="Messenger settings"
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <img src={logo} alt="Tradesman" height={28} style={{ display: "block", borderRadius: 4 }} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setAvailOpen((v) => !v)}
          style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "4px 8px 4px 4px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <span style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", background: "#fff", color: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>
            {initials(myName)}
            <span style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", background: AVAILABILITY_COLOR[availability], border: "2px solid #fff" }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{AVAILABILITY_LABEL[availability]}</span>
        </button>
      </div>
      {availOpen ? (
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px", flexWrap: "wrap" }}>
          {(["available", "away", "busy"] as Availability[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => void setAvail(a)}
              style={{ border: "none", background: availability === a ? "#fff" : "rgba(255,255,255,0.2)", color: availability === a ? "#0f172a" : "#fff", borderRadius: 999, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: AVAILABILITY_COLOR[a], marginRight: 6 }} />
              {AVAILABILITY_LABEL[a]}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 4, padding: "0 8px 10px" }}>
        {(
          [
            { id: "chats" as const, label: selected && tab === "chats" ? "Chats" : tab === "chats" ? "Chats" : "Chats" },
            { id: "new" as const, label: "New Chat" },
            { id: "phone" as const, label: "Phone" },
            { id: "calendar" as const, label: "Calendar" },
          ] as const
        ).map((b) => {
          const active = tab === b.id && !(b.id === "chats" && selected)
          const chatsActive = b.id === "chats" && tab === "chats" && !selected
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                if (b.id === "chats") {
                  setSelected(null)
                  setTab("chats")
                  return
                }
                setSelected(null)
                setTab(b.id)
              }}
              style={{
                flex: 1,
                border: "none",
                background: active || chatsActive ? "#fff" : "rgba(255,255,255,0.16)",
                color: active || chatsActive ? "#c2410c" : "#fff",
                borderRadius: 10,
                padding: "9px 4px",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {b.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  // ── Settings (logo tap) ───────────────────────────────────────────────────
  if (tab === "settings" && !selected) {
    return (
      <div className="app-shell">
        {topNav}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Messenger settings</h2>
          <section style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "#fff" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Notifications</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={notifEnabled}
                onChange={(e) => {
                  const on = e.target.checked
                  setNotifEnabled(on)
                  void saveMessagingNotifPrefs(me, { enabled: on, showPreview: notifPreview })
                  if (on) void ensureMessagingPush(me)
                }}
              />
              Enable push notifications
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, opacity: notifEnabled ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={notifPreview}
                disabled={!notifEnabled}
                onChange={(e) => {
                  const on = e.target.checked
                  setNotifPreview(on)
                  void saveMessagingNotifPrefs(me, { enabled: notifEnabled, showPreview: on })
                }}
              />
              Show message preview
            </label>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
              Per-chat mute is available from the chat header (bell). Unread badges still update when muted.
            </p>
          </section>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const { revokeLocalAppSession } = await import("../lib/appSessions")
                await revokeLocalAppSession(supabase, "messaging")
                await supabase.auth.signOut()
              })()
            }}
            style={{ border: `1px solid var(--border)`, background: "#fff", color: "#b91c1c", borderRadius: 10, padding: "12px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // ── Open chat ─────────────────────────────────────────────────────────────
  if (selected && selectedThread) {
    return (
      <div className="app-shell">
        {topNav}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "#fff", position: "relative" }}>
          <button type="button" onClick={() => setSelected(null)} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "var(--text)" }}>
            ‹
          </button>
          <strong style={{ flex: 1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threadTitle(selectedThread)}</strong>
          <button
            type="button"
            onClick={() => setMuteMenuOpen((v) => !v)}
            style={iconBtn}
            title="Notification options"
          >
            {isThreadPushMuted(selectedThread) ? "🔕" : "🔔"}
          </button>
          <button type="button" onClick={() => callThread(selectedThread, false)} style={iconBtn} title="Audio call">
            📞
          </button>
          <button type="button" onClick={() => callThread(selectedThread, true)} style={iconBtn} title="Video call">
            🎥
          </button>
          {muteMenuOpen ? (
            <div style={{ position: "absolute", right: 12, top: 48, zIndex: 20, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.15)", minWidth: 180, overflow: "hidden" }}>
              {[
                { label: "Mute forever", muted: true, until: null as string | null },
                { label: "Mute 1 hour", muted: true, until: new Date(Date.now() + 3600_000).toISOString() },
                { label: "Mute 8 hours", muted: true, until: new Date(Date.now() + 8 * 3600_000).toISOString() },
                { label: "Mute 24 hours", muted: true, until: new Date(Date.now() + 24 * 3600_000).toISOString() },
                { label: "Unmute", muted: false, until: null },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    void setThreadNotificationMute(supabase, me, selectedThread.id, opt.muted, opt.until).then((r) => {
                      if (r.ok) {
                        setThreads((prev) =>
                          prev.map((t) =>
                            t.id === selectedThread.id
                              ? { ...t, notificationsMuted: opt.muted, mutedUntil: opt.until }
                              : t,
                          ),
                        )
                      }
                      setMuteMenuOpen(false)
                    })
                  }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border)", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((m) => {
            const mine = m.sender_id === me
            const deleted = Boolean(m.deleted_at)
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                {!mine && selectedThread.is_group ? (
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, margin: "0 0 2px 4px" }}>{peerName(m.sender_id)}</div>
                ) : null}
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
                  <div
                    style={{
                      padding: "9px 12px",
                      borderRadius: 14,
                      background: mine ? "var(--orange)" : "#fff",
                      color: mine ? "#fff" : "var(--text)",
                      border: mine ? "none" : "1px solid var(--border)",
                      fontSize: 15,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontStyle: deleted ? "italic" : undefined,
                      opacity: deleted ? 0.85 : 1,
                    }}
                  >
                    {deleted ? "Message deleted" : m.body}
                    {!deleted && m.edited_at ? <span style={{ display: "block", marginTop: 4, fontSize: 11, opacity: 0.75 }}>edited</span> : null}
                    {!deleted && m.customer_ref ? (
                      <div style={{ marginTop: m.body ? 6 : 0, padding: "6px 8px", borderRadius: 8, background: mine ? "rgba(255,255,255,0.18)" : "#f8fafc", fontWeight: 700, fontSize: 13 }}>
                        👤 {m.customer_ref.name}
                      </div>
                    ) : null}
                  </div>
                </MessageActionTarget>
                {editingId === m.id ? (
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    <textarea value={editingBody} onChange={(e) => setEditingBody(e.target.value)} rows={2} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", padding: 8, fontSize: 14 }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          void editThreadMessage(supabase, me, m.id, editingBody).then((r) => {
                            if (r.ok && r.message) {
                              setMessages((prev) => prev.map((x) => (x.id === r.message!.id ? r.message! : x)))
                              setEditingId(null)
                            }
                          })
                        }}
                        style={{ border: "none", background: "var(--orange)", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700 }}
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} style={{ border: "1px solid var(--border)", background: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {pendingCustomer ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderTop: "1px solid var(--border)", background: "#eef2ff", minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "#3730a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              👤 {pendingCustomer.name}
            </span>
            <button
              type="button"
              onClick={() => setPendingCustomer(null)}
              aria-label="Clear customer reference"
              style={{ border: "none", background: "#e2e8f0", color: "#0f172a", cursor: "pointer", fontSize: 18, lineHeight: 1, width: 32, height: 32, borderRadius: 16, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        ) : null}

        {emojiOpen ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 10px", borderTop: "1px solid var(--border)", background: "#fff" }}>
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setInput((v) => v + e)} style={{ border: "none", background: "#f1f5f9", borderRadius: 8, width: 40, height: 40, fontSize: 20, cursor: "pointer" }}>
                {e}
              </button>
            ))}
          </div>
        ) : null}

        <div className="app-footer" style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 4, padding: "8px 8px 4px", alignItems: "center", minWidth: 0 }}>
            <input ref={fileInputRef} type="file" hidden onChange={(e) => void onPickFile(e)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={fileBusy} title="Attach a file" style={composerBtn}>
              📎
            </button>
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              title="Emoji"
              style={{ ...composerBtn, background: emojiOpen ? "#fff7ed" : "#fff" }}
            >
              😊
            </button>
            <button
              type="button"
              onClick={() => {
                setCustPickerOpen(true)
                setCustQuery("")
              }}
              title="Reference a customer (does not text them)"
              style={composerBtn}
            >
              👤
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send()}
              placeholder="Message…"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 15, color: "#0f172a", background: "#fff" }}
            />
            <button
              type="button"
              onClick={() => void send()}
              title="Send"
              aria-label="Send"
              style={{ border: "none", background: "var(--orange)", color: "#fff", borderRadius: 20, width: 42, height: 42, fontWeight: 800, cursor: "pointer", flexShrink: 0, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ➤
            </button>
          </div>
          <div style={{ padding: "0 14px 6px", fontSize: 11, color: "var(--muted)" }}>👤 = reference a customer in chat (not a text to them)</div>
        </div>

        {custPickerOpen ? (
          <div style={overlay}>
            <div style={sheet}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingTop: 4 }}>
                <strong style={{ flex: 1, fontSize: 15, minWidth: 0 }}>Reference a customer</strong>
                <button
                  type="button"
                  onClick={() => setCustPickerOpen(false)}
                  aria-label="Close"
                  style={{ border: "none", background: "#e2e8f0", width: 36, height: 36, borderRadius: 18, fontSize: 20, cursor: "pointer", color: "#0f172a", flexShrink: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)" }}>Attaches a customer card to your team message. Does not message the customer.</p>
              <input value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="Search customers…" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 15, color: "#0f172a", background: "#fff" }} />
              <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
                {custResults.length === 0 ? (
                  <div style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>No customers found.</div>
                ) : (
                  custResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setPendingCustomer({ customerId: c.id, name: c.name })
                        setCustPickerOpen(false)
                      }}
                      style={rowStyle}
                    >
                      👤 {c.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // ── New Chat (multi-select) ───────────────────────────────────────────────
  if (tab === "new") {
    return (
      <div className="app-shell">
        {topNav}
        <div style={{ padding: 12, fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
          Select one teammate for a direct chat, or several to start a group — then tap Start chat.
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {peers.length === 0 ? (
            <div style={{ padding: 16, color: "var(--muted)" }}>No teammates found in your organization yet.</div>
          ) : (
            peers.map((p) => {
              const on = newSel.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setNewSel((prev) => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id)
                      else next.add(p.id)
                      return next
                    })
                  }
                  style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 10, background: on ? "#eff6ff" : "#fff" }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: `2px solid ${on ? "var(--orange)" : "#cbd5e1"}`,
                      background: on ? "var(--orange)" : "#fff",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  {p.name}
                </button>
              )
            })
          )}
        </div>
        <div className="app-footer" style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => void startSelectedChat()}
            disabled={newSel.size === 0 || startingChat}
            style={{
              width: "100%",
              border: "none",
              background: newSel.size ? "var(--orange)" : "#cbd5e1",
              color: "#fff",
              borderRadius: 10,
              padding: "14px",
              fontWeight: 800,
              fontSize: 15,
              cursor: newSel.size ? "pointer" : "default",
            }}
          >
            {startingChat ? "Starting…" : `Start chat (${newSel.size})`}
          </button>
        </div>
      </div>
    )
  }

  // ── Phone (in-app softphone) ──────────────────────────────────────────────
  if (tab === "phone") {
    const callActive = voice.callState !== "idle"
    return (
      <div className="app-shell">
        {topNav}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Calls go out from your Tradesman Twilio number through this app (mic + speaker). Your personal phone is not dialed first.
          </p>
          {callActive ? (
            <InCallControls
              label={voice.peer?.label ?? "Call"}
              stateLabel={formatCallStateLabel(voice.callState, voice.seconds)}
              muted={voice.muted}
              speakerOn={voice.speakerOn}
              speakerSupported={voice.speakerSupported}
              canInteract={voice.callState === "in_call"}
              error={voice.error}
              onToggleMute={voice.toggleMute}
              onToggleSpeaker={voice.toggleSpeaker}
              onHangup={voice.hangup}
              onSendDigit={voice.sendDigits}
            />
          ) : (
            <>
              {voice.error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{voice.error}</p> : null}
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                Calls go out from your Tradesman Twilio number. Search a customer or type a number.
              </p>
              <input
                value={dialCustQuery}
                onChange={(e) => {
                  setDialCustQuery(e.target.value)
                  setDialSelectedName(null)
                }}
                placeholder="Search customer…"
                style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, color: "#0f172a", background: "#fff" }}
              />
              {dialCustResults.length > 0 && !dialSelectedName ? (
                <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }}>
                  {dialCustResults.slice(0, 10).map((c) => (
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
                        borderBottom: "1px solid var(--border)",
                        background: "#fff",
                        padding: "12px 14px",
                        cursor: c.phone ? "pointer" : "default",
                        opacity: c.phone ? 1 : 0.5,
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.phone || "No phone on file"}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {dialSelectedName ? (
                <p style={{ margin: 0, fontSize: 13, color: "#059669", fontWeight: 700 }}>Calling: {dialSelectedName}</p>
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
                style={{ padding: "14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 18, color: "#0f172a", background: "#fff" }}
              />
              <button
                type="button"
                onClick={() => void voice.placePhoneCall(dialNumber)}
                style={{ border: "none", background: "#059669", color: "#fff", borderRadius: 10, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}
              >
                Call from app
              </button>
              {voice.error ? <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>{voice.error}</p> : null}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Calendar (weekly / Teams-like list) ───────────────────────────────────
  if (tab === "calendar") {
    return (
      <div className="app-shell">
        {topNav}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "#fff" }}>
          <button
            type="button"
            onClick={() => {
              const d = new Date(weekAnchor)
              d.setDate(d.getDate() - 7)
              setWeekAnchor(d)
            }}
            style={iconBtn}
          >
            ‹
          </button>
          <strong style={{ flex: 1, textAlign: "center", fontSize: 14 }}>
            Week of {weekAnchor.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </strong>
          <button
            type="button"
            onClick={() => {
              const d = new Date(weekAnchor)
              d.setDate(d.getDate() + 7)
              setWeekAnchor(d)
            }}
            style={iconBtn}
          >
            ›
          </button>
          <button type="button" onClick={() => setWeekAnchor(startOfWeek(new Date()))} style={{ ...iconBtn, fontSize: 12, fontWeight: 700, padding: "6px 8px" }}>
            Today
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {calLoading ? <div style={{ color: "var(--muted)", padding: 12 }}>Loading calendar…</div> : null}
          {!calLoading &&
            weekDays.map((day) => {
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
              const list = eventsByDay.get(key) ?? []
              return (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    {formatDayHeader(day)}
                  </div>
                  {list.length === 0 ? (
                    <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fff", border: `1px dashed var(--border)`, color: "var(--muted)", fontSize: 13 }}>No events</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {list.map((ev) => (
                        <div key={ev.id} style={{ padding: "12px 14px", borderRadius: 12, background: "#fff", border: `1px solid var(--border)`, borderLeft: "4px solid var(--orange)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#c2410c" }}>
                            {formatEventTime(ev.start_at)} – {formatEventTime(ev.end_at)}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{ev.title}</div>
                          {ev.customer_name ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{ev.customer_name}</div> : null}
                          {ev.videoCall ? (
                            <button
                              type="button"
                              onClick={() => void room.joinNamedRoom(ev.videoCall!.roomId, { video: ev.videoCall!.video })}
                              style={{
                                marginTop: 10,
                                border: "none",
                                background: "#059669",
                                color: "#fff",
                                borderRadius: 8,
                                padding: "8px 12px",
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              {ev.videoCall.video ? "Join video call" : "Join conference call"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          {!calLoading && calEvents.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", marginTop: 24 }}>
              No events this week on your Tradesman calendar.
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  // ── Chats list (default) ──────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {topNav}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {threads.length === 0 ? (
          <div style={{ padding: 24, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
            No conversations yet.
            <br />
            Tap <strong>New Chat</strong> to message your team.
          </div>
        ) : (
          threads.map((t) => (
            <button key={t.id} type="button" onClick={() => void openThread(t.id)} style={{ ...rowStyle, background: t.unread > 0 ? "#eff6ff" : "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ display: "block", fontWeight: 700 }}>{threadTitle(t)}</span>
                {t.lastMessage ? (
                  <span style={{ display: "block", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.lastMessage.customer_ref ? `👤 ${t.lastMessage.customer_ref.name}` : t.lastMessage.body}
                  </span>
                ) : null}
              </span>
              {t.unread > 0 ? <span style={badge}>{t.unread}</span> : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

const iconBtn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "#fff",
  color: "var(--text)",
  borderRadius: 8,
  padding: "5px 9px",
  fontSize: 15,
  cursor: "pointer",
}

const composerBtn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "#fff",
  color: "var(--text)",
  borderRadius: 20,
  width: 38,
  height: 38,
  fontSize: 16,
  cursor: "pointer",
  flexShrink: 0,
}

const badge: CSSProperties = {
  minWidth: 22,
  height: 22,
  borderRadius: 11,
  background: "#dc2626",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 6px",
}

const rowStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  border: "none",
  borderBottom: "1px solid var(--border)",
  background: "#fff",
  cursor: "pointer",
  fontSize: 15,
  color: "var(--text)",
}

const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }
const sheet: CSSProperties = {
  width: "100%",
  background: "#fff",
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  padding: "calc(12px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom))",
  maxHeight: "75vh",
  boxSizing: "border-box",
}
