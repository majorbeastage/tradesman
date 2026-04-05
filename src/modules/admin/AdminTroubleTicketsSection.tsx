import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { hintForSupportTicketsError } from "../../lib/supabaseTicketErrors"

type TicketRow = {
  id: string
  ticket_number: string
  type: string
  name: string | null
  business_name: string | null
  phone: string | null
  email: string | null
  title: string | null
  message: string | null
  transcription: string | null
  recording_url: string | null
  recording_sid: string | null
  call_from_phone: string | null
  preferred_contact: string | null
  priority: string | null
  status: string | null
  created_at: string
}

type NoteRow = {
  id: string
  ticket_id: string
  body: string
  author_label: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  web: "Web support",
  tech: "Tech support",
  demo: "Request a demo",
  phone: "Help desk phone",
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function ticketSearchText(t: TicketRow): string {
  return [
    t.ticket_number,
    t.type,
    t.title,
    t.message,
    t.name,
    t.phone,
    t.email,
    t.business_name,
    t.call_from_phone,
    t.transcription,
    t.id,
    t.priority,
    t.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

/** Twilio console URLs and RecordingUrl often contain …/Recordings/RE… */
function extractRecordingSidFromUrl(url: string): string | null {
  const m = /Recordings\/(RE[0-9a-f]{32})/i.exec(url)
  return m ? m[1] : null
}

function isTwilioRecordingHost(url: string): boolean {
  return /api\.twilio\.com/i.test(url)
}

/** High-contrast text on light cards (avoids inheriting dark-on-dark from portal CSS). */
const ink = "#111827"
const inkMuted = "#4b5563"
const inkSoft = "#6b7280"
const cardBg = "#ffffff"
const noteSurface = "#f3f4f6"

const searchInputStyle: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  padding: "10px 12px",
  marginTop: 4,
  marginBottom: 8,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  color: ink,
  background: cardBg,
}

function TicketRecordingBlock({
  recordingSid,
  recordingUrl,
  accessToken,
}: {
  recordingSid: string | null | undefined
  recordingUrl: string | null | undefined
  accessToken: string | undefined
}) {
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState("")
  const [loading, setLoading] = useState(false)

  const sid = (recordingSid?.trim() || extractRecordingSidFromUrl(recordingUrl?.trim() || "") || "").trim()
  const directPublic =
    recordingUrl &&
    recordingUrl.trim().startsWith("http") &&
    !isTwilioRecordingHost(recordingUrl)

  useEffect(() => {
    if (directPublic) {
      setAudioSrc(null)
      setLoadErr("")
      setLoading(false)
      return
    }
    if (!sid || !accessToken) {
      setAudioSrc(null)
      setLoadErr(!sid ? "" : "Sign in again to load this recording.")
      setLoading(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setLoadErr("")
    setAudioSrc(null)

    ;(async () => {
      try {
        const res = await fetch(`/api/twilio-recording?recordingSid=${encodeURIComponent(sid)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const ct = res.headers.get("content-type") || ""
        if (!res.ok) {
          const text = await res.text()
          let msg = text
          try {
            const j = JSON.parse(text) as { error?: string; hint?: string; message?: string }
            msg = [j.error, j.message, j.hint].filter(Boolean).join("\n") || text
          } catch {
            /* keep */
          }
          if (!cancelled) setLoadErr(msg || `HTTP ${res.status}`)
          return
        }
        if (ct.includes("application/json")) {
          const text = await res.text()
          let msg = text
          try {
            const j = JSON.parse(text) as { error?: string }
            msg = j.error || text
          } catch {
            /* keep */
          }
          throw new Error(msg)
        }
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setAudioSrc(objectUrl)
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [sid, accessToken, directPublic, recordingUrl])

  if (directPublic && recordingUrl) {
    return (
      <div style={{ marginTop: 6 }}>
        <audio controls src={recordingUrl.trim()} style={{ width: "100%", maxWidth: 400 }} />
        <div style={{ marginTop: 8 }}>
          <a href={recordingUrl.trim()} target="_blank" rel="noreferrer" style={{ color: "#c2410c", fontWeight: 600 }}>
            Open file in new tab
          </a>
        </div>
      </div>
    )
  }

  if (!sid) {
    return recordingUrl ? (
      <p style={{ color: inkMuted, fontSize: 13, margin: 0 }}>
        Recording link is present but no Twilio recording SID was found. Use a stored public URL or ensure{" "}
        <code style={{ fontSize: 11 }}>recording_sid</code> is saved on the ticket.
      </p>
    ) : null
  }

  return (
    <div style={{ marginTop: 6 }}>
      {loading && <p style={{ color: inkSoft, fontSize: 13, margin: "0 0 8px" }}>Loading recording…</p>}
      {loadErr && (
        <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px", whiteSpace: "pre-line", lineHeight: 1.45 }}>{loadErr}</p>
      )}
      {audioSrc && <audio controls src={audioSrc} style={{ width: "100%", maxWidth: 400 }} />}
      <p style={{ color: inkSoft, fontSize: 11, margin: "8px 0 0", lineHeight: 1.4 }}>
        Played through your admin session (Twilio credentials stay on the server).
      </p>
    </div>
  )
}

export default function AdminTroubleTicketsSection() {
  const { user, session } = useAuth()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState("")
  const [ticketListOpen, setTicketListOpen] = useState(true)
  const [ticketTableSearch, setTicketTableSearch] = useState("")
  const [ticketFieldSaving, setTicketFieldSaving] = useState(false)

  const loadTickets = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.")
      setLoading(false)
      return
    }
    setError("")
    setLoading(true)
    const { data, error: err } = await supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, type, name, business_name, phone, email, title, message, transcription, recording_url, recording_sid, call_from_phone, preferred_contact, priority, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(400)
    setLoading(false)
    if (err) {
      setError(hintForSupportTicketsError(err.message))
      setTickets([])
      return
    }
    const rows = (data as TicketRow[]) ?? []
    setTickets(
      rows.map((t) => ({
        ...t,
        priority: t.priority === "high" ? "high" : "normal",
        status: ["resolved", "cancelled"].includes(String(t.status)) ? String(t.status) : "open",
      })),
    )
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  const filteredTickets = useMemo(() => {
    const q = ticketTableSearch.trim().toLowerCase()
    if (!q) return tickets
    return tickets.filter((t) => ticketSearchText(t).includes(q))
  }, [tickets, ticketTableSearch])

  const loadNotes = useCallback(async (ticketId: string) => {
    if (!supabase) return
    setNotesLoading(true)
    setNoteError("")
    const { data, error: err } = await supabase
      .from("support_ticket_notes")
      .select("id, ticket_id, body, author_label, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
    setNotesLoading(false)
    if (err) {
      setNoteError(err.message)
      setNotes([])
      return
    }
    setNotes((data as NoteRow[]) ?? [])
  }, [])

  useEffect(() => {
    if (selectedId) void loadNotes(selectedId)
    else setNotes([])
  }, [selectedId, loadNotes])

  async function submitNote() {
    if (!supabase || !selectedId || !newNote.trim()) return
    setSavingNote(true)
    setNoteError("")
    const { error: err } = await supabase.from("support_ticket_notes").insert({
      ticket_id: selectedId,
      body: newNote.trim(),
      author_label: user?.email ?? "admin",
    })
    setSavingNote(false)
    if (err) {
      setNoteError(err.message)
      return
    }
    setNewNote("")
    void loadNotes(selectedId)
  }

  async function patchTicket(id: string, patch: { priority?: string; status?: string }) {
    if (!supabase) return
    setTicketFieldSaving(true)
    const { error: err } = await supabase.from("support_tickets").update(patch).eq("id", id)
    setTicketFieldSaving(false)
    if (err) {
      alert(err.message + (err.message.includes("policy") || err.message.includes("permission") ? "\n\nRun supabase/support-tickets-priority-status-admin-update.sql in Supabase (admin UPDATE policy + columns)." : ""))
      return
    }
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const selected = tickets.find((t) => t.id === selectedId) ?? null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, color: ink }}>
      <AdminSettingBlock id="admin:trouble_tickets:intro">
        <h1 style={{ color: ink, margin: "0 0 8px", fontSize: 22 }}>Trouble tickets</h1>
        <p style={{ color: inkMuted, margin: 0, lineHeight: 1.55, fontSize: 14 }}>
          From <strong style={{ color: ink }}>Tech Support</strong>, <strong style={{ color: ink }}>Request a demo</strong>, and the help desk <strong style={{ color: ink }}>Trouble ticket</strong> menu action.{" "}
          <strong style={{ color: ink }}>First-time setup:</strong> run{" "}
          <code style={{ fontSize: 11, color: ink, background: noteSurface, padding: "2px 6px", borderRadius: 4 }}>supabase/support-tickets-setup-complete.sql</code> in Supabase SQL Editor. For{" "}
          <strong style={{ color: ink }}>priority, status, admin updates, and recording playback</strong>, also run{" "}
          <code style={{ fontSize: 11, color: ink, background: noteSurface, padding: "2px 6px", borderRadius: 4 }}>supabase/support-tickets-priority-status-admin-update.sql</code>. Email alerts:{" "}
          <code style={{ fontSize: 11, color: ink, background: noteSurface, padding: "2px 6px", borderRadius: 4 }}>HELP_DESK_TICKET_EMAIL_USER_ID</code>,{" "}
          <code style={{ fontSize: 11, color: ink, background: noteSurface, padding: "2px 6px", borderRadius: 4 }}>HELP_DESK_TICKET_NOTIFY_EMAIL</code>.
        </p>
        <button
          type="button"
          onClick={() => void loadTickets()}
          disabled={loading}
          style={{
            marginTop: 12,
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: cardBg,
            color: ink,
            cursor: loading ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Refreshing…" : "Refresh list"}
        </button>
      </AdminSettingBlock>

      {error && (
        <AdminSettingBlock id="admin:trouble_tickets:error">
          <p style={{ color: "#b91c1c", margin: 0, whiteSpace: "pre-line", lineHeight: 1.5 }}>{error}</p>
        </AdminSettingBlock>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        <AdminSettingBlock id="admin:trouble_tickets:list">
          <button
            type="button"
            onClick={() => setTicketListOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: 0,
              margin: "0 0 4px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, color: ink }}>All tickets</h2>
            <span style={{ fontSize: 14, color: inkMuted, fontWeight: 600 }} aria-hidden>
              {ticketListOpen ? "Hide list ▾" : "Show list ▸"}
            </span>
          </button>
          {ticketListOpen && (
            <>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: ink, marginBottom: 0 }}>
                Search tickets
                <input
                  type="search"
                  value={ticketTableSearch}
                  onChange={(e) => setTicketTableSearch(e.target.value)}
                  placeholder="Ticket #, name, phone, email, title…"
                  style={searchInputStyle}
                  autoComplete="off"
                />
              </label>
              {tickets.length > 0 && (
                <p style={{ fontSize: 12, color: inkSoft, margin: "0 0 10px" }}>
                  Showing {filteredTickets.length} of {tickets.length}
                  {ticketTableSearch.trim() ? ` matching “${ticketTableSearch.trim()}”` : ""}
                </p>
              )}
              {loading ? (
                <p style={{ color: inkSoft }}>Loading…</p>
              ) : tickets.length === 0 ? (
                <p style={{ color: inkSoft }}>No tickets yet.</p>
              ) : filteredTickets.length === 0 ? (
                <p style={{ color: inkSoft }}>No tickets match your search. Clear the search to see all.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "70vh", overflow: "auto" }}>
                  {filteredTickets.map((t) => {
                    const pri = t.priority === "high" ? "high" : "normal"
                    const st = t.status === "resolved" || t.status === "cancelled" ? t.status : "open"
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        title="Open ticket details"
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `1px solid ${selectedId === t.id ? theme.primary : "#d1d5db"}`,
                          background: selectedId === t.id ? "rgba(249,115,22,0.12)" : cardBg,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontWeight: 700, color: ink, fontSize: 14 }}>{t.ticket_number}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {pri === "high" && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 0.5,
                                color: "#991b1b",
                                background: "#fecaca",
                                padding: "2px 6px",
                                borderRadius: 4,
                              }}
                            >
                              HIGH
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: st === "open" ? "#1d4ed8" : st === "resolved" ? "#15803d" : inkMuted,
                              background: st === "open" ? "#dbeafe" : st === "resolved" ? "#dcfce7" : "#f3f4f6",
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {st}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </AdminSettingBlock>

        <AdminSettingBlock id="admin:trouble_tickets:detail">
          {!selected ? (
            <p style={{ color: inkMuted, margin: 0 }}>Select a ticket to view details, recording, and notes.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, color: ink }}>
              <div>
                <h2 style={{ margin: "0 0 8px", fontSize: 18, color: ink }}>{selected.ticket_number}</h2>
                <p style={{ margin: 0, fontSize: 13, color: inkMuted }}>
                  {TYPE_LABEL[selected.type] ?? selected.type} · {formatWhen(selected.created_at)}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  padding: 12,
                  background: noteSurface,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: ink }}>
                  Priority
                  <select
                    value={selected.priority === "high" ? "high" : "normal"}
                    disabled={ticketFieldSaving}
                    onChange={(e) => void patchTicket(selected.id, { priority: e.target.value })}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 14,
                      color: ink,
                      background: cardBg,
                      minWidth: 140,
                    }}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: ink }}>
                  Status
                  <select
                    value={["open", "resolved", "cancelled"].includes(String(selected.status)) ? String(selected.status) : "open"}
                    disabled={ticketFieldSaving}
                    onChange={(e) => void patchTicket(selected.id, { status: e.target.value })}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 14,
                      color: ink,
                      background: cardBg,
                      minWidth: 160,
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gap: 10, fontSize: 14, color: ink }}>
                <div>
                  <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Title / summary</strong>
                  <div style={{ color: ink, lineHeight: 1.5 }}>{selected.title || "—"}</div>
                </div>
                <div>
                  <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Name</strong>
                  <div style={{ color: ink }}>{selected.name || "—"}</div>
                </div>
                <div>
                  <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Business</strong>
                  <div style={{ color: ink }}>{selected.business_name || "—"}</div>
                </div>
                <div>
                  <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Phone</strong>
                  <div style={{ color: ink }}>{selected.phone || selected.call_from_phone || "—"}</div>
                </div>
                <div>
                  <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Email</strong>
                  <div style={{ color: ink }}>{selected.email?.trim() ? selected.email : "—"}</div>
                </div>
                {selected.preferred_contact && (
                  <div>
                    <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Preferred contact</strong>
                    <div style={{ color: ink }}>{selected.preferred_contact}</div>
                  </div>
                )}
                <div>
                  <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Original message</strong>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: ink }}>{selected.message || "—"}</div>
                </div>
                {selected.transcription && (
                  <div>
                    <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Phone transcript</strong>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: ink }}>{selected.transcription}</div>
                  </div>
                )}
                {(selected.recording_url || selected.recording_sid) && (
                  <div>
                    <strong style={{ color: ink, display: "block", marginBottom: 4 }}>Recording</strong>
                    <TicketRecordingBlock
                      recordingSid={selected.recording_sid}
                      recordingUrl={selected.recording_url}
                      accessToken={session?.access_token}
                    />
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 15, color: ink }}>Notes</h3>
                {noteError && <p style={{ color: "#b91c1c", fontSize: 13, whiteSpace: "pre-line" }}>{hintForSupportTicketsError(noteError)}</p>}
                {notesLoading ? (
                  <p style={{ color: inkSoft }}>Loading notes…</p>
                ) : notes.length === 0 ? (
                  <p style={{ color: inkSoft }}>No notes yet.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        style={{
                          padding: "10px 12px",
                          background: noteSurface,
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ fontSize: 11, color: inkMuted, marginBottom: 6 }}>
                          {formatWhen(n.created_at)}
                          {n.author_label ? ` · ${n.author_label}` : ""}
                        </div>
                        <div style={{ fontSize: 14, color: ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: ink }}>Add note</span>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                    placeholder="Internal note or reply summary…"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 14,
                      resize: "vertical",
                      color: ink,
                      backgroundColor: cardBg,
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void submitNote()}
                  disabled={savingNote || !newNote.trim()}
                  style={{
                    marginTop: 8,
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: theme.primary,
                    color: "white",
                    fontWeight: 600,
                    cursor: savingNote || !newNote.trim() ? "wait" : "pointer",
                  }}
                >
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </div>
            </div>
          )}
        </AdminSettingBlock>
      </div>
    </div>
  )
}
