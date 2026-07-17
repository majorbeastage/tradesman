import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabaseClient"
import {
  createGroupThread,
  findOrCreateDirectThread,
  loadOrgPeers,
  loadPeerNames,
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

type Peer = { id: string; name: string }
type View = "list" | "new" | "group" | "dial"

export default function MessengerScreen({ me }: { me: string }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [input, setInput] = useState("")
  const [view, setView] = useState<View>("list")

  // Customer reference (attach a clickable customer card — never messages the customer)
  const [pendingCustomer, setPendingCustomer] = useState<CustomerRef | null>(null)
  const [custPickerOpen, setCustPickerOpen] = useState(false)
  const [custQuery, setCustQuery] = useState("")
  const [custResults, setCustResults] = useState<MessengerCustomer[]>([])

  // Group creation
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set())
  const [groupTitle, setGroupTitle] = useState("")

  // Dial out
  const [dialNumber, setDialNumber] = useState("")
  const [dialing, setDialing] = useState(false)
  const [dialMsg, setDialMsg] = useState<string | null>(null)

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

  // Debounced customer search when the picker is open
  useEffect(() => {
    if (!custPickerOpen) return
    const h = window.setTimeout(() => {
      void searchMessengerCustomers(supabase, me, custQuery).then(setCustResults)
    }, 200)
    return () => window.clearTimeout(h)
  }, [custPickerOpen, custQuery, me])

  const openThread = useCallback(
    async (threadId: string) => {
      setSelected(threadId)
      setView("list")
      setMessages(await loadThreadMessages(supabase, threadId))
      await markThreadRead(supabase, me, threadId)
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    },
    [me],
  )

  async function startChat(peer: Peer) {
    const threadId = await findOrCreateDirectThread(supabase, me, peer.id)
    if (threadId) {
      await refresh()
      await openThread(threadId)
    }
  }

  async function handleCreateGroup() {
    if (groupSel.size === 0) return
    const threadId = await createGroupThread(supabase, me, [...groupSel], groupTitle)
    if (threadId) {
      setGroupSel(new Set())
      setGroupTitle("")
      await refresh()
      await openThread(threadId)
    }
  }

  async function send() {
    if (!selected) return
    if (!input.trim() && !pendingCustomer) return
    const body = input.trim()
    const ref = pendingCustomer
    setInput("")
    setPendingCustomer(null)
    const msg = await sendThreadMessage(supabase, me, selected, body, ref)
    if (msg) {
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]))
      void refresh()
    } else {
      setInput(body)
      setPendingCustomer(ref)
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
      const { data, error } = await supabase.functions.invoke("twilio-bridge-call", { body: { customer_phone: dialNumber } })
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

  const peerName = useCallback((id: string) => (id === me ? "You" : names.get(id) ?? "Member"), [names, me])

  function threadTitle(t: ThreadSummary): string {
    if (t.is_group) return t.title?.trim() || "Group chat"
    const other = t.members.find((id) => id !== me)
    return other ? peerName(other) : "Direct message"
  }

  const selectedThread = useMemo(() => threads.find((t) => t.id === selected) ?? null, [threads, selected])

  // ── Chat view ────────────────────────────────────────────────────────────
  if (selected && selectedThread) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={headerBar}>
          <button onClick={() => setSelected(null)} style={backBtn}>‹</button>
          <strong style={{ fontSize: 16 }}>{threadTitle(selectedThread)}</strong>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((m) => {
            const mine = m.sender_id === me
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                {!mine && selectedThread.is_group ? (
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, margin: "0 0 2px 4px" }}>{peerName(m.sender_id)}</div>
                ) : null}
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
                  }}
                >
                  {m.customer_ref ? (
                    <div
                      style={{
                        display: "inline-block",
                        marginBottom: m.body ? 6 : 0,
                        padding: "4px 8px",
                        borderRadius: 8,
                        background: mine ? "rgba(255,255,255,0.2)" : "#eef2ff",
                        color: mine ? "#fff" : "#3730a3",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      👤 {m.customer_ref.name}
                    </div>
                  ) : null}
                  {m.body ? <div>{m.body}</div> : null}
                </div>
              </div>
            )
          })}
        </div>
        {pendingCustomer ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderTop: "1px solid var(--border)", background: "#eef2ff" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>👤 {pendingCustomer.name}</span>
            <button onClick={() => setPendingCustomer(null)} style={{ border: "none", background: "transparent", color: "#475569", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)", background: "#fff", alignItems: "center" }}>
          <button
            onClick={() => {
              setCustPickerOpen(true)
              setCustQuery("")
            }}
            title="Reference a customer"
            style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--text)", borderRadius: 20, width: 40, height: 40, fontSize: 18, cursor: "pointer" }}
          >
            👤
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message…"
            style={{ flex: 1, padding: "11px 12px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 15, color: "var(--text)" }}
          />
          <button onClick={() => void send()} style={{ border: "none", background: "var(--orange)", color: "#fff", borderRadius: 20, padding: "0 18px", fontWeight: 700, cursor: "pointer", height: 40 }}>
            Send
          </button>
        </div>

        {custPickerOpen ? (
          <div style={overlay}>
            <div style={sheet}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <strong style={{ fontSize: 15 }}>Reference a customer</strong>
                <button onClick={() => setCustPickerOpen(false)} style={{ marginLeft: "auto", border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#475569" }}>×</button>
              </div>
              <input value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="Search customers…" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 15, color: "var(--text)" }} />
              <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
                {custResults.length === 0 ? (
                  <div style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>No customers found.</div>
                ) : (
                  custResults.map((c) => (
                    <button
                      key={c.id}
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

  // ── New group view ───────────────────────────────────────────────────────
  if (view === "group") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={headerBar}>
          <button onClick={() => setView("list")} style={backBtn}>‹</button>
          <strong style={{ fontSize: 16 }}>New group</strong>
        </div>
        <div style={{ padding: 12 }}>
          <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group name (optional)" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 15, color: "var(--text)" }} />
        </div>
        <div style={sectionLabel}>Members</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {peers.map((p) => {
            const on = groupSel.has(p.id)
            return (
              <button
                key={p.id}
                onClick={() =>
                  setGroupSel((prev) => {
                    const next = new Set(prev)
                    if (next.has(p.id)) next.delete(p.id)
                    else next.add(p.id)
                    return next
                  })
                }
                style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 10, background: on ? "#eff6ff" : "#fff" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? "var(--orange)" : "#cbd5e1"}`, background: on ? "var(--orange)" : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{on ? "✓" : ""}</span>
                {p.name}
              </button>
            )
          })}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", background: "#fff" }}>
          <button onClick={() => void handleCreateGroup()} disabled={groupSel.size === 0} style={{ width: "100%", border: "none", background: groupSel.size ? "var(--orange)" : "#cbd5e1", color: "#fff", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 15, cursor: groupSel.size ? "pointer" : "default" }}>
            Create group ({groupSel.size})
          </button>
        </div>
      </div>
    )
  }

  // ── Dial out view ──────────────────────────────────────────────────────────
  if (view === "dial") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={headerBar}>
          <button onClick={() => setView("list")} style={backBtn}>‹</button>
          <strong style={{ fontSize: 16 }}>Dial out</strong>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Places a call through your Tradesman business number. Your phone rings first, then connects to the number you enter.</p>
          <input type="tel" inputMode="tel" value={dialNumber} onChange={(e) => setDialNumber(e.target.value)} placeholder="(555) 123-4567" style={{ padding: "12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 17, color: "var(--text)" }} />
          <button onClick={() => void handleDial()} disabled={dialing} style={{ border: "none", background: "#059669", color: "#fff", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 15, cursor: dialing ? "default" : "pointer", opacity: dialing ? 0.7 : 1 }}>
            {dialing ? "Calling…" : "Call"}
          </button>
          {dialMsg ? <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>{dialMsg}</p> : null}
        </div>
      </div>
    )
  }

  // ── New chat (start direct) view ──────────────────────────────────────────
  if (view === "new") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={headerBar}>
          <button onClick={() => setView("list")} style={backBtn}>‹</button>
          <strong style={{ fontSize: 16 }}>New chat</strong>
        </div>
        <div style={{ display: "flex", gap: 8, padding: 12 }}>
          <button onClick={() => setView("group")} style={pillBtn}>＋ Group</button>
          <button onClick={() => setView("dial")} style={pillBtn}>📞 Dial out</button>
        </div>
        <div style={sectionLabel}>Start a chat</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {peers.length === 0 ? (
            <div style={{ padding: 16, color: "var(--muted)" }}>No teammates found in your organization yet.</div>
          ) : (
            peers.map((p) => (
              <button key={p.id} onClick={() => void startChat(p)} style={rowStyle}>
                {p.name}
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── Conversation list (default) ───────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ ...headerBar, justifyContent: "space-between" }}>
        <strong style={{ fontSize: 18 }}>Messages</strong>
        <button onClick={() => setView("new")} style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer" }}>＋ New</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {threads.length === 0 ? (
          <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>No conversations yet. Tap ＋ New to start.</div>
        ) : (
          threads.map((t) => (
            <button key={t.id} onClick={() => void openThread(t.id)} style={{ ...rowStyle, background: t.unread > 0 ? "#eff6ff" : "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
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

const headerBar: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--orange)", color: "#fff" }
const backBtn: CSSProperties = { border: "none", background: "transparent", color: "#fff", fontSize: 22, cursor: "pointer" }
const badge: CSSProperties = { minWidth: 22, height: 22, borderRadius: 11, background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }

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

const pillBtn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "#fff",
  color: "var(--text)",
  borderRadius: 20,
  padding: "8px 14px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}

const sectionLabel: CSSProperties = {
  padding: "10px 16px 4px",
  fontSize: 11,
  fontWeight: 800,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }
const sheet: CSSProperties = { width: "100%", background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "70vh", boxSizing: "border-box" }
