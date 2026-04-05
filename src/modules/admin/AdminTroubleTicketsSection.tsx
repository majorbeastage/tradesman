import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"

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
  call_from_phone: string | null
  preferred_contact: string | null
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

export default function AdminTroubleTicketsSection() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState("")

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
        "id, ticket_number, type, name, business_name, phone, email, title, message, transcription, recording_url, call_from_phone, preferred_contact, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(400)
    setLoading(false)
    if (err) {
      setError(err.message)
      setTickets([])
      return
    }
    setTickets((data as TicketRow[]) ?? [])
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

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

  const selected = tickets.find((t) => t.id === selectedId) ?? null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AdminSettingBlock id="admin:trouble_tickets:intro">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Trouble tickets</h1>
        <p style={{ color: theme.text, opacity: 0.85, margin: 0, lineHeight: 1.55, fontSize: 14 }}>
          Tickets from the <strong>Tech Support</strong> tab (user / office manager portals), <strong>Request a demo</strong> on the home page, and the help desk line when a menu key is set to{" "}
          <strong>Trouble ticket</strong> (e.g. option 2) with Twilio <code style={{ fontSize: 11 }}>transcribe=&quot;true&quot;</code> on the recording. Run{" "}
          <code style={{ fontSize: 11 }}>supabase/support-tickets-trouble-system.sql</code> if this list fails to load. Email alerts use{" "}
          <code style={{ fontSize: 11 }}>HELP_DESK_TICKET_EMAIL_USER_ID</code> (or <code style={{ fontSize: 11 }}>HELP_DESK_LOG_USER_ID</code>) and{" "}
          <code style={{ fontSize: 11 }}>HELP_DESK_TICKET_NOTIFY_EMAIL</code> (default <code style={{ fontSize: 11 }}>helpdesk@tradesman-us.com</code>).
        </p>
        <button
          type="button"
          onClick={() => void loadTickets()}
          disabled={loading}
          style={{
            marginTop: 12,
            padding: "8px 14px",
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: "white",
            color: theme.text,
            cursor: loading ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Refreshing…" : "Refresh list"}
        </button>
      </AdminSettingBlock>

      {error && (
        <AdminSettingBlock id="admin:trouble_tickets:error">
          <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
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
          <h2 style={{ margin: "0 0 12px", fontSize: 16, color: theme.text }}>All tickets</h2>
          {loading ? (
            <p style={{ color: theme.text, opacity: 0.8 }}>Loading…</p>
          ) : tickets.length === 0 ? (
            <p style={{ color: theme.text, opacity: 0.8 }}>No tickets yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "70vh", overflow: "auto" }}>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${selectedId === t.id ? theme.primary : theme.border}`,
                    background: selectedId === t.id ? "rgba(249,115,22,0.08)" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, color: theme.text, fontSize: 14 }}>{t.ticket_number}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{TYPE_LABEL[t.type] ?? t.type}</div>
                  <div style={{ fontSize: 13, color: theme.text, marginTop: 6, lineHeight: 1.4 }}>
                    {t.title || t.message || "(No title)"}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>{formatWhen(t.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </AdminSettingBlock>

        <AdminSettingBlock id="admin:trouble_tickets:detail">
          {!selected ? (
            <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>Select a ticket to view details and notes.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 8px", fontSize: 18, color: theme.text }}>{selected.ticket_number}</h2>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                  {TYPE_LABEL[selected.type] ?? selected.type} · {formatWhen(selected.created_at)}
                </p>
              </div>
              <div style={{ display: "grid", gap: 8, fontSize: 14, color: theme.text }}>
                <div>
                  <strong>Title / summary</strong>
                  <div style={{ opacity: 0.95 }}>{selected.title || "—"}</div>
                </div>
                <div>
                  <strong>Name</strong>
                  <div>{selected.name || "—"}</div>
                </div>
                <div>
                  <strong>Business</strong>
                  <div>{selected.business_name || "—"}</div>
                </div>
                <div>
                  <strong>Phone</strong>
                  <div>{selected.phone || selected.call_from_phone || "—"}</div>
                </div>
                <div>
                  <strong>Email</strong>
                  <div>{selected.email?.trim() ? selected.email : "—"}</div>
                </div>
                {selected.preferred_contact && (
                  <div>
                    <strong>Preferred contact</strong>
                    <div>{selected.preferred_contact}</div>
                  </div>
                )}
                <div>
                  <strong>Original message</strong>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{selected.message || "—"}</div>
                </div>
                {selected.transcription && (
                  <div>
                    <strong>Phone transcript</strong>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{selected.transcription}</div>
                  </div>
                )}
                {selected.recording_url && (
                  <div>
                    <strong>Recording</strong>
                    <div>
                      <a href={selected.recording_url} target="_blank" rel="noreferrer" style={{ color: theme.primary }}>
                        Open recording
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 15, color: theme.text }}>Notes</h3>
                {noteError && <p style={{ color: "#b91c1c", fontSize: 13 }}>{noteError}</p>}
                {notesLoading ? (
                  <p style={{ color: theme.text, opacity: 0.7 }}>Loading notes…</p>
                ) : notes.length === 0 ? (
                  <p style={{ color: theme.text, opacity: 0.7 }}>No notes yet.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        style={{
                          padding: "10px 12px",
                          background: "#f9fafb",
                          borderRadius: 8,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                          {formatWhen(n.created_at)}
                          {n.author_label ? ` · ${n.author_label}` : ""}
                        </div>
                        <div style={{ fontSize: 14, color: theme.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>Add note</span>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                    placeholder="Internal note or reply summary…"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      fontSize: 14,
                      resize: "vertical",
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
