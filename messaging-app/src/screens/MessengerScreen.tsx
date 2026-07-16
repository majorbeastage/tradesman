import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabaseClient"
import {
  findOrCreateDirectThread,
  loadOrgPeers,
  loadPeerNames,
  loadThreadMessages,
  loadThreadsWithMeta,
  markThreadRead,
  sendThreadMessage,
  type InternalMessage,
  type ThreadSummary,
} from "../lib/internalMessaging"

type Peer = { id: string; name: string }

export default function MessengerScreen({ me }: { me: string }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [input, setInput] = useState("")
  const [showTeam, setShowTeam] = useState(false)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    const list = await loadThreadsWithMeta(supabase, me)
    setThreads(list)
    const ids = list.flatMap((t) => t.members)
    setNames(await loadPeerNames(supabase, ids))
  }, [me])

  useEffect(() => {
    void refresh()
    void loadOrgPeers(supabase, me).then(setPeers)
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
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [me, refresh])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const openThread = useCallback(
    async (threadId: string) => {
      setSelected(threadId)
      setMessages(await loadThreadMessages(supabase, threadId))
      await markThreadRead(supabase, me, threadId)
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    },
    [me],
  )

  async function startChat(peer: Peer) {
    setShowTeam(false)
    const threadId = await findOrCreateDirectThread(supabase, me, peer.id)
    if (threadId) {
      await refresh()
      await openThread(threadId)
    }
  }

  async function send() {
    if (!selected || !input.trim()) return
    const body = input.trim()
    setInput("")
    const msg = await sendThreadMessage(supabase, me, selected, body)
    if (msg) {
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]))
      void refresh()
    } else {
      setInput(body)
    }
  }

  const peerName = useCallback((id: string) => (id === me ? "You" : names.get(id) ?? "Member"), [names, me])

  function threadTitle(t: ThreadSummary): string {
    if (t.is_group) return t.title?.trim() || "Group chat"
    const other = t.members.find((id) => id !== me)
    return other ? peerName(other) : "Direct message"
  }

  const selectedThread = useMemo(() => threads.find((t) => t.id === selected) ?? null, [threads, selected])

  if (selected && selectedThread) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--orange)", color: "#fff" }}>
          <button onClick={() => setSelected(null)} style={{ border: "none", background: "transparent", color: "#fff", fontSize: 22, cursor: "pointer" }}>‹</button>
          <strong style={{ fontSize: 16 }}>{threadTitle(selectedThread)}</strong>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((m) => {
            const mine = m.sender_id === me
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                {!mine && selectedThread.is_group ? <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, margin: "0 0 2px 4px" }}>{peerName(m.sender_id)}</div> : null}
                <div style={{ padding: "9px 12px", borderRadius: 14, background: mine ? "var(--orange)" : "#fff", color: mine ? "#fff" : "var(--text)", border: mine ? "none" : "1px solid var(--border)", fontSize: 15, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {m.customer_ref ? `👤 ${m.customer_ref.name}\n` : ""}
                  {m.body}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)", background: "#fff" }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message…" style={{ flex: 1, padding: "11px 12px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 15, color: "var(--text)" }} />
          <button onClick={() => void send()} style={{ border: "none", background: "var(--orange)", color: "#fff", borderRadius: 20, padding: "0 18px", fontWeight: 700, cursor: "pointer" }}>Send</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--orange)", color: "#fff" }}>
        <strong style={{ fontSize: 18 }}>Messages</strong>
        <button onClick={() => setShowTeam((v) => !v)} style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer" }}>＋ New</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {showTeam ? (
          <div>
            <div style={sectionLabel}>Start a chat</div>
            {peers.length === 0 ? <div style={{ padding: 16, color: "var(--muted)" }}>No teammates found.</div> : peers.map((p) => (
              <button key={p.id} onClick={() => void startChat(p)} style={rowStyle}>{p.name}</button>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>No conversations yet. Tap ＋ New to start.</div>
        ) : (
          threads.map((t) => (
            <button key={t.id} onClick={() => void openThread(t.id)} style={{ ...rowStyle, background: t.unread > 0 ? "#eff6ff" : "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700 }}>{threadTitle(t)}</span>
                {t.lastMessage ? <span style={{ display: "block", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.lastMessage.customer_ref ? `👤 ${t.lastMessage.customer_ref.name}` : t.lastMessage.body}</span> : null}
              </span>
              {t.unread > 0 ? <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{t.unread}</span> : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
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

const sectionLabel: CSSProperties = {
  padding: "10px 16px 4px",
  fontSize: 11,
  fontWeight: 800,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
}
