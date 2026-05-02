import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"

type Props = {
  customerId: string | null
  customerName?: string
  onClose: () => void
}

type PastNote = { id: string; text: string; saved_at: string }

function newPastNoteId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

function parseNotesPast(raw: unknown): PastNote[] {
  if (!Array.isArray(raw)) return []
  const out: PastNote[] = []
  raw.forEach((x, i) => {
    if (!x || typeof x !== "object") return
    const o = x as Record<string, unknown>
    if (typeof o.text !== "string") return
    const saved_at = typeof o.saved_at === "string" ? o.saved_at : new Date().toISOString()
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `legacy-${saved_at}-${i}`
    out.push({ id, text: o.text, saved_at })
  })
  return out
}

function sortPastDesc(notes: PastNote[]): PastNote[] {
  return [...notes].sort((a, b) => b.saved_at.localeCompare(a.saved_at))
}

export default function CustomerNotesPanel({ customerId, customerName, onClose }: Props) {
  const [composer, setComposer] = useState("")
  const [notesList, setNotesList] = useState<PastNote[]>([])
  const [legacyNotesField, setLegacyNotesField] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [noteReadingOpen, setNoteReadingOpen] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [mutatingId, setMutatingId] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!customerId || !client) return
    setLoading(true)
    setLastError(null)
    setComposer("")
    setEditingId(null)
    setEditDraft("")
    setNoteReadingOpen({})

    client
      .from("customers")
      .select("notes, notes_past")
      .eq("id", customerId)
      .single()
      .then(({ data, error }) => {
        setLoading(false)
        if (error && (error.message?.includes("notes_past") || error.message?.includes("column"))) {
          client
            .from("customers")
            .select("notes")
            .eq("id", customerId)
            .single()
            .then(({ data: d2, error: e2 }) => {
              if (e2 || !d2) {
                setLastError(e2?.message ?? error.message)
                setNotesList([])
                setLegacyNotesField(null)
                return
              }
              const leg = typeof d2.notes === "string" && d2.notes.trim() ? d2.notes.trim() : null
              setLegacyNotesField(leg)
              setNotesList([])
            })
          return
        }
        if (error || !data) {
          setLastError(error?.message ?? "Could not load notes")
          setNotesList([])
          setLegacyNotesField(null)
          return
        }
        const past = sortPastDesc(parseNotesPast(data.notes_past))
        const leg = typeof data.notes === "string" && data.notes.trim() ? data.notes.trim() : null
        setNotesList(past)
        setLegacyNotesField(past.length === 0 && leg ? leg : null)
      })
  }, [customerId])

  async function persistNotesPast(next: PastNote[]): Promise<string | null> {
    if (!customerId || !supabase) return "Not signed in."
    const { error: updErr } = await supabase.from("customers").update({ notes_past: next }).eq("id", customerId)
    if (updErr) {
      if (updErr.message.includes("notes_past") || updErr.message.includes("column")) {
        return "Add column notes_past (run supabase-customers-notes-past.sql in Supabase)."
      }
      return updErr.message
    }
    setNotesList(sortPastDesc(next))
    return null
  }

  async function saveNewNote() {
    if (!customerId || !supabase) return
    const trimmed = composer.trim()
    if (!trimmed) return
    setSaving(true)
    setLastError(null)
    const entry: PastNote = { id: newPastNoteId(), text: trimmed, saved_at: new Date().toISOString() }
    const next = [entry, ...notesList]
    const err = await persistNotesPast(next)
    if (err) setLastError(err)
    else setComposer("")
    setSaving(false)
  }

  async function importLegacyToTimeline() {
    if (!customerId || !supabase || !legacyNotesField?.trim()) return
    setSaving(true)
    setLastError(null)
    const entry: PastNote = { id: newPastNoteId(), text: legacyNotesField.trim(), saved_at: new Date().toISOString() }
    const next = [entry, ...notesList]
    const err = await persistNotesPast(next)
    if (!err) {
      await supabase.from("customers").update({ notes: null }).eq("id", customerId)
      setLegacyNotesField(null)
    } else setLastError(err)
    setSaving(false)
  }

  async function removeNote(id: string) {
    if (!customerId || !supabase) return
    setMutatingId(id)
    setLastError(null)
    const next = notesList.filter((n) => n.id !== id)
    const err = await persistNotesPast(next)
    if (err) setLastError(err)
    setMutatingId(null)
    if (editingId === id) {
      setEditingId(null)
      setEditDraft("")
    }
    setNoteReadingOpen((o) => {
      const n = { ...o }
      delete n[id]
      return n
    })
  }

  async function saveEditedNote(id: string) {
    if (!customerId || !supabase) return
    const trimmed = editDraft.trim()
    if (!trimmed) {
      setLastError("Note cannot be empty — remove it instead.")
      return
    }
    setMutatingId(id)
    setLastError(null)
    const next = notesList.map((n) => (n.id === id ? { ...n, text: trimmed } : n))
    const err = await persistNotesPast(next)
    setMutatingId(null)
    if (err) {
      setLastError(err)
      return
    }
    setEditingId(null)
    setEditDraft("")
  }

  function openNoteEditor(note: PastNote) {
    setNoteReadingOpen((o) => ({ ...o, [note.id]: true }))
    setEditingId(note.id)
    setEditDraft(note.text)
  }

  function closeNoteEditor(id: string) {
    setNoteReadingOpen((o) => ({ ...o, [id]: false }))
    setEditingId((eid) => (eid === id ? null : eid))
    setEditDraft("")
  }

  if (customerId == null) return null

  const metaOpen = (id: string) => noteReadingOpen[id] === true

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "400px",
        maxWidth: "100%",
        height: "100%",
        background: "white",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        padding: "20px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>
          Notes {customerName ? `— ${customerName}` : ""}
        </h3>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>
          ✕
        </button>
      </div>

      {loading ? (
        <p style={{ color: theme.text }}>Loading…</p>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
            Type a note and save — it appears below with a timestamp. Open a note to edit and save, or remove it.
          </p>
          {lastError ? <p style={{ margin: "0 0 10px", fontSize: 12, color: "#b91c1c" }}>{lastError}</p> : null}

          {legacyNotesField ? (
            <div
              style={{
                marginBottom: 14,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #fcd34d",
                background: "#fffbeb",
                fontSize: 13,
                color: "#92400e",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Older notes (main field)</div>
              <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{legacyNotesField}</div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void importLegacyToTimeline()}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                  fontSize: 12,
                }}
              >
                Move into timeline
              </button>
            </div>
          ) : null}

          <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>New note</label>
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Write a note…"
            rows={4}
            style={{ width: "100%", padding: 10, border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, resize: "vertical", boxSizing: "border-box" }}
          />
          <button
            type="button"
            disabled={saving || !composer.trim()}
            onClick={() => void saveNewNote()}
            style={{
              marginTop: 8,
              alignSelf: "flex-start",
              padding: "8px 14px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <div style={{ flex: 1, minHeight: 0, marginTop: 18, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 8 }}>History</div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, flex: 1, overflow: "auto", background: "#f9fafb" }}>
              {notesList.length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>No saved notes yet.</p>
              ) : (
                notesList.map((note, i) => (
                  <div
                    key={note.id}
                    style={{
                      marginBottom: i < notesList.length - 1 ? 12 : 0,
                      paddingBottom: i < notesList.length - 1 ? 12 : 0,
                      borderBottom: i < notesList.length - 1 ? `1px solid ${theme.border}` : undefined,
                      fontSize: 13,
                      color: theme.text,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{new Date(note.saved_at).toLocaleString()}</div>
                    {!metaOpen(note.id) ? (
                      <>
                        <div style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>{note.text.length > 160 ? `${note.text.slice(0, 160)}…` : note.text}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => openNoteEditor(note)}
                            style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}
                          >
                            Read notes
                          </button>
                          <button
                            type="button"
                            disabled={mutatingId === note.id}
                            onClick={() => void removeNote(note.id)}
                            style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <textarea
                          value={editingId === note.id ? editDraft : note.text}
                          onChange={(e) => {
                            setEditingId(note.id)
                            setEditDraft(e.target.value)
                          }}
                          rows={5}
                          style={{
                            width: "100%",
                            padding: 8,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 6,
                            resize: "vertical",
                            boxSizing: "border-box",
                            marginBottom: 8,
                          }}
                        />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button
                            type="button"
                            disabled={mutatingId === note.id}
                            onClick={() => void saveEditedNote(note.id)}
                            style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "none", background: theme.primary, color: "#fff", cursor: "pointer", fontWeight: 600 }}
                          >
                            {mutatingId === note.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => closeNoteEditor(note.id)}
                            style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}
                          >
                            Done
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
