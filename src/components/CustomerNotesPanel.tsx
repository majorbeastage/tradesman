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
  const [currentNotes, setCurrentNotes] = useState("")
  const [previousNotes, setPreviousNotes] = useState<PastNote[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPast, setSavingPast] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")
  const [pastStatus, setPastStatus] = useState<"idle" | "saved" | "error">("idle")
  const [lastError, setLastError] = useState<string | null>(null)
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null)
  const [editingPastId, setEditingPastId] = useState<string | null>(null)
  const [editPastDraft, setEditPastDraft] = useState("")
  const [pastMutatingId, setPastMutatingId] = useState<string | null>(null)

  useEffect(() => {
    if (!customerId || !supabase) return
    const client = supabase
    setLoading(true)
    setSaveStatus("idle")
    setPastStatus("idle")
    setLastError(null)
    setSelectedPastId(null)
    setEditingPastId(null)
    setEditPastDraft("")

    const applyRow = (data: { notes?: string | null; notes_past?: unknown }) => {
      setCurrentNotes(data.notes ?? "")
      setPreviousNotes(sortPastDesc(parseNotesPast(data.notes_past)))
    }

    client
      .from("customers")
      .select("notes, notes_past")
      .eq("id", customerId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setLoading(false)
          applyRow(data)
          return
        }
        if (error && (error.message?.includes("notes_past") || error.message?.includes("column"))) {
          client
            .from("customers")
            .select("notes")
            .eq("id", customerId)
            .single()
            .then(({ data: d2, error: e2 }) => {
              setLoading(false)
              if (e2 || !d2) {
                console.error("Customer notes load error:", error, e2)
                setLastError((e2 ?? error)?.message ?? "Could not load notes")
                setCurrentNotes("")
                setPreviousNotes([])
                return
              }
              applyRow({ notes: d2.notes, notes_past: [] })
            })
          return
        }
        setLoading(false)
        console.error("Customer notes load error:", error)
        setLastError(error?.message ?? "Could not load notes")
        setCurrentNotes("")
        setPreviousNotes([])
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
    setPreviousNotes(sortPastDesc(next))
    return null
  }

  /** Append a snapshot to notes_past (after current notes are saved). */
  async function appendPastSnapshot(text: string): Promise<string | null> {
    const trimmed = text.trim()
    if (!trimmed || !customerId || !supabase) return null
    const { data: row, error: fetchErr } = await supabase.from("customers").select("notes_past").eq("id", customerId).single()
    if (fetchErr) {
      if (fetchErr.message.includes("notes_past") || fetchErr.message.includes("column")) {
        return "Add column notes_past (run supabase-customers-notes-past.sql in Supabase)."
      }
      return fetchErr.message
    }
    const prev = parseNotesPast(row?.notes_past)
    const entry: PastNote = { id: newPastNoteId(), text: trimmed, saved_at: new Date().toISOString() }
    return persistNotesPast([...prev, entry])
  }

  async function saveCurrentNotes() {
    if (!customerId || !supabase) return
    setSaving(true)
    setSaveStatus("idle")
    setLastError(null)
    const trimmed = currentNotes.trim()
    const { data, error } = await supabase
      .from("customers")
      .update({ notes: trimmed ? trimmed : null })
      .eq("id", customerId)
      .select("notes")
      .single()
    setSaving(false)
    if (error) {
      console.error("Notes save error:", error)
      setSaveStatus("error")
      setLastError(error.message)
      return
    }
    setSaveStatus("saved")
    if (data?.notes !== undefined) setCurrentNotes(data.notes ?? "")
    if (trimmed) {
      const pastErr = await appendPastSnapshot(trimmed)
      if (pastErr) {
        setLastError(pastErr)
        setSaveStatus("error")
      }
    }
    setTimeout(() => setSaveStatus("idle"), 2500)
  }

  async function saveToPastNotes() {
    if (!customerId || !supabase) return
    const trimmed = currentNotes.trim()
    if (!trimmed) {
      setPastStatus("error")
      setLastError("Add some text before saving to past notes.")
      setTimeout(() => setPastStatus("idle"), 3000)
      return
    }
    setSavingPast(true)
    setPastStatus("idle")
    setLastError(null)

    const { error: notesErr } = await supabase
      .from("customers")
      .update({ notes: trimmed })
      .eq("id", customerId)
    if (notesErr) {
      console.error("notes update:", notesErr)
      setSavingPast(false)
      setPastStatus("error")
      setLastError(notesErr.message)
      return
    }

    const err = await appendPastSnapshot(trimmed)
    setSavingPast(false)
    if (err) {
      setPastStatus("error")
      setLastError(err)
      return
    }
    setPastStatus("saved")
    setTimeout(() => setPastStatus("idle"), 2500)
  }

  async function removePastNote(id: string) {
    if (!customerId || !supabase) return
    setPastMutatingId(id)
    setLastError(null)
    const next = previousNotes.filter((n) => n.id !== id)
    const err = await persistNotesPast(next)
    setPastMutatingId(null)
    if (err) setLastError(err)
    if (selectedPastId === id) setSelectedPastId(null)
    if (editingPastId === id) {
      setEditingPastId(null)
      setEditPastDraft("")
    }
  }

  async function savePastNoteEdit(id: string) {
    if (!customerId || !supabase) return
    const trimmed = editPastDraft.trim()
    if (!trimmed) {
      setLastError("Past note text cannot be empty. Remove the note instead.")
      return
    }
    setPastMutatingId(id)
    setLastError(null)
    const next = previousNotes.map((n) => (n.id === id ? { ...n, text: trimmed } : n))
    const err = await persistNotesPast(next)
    setPastMutatingId(null)
    if (err) {
      setLastError(err)
      return
    }
    setEditingPastId(null)
    setEditPastDraft("")
  }

  function loadPastIntoEditor(note: PastNote) {
    setCurrentNotes(note.text)
    setSelectedPastId(note.id)
  }

  function startEditPast(note: PastNote) {
    setEditingPastId(note.id)
    setEditPastDraft(note.text)
    setSelectedPastId(note.id)
  }

  if (customerId == null) return null

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>
          Notes {customerName ? `— ${customerName}` : ""}
        </h3>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
      </div>

      {loading ? (
        <p style={{ color: theme.text }}>Loading...</p>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#6b7280", lineHeight: 1.45 }}>
            Notes are saved on this customer and stay with them across Leads, Conversations, Quotes, and Customers until you change or archive them.
            Saving current notes also adds a dated copy under past notes.
          </p>
          {lastError && (
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#b91c1c" }}>{lastError}</p>
          )}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "8px" }}>Current notes</label>
            <textarea
              value={currentNotes}
              onChange={(e) => setCurrentNotes(e.target.value)}
              placeholder="Add notes about this customer..."
              rows={6}
              style={{ width: "100%", padding: "10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text, resize: "vertical" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void saveCurrentNotes()}
                disabled={saving}
                style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => void saveToPastNotes()}
                disabled={savingPast}
                style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", fontSize: "14px", color: theme.text }}
              >
                {savingPast ? "Saving…" : "Save to past notes"}
              </button>
              {saveStatus === "saved" && <span style={{ color: "#059669", fontSize: "14px" }}>Saved</span>}
              {pastStatus === "saved" && <span style={{ color: "#059669", fontSize: "14px" }}>Added to past notes</span>}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "8px" }}>Past notes</label>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "12px", flex: 1, overflow: "auto", background: "#f9fafb" }}>
              {previousNotes.length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>No past notes yet. Use Save (adds a snapshot) or Save to past notes.</p>
              ) : (
                previousNotes.map((note, i) => (
                  <div
                    key={note.id}
                    style={{
                      marginBottom: "12px",
                      fontSize: "13px",
                      color: theme.text,
                      borderBottom: i < previousNotes.length - 1 ? `1px solid ${theme.border}` : undefined,
                      paddingBottom: 8,
                      background: selectedPastId === note.id ? "rgba(249,115,22,0.08)" : undefined,
                      borderRadius: 6,
                      padding: selectedPastId === note.id ? 8 : 0,
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>{new Date(note.saved_at).toLocaleString()}</div>
                    {editingPastId === note.id ? (
                      <textarea
                        value={editPastDraft}
                        onChange={(e) => setEditPastDraft(e.target.value)}
                        rows={4}
                        style={{ width: "100%", padding: "8px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text, resize: "vertical", marginBottom: 8, boxSizing: "border-box" }}
                      />
                    ) : (
                      <div style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>{note.text}</div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                      {editingPastId === note.id ? (
                        <>
                          <button
                            type="button"
                            disabled={pastMutatingId === note.id}
                            onClick={() => void savePastNoteEdit(note.id)}
                            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: 6, border: "none", background: theme.primary, color: "white", cursor: "pointer" }}
                          >
                            {pastMutatingId === note.id ? "Saving…" : "Save edit"}
                          </button>
                          <button
                            type="button"
                            disabled={pastMutatingId === note.id}
                            onClick={() => { setEditingPastId(null); setEditPastDraft("") }}
                            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => loadPastIntoEditor(note)}
                            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
                          >
                            Load into editor
                          </button>
                          <button
                            type="button"
                            disabled={pastMutatingId === note.id}
                            onClick={() => startEditPast(note)}
                            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pastMutatingId === note.id}
                            onClick={() => void removePastNote(note.id)}
                            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", color: "#b91c1c" }}
                          >
                            {pastMutatingId === note.id ? "…" : "Remove"}
                          </button>
                        </>
                      )}
                    </div>
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
