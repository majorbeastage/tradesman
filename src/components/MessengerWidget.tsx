import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import { loadOrganizationPeers, type OrganizationPeer } from "../lib/organizationPeers"
import { queueCustomerFocus } from "../lib/customerNavigation"
import {
  createGroupThread,
  findOrCreateDirectThread,
  loadThreadMessages,
  loadThreadsWithMeta,
  markThreadRead,
  searchMessengerCustomers,
  sendThreadMessage,
  type CustomerRef,
  type InternalMessage,
  type MessengerCustomer,
  type ThreadSummary,
} from "../lib/internalMessaging"
import { onOpenMessenger } from "../lib/messengerBus"
import messagingIcon from "../assets/messaging-app-icon.png"

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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)

  // Customer reference picker
  const [pendingCustomer, setPendingCustomer] = useState<MessengerCustomer | null>(null)
  const [custPickerOpen, setCustPickerOpen] = useState(false)
  const [custQuery, setCustQuery] = useState("")
  const [custResults, setCustResults] = useState<MessengerCustomer[]>([])

  // New group
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set())
  const [groupTitle, setGroupTitle] = useState("")
  const [creatingGroup, setCreatingGroup] = useState(false)

  // Dial out
  const [dialNumber, setDialNumber] = useState("")
  const [dialing, setDialing] = useState(false)
  const [dialMsg, setDialMsg] = useState<string | null>(null)

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

  // Realtime: new messages in my threads
  useEffect(() => {
    if (!me || !supabase) return
    const sb = supabase
    const channel = sb
      .channel(`internal-msgs-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages" }, (payload) => {
        const raw = payload.new as Record<string, unknown>
        const threadId = raw.thread_id as string
        if (threadId && threadId === selectedThreadIdRef.current) {
          const m: InternalMessage = {
            id: raw.id as string,
            created_at: raw.created_at as string,
            thread_id: threadId,
            sender_id: raw.sender_id as string,
            body: (raw.body as string) ?? "",
            customer_ref: (raw.customer_ref as CustomerRef | null) ?? null,
          }
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          if (m.sender_id !== me) void markThreadRead(sb, me, threadId)
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
      if (ref) setPendingCustomer({ id: ref.customerId, name: ref.name })
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

  if (!me) return null

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
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: theme.primary, color: "#fff" }}>
            {view !== "list" ? (
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
            ) : (
              <img src={messagingIcon} alt="" width={24} height={24} style={{ borderRadius: 6, display: "block" }} />
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
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#f8fafc" }}>
                {messages.length === 0 ? (
                  <div style={{ margin: "auto", color: "#94a3b8", fontSize: 13 }}>No messages yet. Say hello 👋</div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === me
                    const showSender = !mine && selectedThread?.is_group
                    return (
                      <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                        {showSender ? <div style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 2px 4px", fontWeight: 700 }}>{peerName(m.sender_id)}</div> : null}
                        <div style={{ padding: "8px 11px", borderRadius: 12, background: mine ? theme.primary : "#fff", color: mine ? "#fff" : theme.text, border: mine ? "none" : `1px solid ${theme.border}`, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {m.body}
                          {m.customer_ref ? (
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
                    style={{ margin: 8, padding: "7px 9px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13, color: theme.text }}
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
                  style={{ flex: 1, resize: "none", padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13, fontFamily: "inherit", maxHeight: 90, color: theme.text }}
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
                style={{ margin: 10, padding: "9px 11px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, color: theme.text }}
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
              <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                Place a call through your Tradesman business number. Your phone rings first, then connects to the number below.
              </p>
              <input
                type="tel"
                inputMode="tel"
                value={dialNumber}
                onChange={(e) => setDialNumber(e.target.value)}
                placeholder="(555) 123-4567"
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 16, color: theme.text }}
              />
              <button
                type="button"
                onClick={() => void handleDial()}
                disabled={dialing}
                style={{ border: "none", background: "#059669", color: "#fff", borderRadius: 8, padding: "10px 14px", fontWeight: 700, cursor: dialing ? "default" : "pointer", opacity: dialing ? 0.7 : 1 }}
              >
                {dialing ? "Calling…" : "Call"}
              </button>
              {dialMsg ? <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>{dialMsg}</p> : null}
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
