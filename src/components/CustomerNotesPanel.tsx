import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"

type Props = {
  customerId: string | null
  customerName?: string
  onClose: () => void
}

type PastNote = { text: string; saved_at: string }

function parseNotesPast(raw: unknown): PastNote[] {
  if (!Array.isArray(raw)) return []
  const out: PastNote[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    if (typeof o.text !== "string") continue
    const saved_at = typeof o.saved_at === "string" ? o.saved_at : new Date().toISOString()
    out.push({ text: o.text, saved_at })
  }
  return out
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
  const [selectedPastIndex, setSelectedPastIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!customerId || !supabase) return
    const client = supabase
    setLoading(true)
    setSaveStatus("idle")
    setPastStatus("idle")
    setLastError(null)
    setSelectedPastIndex(null)

    const applyRow = (data: { notes?: string | null; notes_past?: unknown }) => {
      setCurrentNotes(data.notes ?? "")
      const past = parseNotesPast(data.notes_past)
      past.sort((a, b) => b.saved_at.localeCompare(a.saved_at))
      setPreviousNotes(past)
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

  async function saveCurrentNotes() {
    if (!customerId || !supabase) return
    setSaving(true)
    setSaveStatus("idle")
    setLastError(null)
    const { data, error } = await supabase
      .from("customers")
      .update({ notes: currentNotes.trim() ? currentNotes : null })
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
    const entry: PastNote = { text: trimmed, saved_at: new Date().toISOString() }

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

    const { data: row, error: fetchErr } = await supabase.from("customers").select("notes_past").eq("id", customerId).single()
    if (fetchErr) {
      console.error("notes_past fetch:", fetchErr)
      setSavingPast(false)
      setPastStatus("error")
      setLastError(
        fetchErr.message.includes("notes_past") || fetchErr.message.includes("column")
          ? "Add column notes_past (run supabase-customers-notes-past.sql in Supabase)."
          : fetchErr.message
      )
      return
    }
    const prev = parseNotesPast(row?.notes_past)
    const next = [...prev, entry]
    const { error: updErr } = await supabase.from("customers").update({ notes_past: next }).eq("id", customerId)
    setSavingPast(false)
    if (updErr) {
      setPastStatus("error")
      setLastError(updErr.message)
      return
    }
    const sorted = [...next].sort((a, b) => b.saved_at.localeCompare(a.saved_at))
    setPreviousNotes(sorted)
    setPastStatus("saved")
    setTimeout(() => setPastStatus("idle"), 2500)
  }

  function loadPastIntoEditor(note: PastNote, index: number) {
    setCurrentNotes(note.text)
    setSelectedPastIndex(index)
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
                <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>No past notes yet. Use Save to past notes to store a dated copy.</p>
              ) : (
                previousNotes.map((note, i) => (
                  <div
                    key={`${note.saved_at}-${i}`}
                    style={{
                      marginBottom: "12px",
                      fontSize: "13px",
                      color: theme.text,
                      borderBottom: i < previousNotes.length - 1 ? `1px solid ${theme.border}` : undefined,
                      paddingBottom: 8,
                      background: selectedPastIndex === i ? "rgba(249,115,22,0.08)" : undefined,
                      borderRadius: 6,
                      padding: selectedPastIndex === i ? 8 : 0,
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>{new Date(note.saved_at).toLocaleString()}</div>
                    <div style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>{note.text}</div>
                    <button
                      type="button"
                      onClick={() => loadPastIntoEditor(note, i)}
                      style={{ padding: "4px 10px", fontSize: "12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
                    >
                      Load into editor
                    </button>
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
