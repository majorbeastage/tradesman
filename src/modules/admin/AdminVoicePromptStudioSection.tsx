import { useEffect, useMemo, useState } from "react"
import { theme } from "../../styles/theme"
import {
  voiceStudioAdminRequest,
  type VoicePrompt,
  type VoicePromptRecording,
  type VoiceStudioAccess,
  type VoiceStudioSnapshot,
} from "../../lib/voicePromptStudio"

type PromptDraft = {
  id: string
  title: string
  category: string
  scriptText: string
  usageNotes: string
  scope: "platform" | "client_custom"
  sortOrder: number
  active: boolean
}

const emptyDraft: PromptDraft = {
  id: "",
  title: "",
  category: "auto_attendant",
  scriptText: "",
  usageNotes: "",
  scope: "platform",
  sortOrder: 100,
  active: true,
}

export default function AdminVoicePromptStudioSection() {
  const [snapshot, setSnapshot] = useState<VoiceStudioSnapshot>({ prompts: [], accesses: [], recordings: [] })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [newLabel, setNewLabel] = useState("Voice talent")
  const [newPin, setNewPin] = useState("")
  const [resetPins, setResetPins] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft)
  const [showPromptForm, setShowPromptForm] = useState(false)

  async function load() {
    setLoading(true)
    setError("")
    try {
      const payload = await voiceStudioAdminRequest("admin-list")
      setSnapshot(payload as unknown as VoiceStudioSnapshot)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Voice Studio.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const recordingsByPrompt = useMemo(() => {
    const map = new Map<string, VoicePromptRecording[]>()
    for (const recording of snapshot.recordings) {
      const rows = map.get(recording.prompt_id) ?? []
      rows.push(recording)
      map.set(recording.prompt_id, rows)
    }
    return map
  }, [snapshot.recordings])

  async function run(key: string, action: string, body: Record<string, unknown>, message: string) {
    setWorking(key)
    setError("")
    setSuccess("")
    try {
      await voiceStudioAdminRequest(action, body)
      setSuccess(message)
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice Studio update failed.")
      return false
    } finally {
      setWorking("")
    }
  }

  async function createAccess() {
    const digits = newPin.replace(/\D/g, "")
    if (digits.length < 4) {
      setError("Choose a 4–12 digit PIN.")
      return
    }
    setWorking("create-access")
    setError("")
    setSuccess("")
    try {
      const payload = await voiceStudioAdminRequest("admin-create-access", { label: newLabel, pin: digits })
      const access = payload.access as VoiceStudioAccess
      const link = `${window.location.origin}/voice-studio/${access.public_token}`
      setSuccess(`Link created. Share ${link} and PIN ${digits} separately.`)
      setNewPin("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create access.")
    } finally {
      setWorking("")
    }
  }

  async function copyLink(access: VoiceStudioAccess) {
    const link = `${window.location.origin}/voice-studio/${access.public_token}`
    try {
      await navigator.clipboard.writeText(link)
      setSuccess("Share link copied. Send the PIN separately.")
    } catch {
      setSuccess(link)
    }
  }

  function editPrompt(prompt: VoicePrompt) {
    setDraft({
      id: prompt.id,
      title: prompt.title,
      category: prompt.category,
      scriptText: prompt.script_text,
      usageNotes: prompt.usage_notes,
      scope: prompt.scope,
      sortOrder: prompt.sort_order,
      active: prompt.active,
    })
    setShowPromptForm(true)
    window.setTimeout(() => document.getElementById("voice-prompt-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0)
  }

  async function savePrompt() {
    const ok = await run(
      "save-prompt",
      "admin-save-prompt",
      {
        id: draft.id || undefined,
        title: draft.title,
        category: draft.category,
        scriptText: draft.scriptText,
        usageNotes: draft.usageNotes,
        scope: draft.scope,
        sortOrder: draft.sortOrder,
        active: draft.active,
      },
      draft.id ? "Prompt updated." : "Prompt added to the recording link.",
    )
    if (ok) {
      setDraft(emptyDraft)
      setShowPromptForm(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 1050 }}>
      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: theme.text }}>Voice Prompt Studio</h1>
            <p style={{ margin: "7px 0 0", color: "#64748b", lineHeight: 1.5, maxWidth: 740 }}>
              Manage the scripts, secure recording links, submitted takes, and approved platform voice library. The external page is mobile-first and does not require a Tradesman account.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} style={secondaryButtonStyle}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontSize: 13, lineHeight: 1.5 }}>
          Security: links use an unguessable token plus a salted PIN. Five wrong attempts lock a link for 15 minutes. Resetting the PIN signs out every open recording session.
        </div>
        {error ? <p style={errorStyle}>{error}</p> : null}
        {success ? <p style={successStyle}>{success}</p> : null}
      </section>

      <section style={panelStyle}>
        <h2 style={headingStyle}>Create a shareable recording link</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={labelStyle}>
            Recorder name / label
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            New PIN (4–12 digits)
            <input
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
              inputMode="numeric"
              placeholder="Example: 4827"
              style={inputStyle}
            />
          </label>
          <button type="button" disabled={working === "create-access"} onClick={() => void createAccess()} style={primaryButtonStyle}>
            {working === "create-access" ? "Creating…" : "Create link"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
          {(snapshot.accesses ?? []).map((access) => {
            const resetPin = resetPins[access.id] ?? ""
            return (
              <div key={access.id} style={rowStyle}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <strong style={{ color: theme.text }}>{access.label}</strong>
                  <div style={{ marginTop: 3, color: "#64748b", fontSize: 12, overflowWrap: "anywhere" }}>
                    {window.location.origin}/voice-studio/{access.public_token}
                  </div>
                  <div style={{ marginTop: 3, color: "#64748b", fontSize: 11 }}>
                    {access.active ? "Active" : "Revoked"} · Last used {access.last_used_at ? new Date(access.last_used_at).toLocaleString() : "never"}
                  </div>
                </div>
                <button type="button" onClick={() => void copyLink(access)} style={secondaryButtonStyle}>Copy link</button>
                <input
                  aria-label={`New PIN for ${access.label}`}
                  value={resetPin}
                  onChange={(event) => setResetPins((current) => ({ ...current, [access.id]: event.target.value.replace(/\D/g, "").slice(0, 12) }))}
                  inputMode="numeric"
                  placeholder="New PIN"
                  style={{ ...inputStyle, width: 105 }}
                />
                <button
                  type="button"
                  disabled={resetPin.length < 4 || working === `pin-${access.id}`}
                  onClick={async () => {
                    const ok = await run(`pin-${access.id}`, "admin-reset-pin", { accessId: access.id, pin: resetPin }, "PIN reset. All prior recording sessions were signed out.")
                    if (ok) setResetPins((current) => ({ ...current, [access.id]: "" }))
                  }}
                  style={secondaryButtonStyle}
                >
                  Reset PIN
                </button>
                <button
                  type="button"
                  onClick={() => void run(`active-${access.id}`, "admin-set-access-active", { accessId: access.id, active: !access.active }, access.active ? "Link revoked." : "Link reactivated.")}
                  style={{ ...secondaryButtonStyle, color: access.active ? "#b91c1c" : "#166534" }}
                >
                  {access.active ? "Revoke" : "Reactivate"}
                </button>
              </div>
            )
          })}
          {!loading && !(snapshot.accesses ?? []).length ? <p style={{ color: "#64748b", margin: 0 }}>No external links yet.</p> : null}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={headingStyle}>Prompt library</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
              {snapshot.prompts.filter((prompt) => prompt.active).length} active scripts · approved recordings become the active platform take.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft)
              setShowPromptForm((value) => !value)
            }}
            style={primaryButtonStyle}
          >
            {showPromptForm ? "Close editor" : "Add prompt"}
          </button>
        </div>

        {showPromptForm ? (
          <div id="voice-prompt-editor" style={{ marginTop: 14, padding: 14, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.background }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <label style={labelStyle}>Title<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} style={inputStyle} /></label>
              <label style={labelStyle}>Category<input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} style={inputStyle} /></label>
              <label style={labelStyle}>Order<input type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} style={inputStyle} /></label>
            </div>
            <label style={{ ...labelStyle, marginTop: 10 }}>
              Exact script
              <textarea rows={4} value={draft.scriptText} onChange={(event) => setDraft((current) => ({ ...current, scriptText: event.target.value }))} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </label>
            <label style={{ ...labelStyle, marginTop: 10 }}>Voice / usage notes<input value={draft.usageNotes} onChange={(event) => setDraft((current) => ({ ...current, usageNotes: event.target.value }))} style={inputStyle} /></label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
              <label style={{ color: theme.text, fontSize: 13 }}><input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /> Show on recording link</label>
              <select value={draft.scope} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as PromptDraft["scope"] }))} style={inputStyle}>
                <option value="platform">Platform template</option>
                <option value="client_custom">Client-custom placeholder</option>
              </select>
              <button type="button" disabled={working === "save-prompt"} onClick={() => void savePrompt()} style={primaryButtonStyle}>
                {working === "save-prompt" ? "Saving…" : draft.id ? "Save changes" : "Add to studio"}
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {snapshot.prompts.map((prompt) => {
            const recordings = recordingsByPrompt.get(prompt.id) ?? []
            const latest = recordings[0]
            const activeTake = recordings.find((recording) => recording.id === prompt.active_recording_id)
            return (
              <article key={prompt.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ color: theme.text }}>{prompt.title}</strong>
                    <span style={tagStyle}>{prompt.category.replace(/_/g, " ")}</span>
                    {!prompt.active ? <span style={{ ...tagStyle, background: "#fee2e2", color: "#991b1b" }}>Hidden</span> : null}
                    {activeTake ? <span style={{ ...tagStyle, background: "#dcfce7", color: "#166534" }}>Approved take v{activeTake.version}</span> : null}
                  </div>
                  <p style={{ margin: "7px 0 0", color: theme.text, lineHeight: 1.45 }}>{prompt.script_text}</p>
                  {prompt.usage_notes ? <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{prompt.usage_notes}</p> : null}
                  {latest?.signed_url ? (
                    <div style={{ marginTop: 9, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                      <audio controls src={latest.signed_url} style={{ height: 34, maxWidth: "100%" }} />
                      <span style={{ fontSize: 11, color: "#64748b" }}>Latest v{latest.version} · {latest.status}</span>
                      {latest.status === "submitted" ? (
                        <>
                          <button type="button" onClick={() => void run(`approve-${latest.id}`, "admin-review-recording", { recordingId: latest.id, status: "approved" }, `${prompt.title} approved as the active platform take.`)} style={{ ...secondaryButtonStyle, color: "#166534" }}>Approve</button>
                          <button type="button" onClick={() => void run(`reject-${latest.id}`, "admin-review-recording", { recordingId: latest.id, status: "rejected" }, "Recording rejected; the recorder can submit a replacement.")} style={{ ...secondaryButtonStyle, color: "#b91c1c" }}>Reject</button>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <p style={{ margin: "7px 0 0", color: "#64748b", fontSize: 12 }}>Awaiting recording</p>
                  )}
                </div>
                <button type="button" onClick={() => editPrompt(prompt)} style={secondaryButtonStyle}>Edit script</button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const panelStyle = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  background: "#fff",
  padding: 18,
  boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
} as const
const headingStyle = { margin: 0, fontSize: 19, color: theme.text } as const
const rowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 9,
  alignItems: "center",
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
} as const
const labelStyle = { display: "grid", gap: 5, color: "#64748b", fontSize: 12, fontWeight: 700 } as const
const inputStyle = {
  boxSizing: "border-box",
  minWidth: 0,
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontSize: 13,
} as const
const primaryButtonStyle = { padding: "9px 13px", borderRadius: 8, border: "none", background: "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer" } as const
const secondaryButtonStyle = { padding: "8px 11px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", color: theme.text, fontWeight: 700, cursor: "pointer" } as const
const tagStyle = { padding: "3px 6px", borderRadius: 999, background: "#e2e8f0", color: "#334155", fontSize: 10, fontWeight: 800, textTransform: "uppercase" } as const
const errorStyle = { margin: "11px 0 0", padding: 10, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 13 } as const
const successStyle = { margin: "11px 0 0", padding: 10, borderRadius: 8, background: "#ecfdf5", color: "#166534", fontSize: 13, overflowWrap: "anywhere" } as const
