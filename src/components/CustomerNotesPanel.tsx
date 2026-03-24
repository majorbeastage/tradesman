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
  const [archiving, setArchiving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")
  const [archiveStatus, setArchiveStatus] = useState<"idle" | "saved" | "error">("idle")

  useEffect(() => {
    if (!customerId || !supabase) return
    setLoading(true)
    setSaveStatus("idle")
    setArchiveStatus("idle")
    supabase
      .from("customers")
      .select("notes, notes_past")
      .eq("id", customerId)
      .single()
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          console.error("Customer notes load error:", error)
          setCurrentNotes("")
          setPreviousNotes([])
          return
        }
        if (data) {
          setCurrentNotes(data.notes ?? "")
          const past = parseNotesPast(data.notes_past)
          past.sort((a, b) => b.saved_at.localeCompare(a.saved_at))
          setPreviousNotes(past)
        }
      })
  }, [customerId])

  async function saveNotes() {
    if (!customerId || !supabase) return
    setSaving(true)
    setSaveStatus("idle")
    const { data, error } = await supabase
      .from("customers")
      .update({ notes: currentNotes || null })
      .eq("id", customerId)
      .select("notes")
      .single()
    setSaving(false)
    if (error) {
      console.error("Notes save error:", error)
      setSaveStatus("error")
      return
    }
    setSaveStatus("saved")
    if (data?.notes !== undefined) setCurrentNotes(data.notes ?? "")
    setTimeout(() => setSaveStatus("idle"), 2000)
  }

  async function saveSnapshotToPastNotes() {
    if (!customerId || !supabase) return
    const trimmed = currentNotes.trim()
    if (!trimmed) {
      setArchiveStatus("error")
      setTimeout(() => setArchiveStatus("idle"), 2500)
      return
    }
    setArchiving(true)
    setArchiveStatus("idle")
    const entry: PastNote = { text: trimmed, saved_at: new Date().toISOString() }
    const { data: row, error: fetchErr } = await supabase.from("customers").select("notes_past").eq("id", customerId).single()
    if (fetchErr) {
      console.error("notes_past fetch error:", fetchErr)
      setArchiving(false)
      setArchiveStatus("error")
      return
    }
    const prev = parseNotesPast(row?.notes_past)
    const next = [...prev, entry]
    const { error: updErr } = await supabase.from("customers").update({ notes_past: next }).eq("id", customerId)
    setArchiving(false)
    if (updErr) {
      console.error("notes_past update error:", updErr)
      setArchiveStatus("error")
      return
    }
    const sorted = [...next].sort((a, b) => b.saved_at.localeCompare(a.saved_at))
    setPreviousNotes(sorted)
    setArchiveStatus("saved")
    setTimeout(() => setArchiveStatus("idle"), 2000)
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
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
      </div>

      {loading ? (
        <p style={{ color: theme.text }}>Loading...</p>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#6b7280", lineHeight: 1.45 }}>
            Notes are stored on the customer and are the same in Leads, Conversations, Quotes, and Customers until you change them. Use <strong>Save snapshot to past notes</strong> to append a dated copy to history (optional).
          </p>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "8px" }}>Current notes</label>
            <textarea
              value={currentNotes}
              onChange={(e) => setCurrentNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add notes about this customer..."
              rows={6}
              style={{ width: "100%", padding: "10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text, resize: "vertical" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px", alignItems: "center" }}>
              <button
                onClick={saveNotes}
                disabled={saving}
                style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
              >
                {saving ? "Saving..." : "Save notes"}
              </button>
              <button
                type="button"
                onClick={() => void saveSnapshotToPastNotes()}
                disabled={archiving}
                style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", fontSize: "14px", color: theme.text }}
              >
                {archiving ? "Saving…" : "Save snapshot to past notes"}
              </button>
              {saveStatus === "saved" && <span style={{ color: "#059669", fontSize: "14px" }}>Saved</span>}
              {saveStatus === "error" && (
                <span style={{ color: "#b91c1c", fontSize: "13px" }}>Could not save notes (check RLS).</span>
              )}
              {archiveStatus === "saved" && <span style={{ color: "#059669", fontSize: "14px" }}>Snapshot saved</span>}
              {archiveStatus === "error" && (
                <span style={{ color: "#b91c1c", fontSize: "13px" }}>
                  Could not save past notes. Run <code style={{ fontSize: "11px" }}>supabase-customers-notes-past.sql</code> in Supabase if the column is missing.
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "8px" }}>Past notes</label>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "12px", minHeight: "120px", maxHeight: "240px", overflow: "auto", background: "#f9fafb" }}>
              {previousNotes.length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>No past notes yet.</p>
              ) : (
                previousNotes.map((note, i) => (
                  <div key={`${note.saved_at}-${i}`} style={{ marginBottom: "12px", fontSize: "13px", color: theme.text, borderBottom: i < previousNotes.length - 1 ? `1px solid ${theme.border}` : undefined, paddingBottom: 8 }}>
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>{new Date(note.saved_at).toLocaleString()}</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{note.text}</div>
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
