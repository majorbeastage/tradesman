import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"

type Props = {
  customerId: string | null
  customerName?: string
  onClose: () => void
}

export default function CustomerNotesPanel({ customerId, customerName, onClose }: Props) {
  const [currentNotes, setCurrentNotes] = useState("")
  const [previousNotes, setPreviousNotes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")

  useEffect(() => {
    if (!customerId || !supabase) return
    setLoading(true)
    setSaveStatus("idle")
    supabase
      .from("customers")
      .select("notes")
      .eq("id", customerId)
      .single()
      .then(({ data, error }) => {
        setLoading(false)
        if (!error && data) setCurrentNotes(data.notes ?? "")
      })
    // Previous notes: placeholder until we have a notes history table
    setPreviousNotes([])
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
        padding: "20px"
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
            <button
              onClick={saveNotes}
              disabled={saving}
              style={{ marginTop: "8px", padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
            >
              {saving ? "Saving..." : "Save notes"}
            </button>
            {saveStatus === "saved" && <span style={{ marginLeft: "8px", color: "#059669", fontSize: "14px" }}>Saved</span>}
            {saveStatus === "error" && (
              <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: "13px" }}>
                Could not save. If you use Supabase RLS, add an UPDATE policy on <code>customers</code> for your user.
              </p>
            )}
          </div>

          <div>
            <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "8px" }}>Previous notes</label>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "12px", minHeight: "80px", background: "#f9fafb" }}>
              {previousNotes.length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>No previous notes.</p>
              ) : (
                previousNotes.map((note, i) => (
                  <div key={i} style={{ marginBottom: "8px", fontSize: "14px", color: theme.text }}>{note}</div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
