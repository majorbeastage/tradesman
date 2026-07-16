import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import { loadOrganizationPeers, type OrganizationPeer } from "../lib/organizationPeers"
import {
  loadConversation,
  loadUnreadBySender,
  markConversationRead,
  sendInternalMessage,
  type InternalMessage,
} from "../lib/internalMessaging"
import { onOpenMessenger } from "../lib/messengerBus"
import messagingIcon from "../assets/messaging-app-icon.png"

type View = "list" | "chat" | "dial"

const POLL_MS = 20_000

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function MessengerWidget() {
  const { user } = useAuth()
  const me = user?.id ?? null

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>("list")
  const [peers, setPeers] = useState<OrganizationPeer[]>([])
  const [peersLoaded, setPeersLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [dialNumber, setDialNumber] = useState("")
  const [dialing, setDialing] = useState(false)
  const [dialMsg, setDialMsg] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  const refreshUnread = useCallback(async () => {
    if (!me) return
    setUnread(await loadUnreadBySender(supabase, me))
  }, [me])

  // Load org contacts once we have a user.
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

  // Unread poll + initial load.
  useEffect(() => {
    if (!me) return
    void refreshUnread()
    const id = window.setInterval(() => void refreshUnread(), POLL_MS)
    return () => window.clearInterval(id)
  }, [me, refreshUnread])

  // Realtime: incoming messages addressed to me.
  useEffect(() => {
    if (!me || !supabase) return
    const sb = supabase
    const channel = sb
      .channel(`internal-messages-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_messages", filter: `recipient_id=eq.${me}` },
        (payload) => {
          const msg = payload.new as InternalMessage
          if (selectedIdRef.current && msg.sender_id === selectedIdRef.current) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
            void markConversationRead(supabase, me, msg.sender_id)
          } else {
            setUnread((prev) => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] ?? 0) + 1 }))
          }
        },
      )
      .subscribe()
    return () => {
      void sb.removeChannel(channel)
    }
  }, [me])

  // Open from the dashboard tile (optionally focused on a member).
  useEffect(() => {
    return onOpenMessenger((detail) => {
      setOpen(true)
      if (detail.otherUserId) void openConversation(detail.otherUserId)
      else setView("list")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  useEffect(() => {
    if (view === "chat" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, view])

  const openConversation = useCallback(
    async (otherId: string) => {
      setSelectedId(otherId)
      setView("chat")
      const { messages: msgs } = await loadConversation(supabase, me, otherId)
      setMessages(msgs)
      await markConversationRead(supabase, me, otherId)
      setUnread((prev) => {
        const next = { ...prev }
        delete next[otherId]
        return next
      })
    },
    [me],
  )

  async function handleSend() {
    if (!selectedId || !input.trim() || sending) return
    setSending(true)
    const body = input.trim()
    setInput("")
    const res = await sendInternalMessage(supabase, me, selectedId, body)
    setSending(false)
    if (res.ok && res.message) {
      setMessages((prev) => [...prev, res.message as InternalMessage])
    } else {
      setInput(body)
      alert(res.error ?? "Could not send message.")
    }
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
      const { data, error } = await supabase!.functions.invoke("twilio-bridge-call", {
        body: { customer_phone: dialNumber },
      })
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

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0)
  const selectedPeer = peers.find((p) => p.id === selectedId) ?? null

  if (!me) return null

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
            height: "min(72vh, 600px)",
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
                  setSelectedId(null)
                }}
                aria-label="Back"
                style={{ border: "none", background: "transparent", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
              >
                ‹
              </button>
            ) : (
              <img src={messagingIcon} alt="" width={24} height={24} style={{ borderRadius: 6, display: "block" }} />
            )}
            <span style={{ fontWeight: 800, fontSize: 14, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {view === "chat" ? selectedPeer?.displayName ?? "Message" : view === "dial" ? "Dial out" : "Instant messaging"}
            </span>
            {view === "list" ? (
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
                ☎ Dial
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{ border: "none", background: "transparent", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          {view === "list" ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!peersLoaded ? (
                <div style={{ padding: 20, color: "#94a3b8", fontSize: 13 }}>Loading team…</div>
              ) : peers.length === 0 ? (
                <div style={{ padding: 20, color: "#94a3b8", fontSize: 13 }}>No other members in your organization yet.</div>
              ) : (
                peers.map((p) => {
                  const count = unread[p.id] ?? 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void openConversation(p.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: `1px solid ${theme.border}`,
                        background: count > 0 ? "#eff6ff" : "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#e2e8f0", color: theme.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                        {initials(p.displayName)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.displayName}
                        </span>
                        {p.role ? <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>{p.role.replace(/_/g, " ")}</span> : null}
                      </span>
                      {count > 0 ? (
                        <span style={{ minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : null}
                    </button>
                  )
                })
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
                    return (
                      <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                        <div
                          style={{
                            padding: "8px 11px",
                            borderRadius: 12,
                            background: mine ? theme.primary : "#fff",
                            color: mine ? "#fff" : theme.text,
                            border: mine ? "none" : `1px solid ${theme.border}`,
                            fontSize: 13,
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {m.body}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${theme.border}` }}>
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
                  disabled={sending || !input.trim()}
                  style={{ border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "0 14px", fontWeight: 700, cursor: sending || !input.trim() ? "default" : "pointer", opacity: sending || !input.trim() ? 0.6 : 1 }}
                >
                  Send
                </button>
              </div>
            </>
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
        style={{
          position: "relative",
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "none",
          padding: 0,
          background: "#fff",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(15,23,42,0.28)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={messagingIcon} alt="" width={48} height={48} style={{ display: "block", objectFit: "cover" }} />
        {totalUnread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              borderRadius: 10,
              background: "#dc2626",
              color: "#fff",
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
            }}
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        ) : null}
      </button>
    </div>
  )
}
