import { useEffect, useMemo, useRef, useState } from "react"
import logo from "../../assets/logo.png"
import {
  voiceStudioExternalRequest,
  type VoicePrompt,
  type VoicePromptRecording,
  type VoiceStudioSnapshot,
} from "../../lib/voicePromptStudio"

type LocalTake = {
  blob: Blob
  url: string
  durationSeconds: number
}

export default function VoicePromptStudioPage({ publicToken }: { publicToken: string }) {
  const sessionKey = `tradesman_voice_studio_session_${publicToken}`
  const [sessionToken, setSessionToken] = useState(() => {
    try {
      return sessionStorage.getItem(sessionKey) || ""
    } catch {
      return ""
    }
  })
  const [pin, setPin] = useState("")
  const [label, setLabel] = useState("")
  const [snapshot, setSnapshot] = useState<VoiceStudioSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [recordingPromptId, setRecordingPromptId] = useState("")
  const [takes, setTakes] = useState<Record<string, LocalTake>>({})
  const [uploadingPromptId, setUploadingPromptId] = useState("")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const load = async (token = sessionToken) => {
    if (!token) return
    setBusy(true)
    setError("")
    try {
      const payload = await voiceStudioExternalRequest("external-list", {}, token)
      setSnapshot(payload as unknown as VoiceStudioSnapshot)
    } catch (err) {
      try {
        sessionStorage.removeItem(sessionKey)
      } catch {
        /* ignore */
      }
      setSessionToken("")
      setSnapshot(null)
      setError(err instanceof Error ? err.message : "Session expired. Enter the PIN again.")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (sessionToken) void load(sessionToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      Object.values(takes).forEach((take) => URL.revokeObjectURL(take.url))
    },
    // Local URLs are also revoked when replaced; unmount cleanup uses the current closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const submittedByPrompt = useMemo(() => {
    const map = new Map<string, VoicePromptRecording>()
    for (const recording of snapshot?.recordings ?? []) {
      if (!map.has(recording.prompt_id)) map.set(recording.prompt_id, recording)
    }
    return map
  }, [snapshot])

  async function unlock() {
    if (pin.replace(/\D/g, "").length < 4) {
      setError("Enter the 4–12 digit PIN provided with this link.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const payload = await voiceStudioExternalRequest("external-auth", { publicToken, pin })
      const token = String(payload.sessionToken ?? "")
      if (!token) throw new Error("Voice Studio did not return a session.")
      setSessionToken(token)
      setLabel(String(payload.label ?? "Voice talent"))
      try {
        sessionStorage.setItem(sessionKey, token)
      } catch {
        /* session still works in memory */
      }
      await load(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock Voice Studio.")
    } finally {
      setBusy(false)
    }
  }

  async function startRecording(promptId: string) {
    setError("")
    if (recorderRef.current?.state === "recording") {
      setError("Stop the current recording before starting another prompt.")
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Open the link in current Chrome, Safari, or Edge and allow microphone access.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      const startedAt = Date.now()
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        const previous = takes[promptId]
        if (previous) URL.revokeObjectURL(previous.url)
        setTakes((current) => ({
          ...current,
          [promptId]: {
            blob,
            url: URL.createObjectURL(blob),
            durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          },
        }))
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setRecordingPromptId("")
      }
      setRecordingPromptId(promptId)
      recorder.start(250)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access was not granted.")
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }

  async function submitTake(prompt: VoicePrompt) {
    const take = takes[prompt.id]
    if (!take || !sessionToken) return
    setUploadingPromptId(prompt.id)
    setError("")
    try {
      const response = await fetch(`/api/voice-studio-upload?promptId=${encodeURIComponent(prompt.id)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": take.blob.type.split(";")[0] || "audio/webm",
          "X-Recording-Duration": String(take.durationSeconds),
        },
        body: take.blob,
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Upload failed (${response.status}).`)
      URL.revokeObjectURL(take.url)
      setTakes((current) => {
        const next = { ...current }
        delete next[prompt.id]
        return next
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this recording.")
    } finally {
      setUploadingPromptId("")
    }
  }

  if (!sessionToken || !snapshot) {
    return (
      <main style={pageStyle}>
        <section style={unlockCardStyle}>
          <img src={logo} alt="Tradesman Systems" style={{ width: 150, height: 58, objectFit: "contain", margin: "0 auto 10px" }} />
          <div style={{ textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 25, color: "#0f172a" }}>Voice Prompt Studio</h1>
            <p style={{ margin: "8px 0 20px", color: "#64748b", lineHeight: 1.5 }}>
              Record consistent human voice prompts for Tradesman Systems.
            </p>
          </div>
          <label style={labelStyle}>
            Access PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter PIN"
              style={inputStyle}
              onKeyDown={(event) => {
                if (event.key === "Enter") void unlock()
              }}
            />
          </label>
          <button type="button" onClick={() => void unlock()} disabled={busy} style={primaryButtonStyle}>
            {busy ? "Opening…" : "Open recording studio"}
          </button>
          {error ? <p style={errorStyle}>{error}</p> : null}
          <p style={{ margin: "16px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
            This private link and PIN are supplied by Tradesman Systems. Microphone permission is requested only when you press Record.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <header style={{ maxWidth: 760, width: "100%", margin: "0 auto 14px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <img src={logo} alt="" style={{ width: 110, height: 42, objectFit: "contain" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Voice Prompt Studio</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748b" }}>{label || "Recording session"}</p>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontSize: 13, lineHeight: 1.5 }}>
          Read each script naturally in a quiet room. Keep the phone about 6–8 inches away. Listen back before submitting; you can re-record as often as needed.
        </div>
        {error ? <p style={errorStyle}>{error}</p> : null}
      </header>

      <section style={{ maxWidth: 760, width: "100%", margin: "0 auto", display: "grid", gap: 12 }}>
        {snapshot.prompts.map((prompt, index) => {
          const take = takes[prompt.id]
          const submitted = submittedByPrompt.get(prompt.id)
          const recording = recordingPromptId === prompt.id
          return (
            <article key={prompt.id} style={promptCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontSize: 11, color: "#f97316", fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {index + 1} · {prompt.category.replace(/_/g, " ")}
                  </span>
                  <h2 style={{ margin: "3px 0 0", fontSize: 17, color: "#0f172a" }}>{prompt.title}</h2>
                </div>
                {submitted ? (
                  <span style={{ padding: "4px 7px", borderRadius: 999, background: submitted.status === "approved" ? "#dcfce7" : "#fef3c7", color: submitted.status === "approved" ? "#166534" : "#92400e", fontSize: 10, fontWeight: 800 }}>
                    {submitted.status === "approved" ? "Approved" : "Submitted"}
                  </span>
                ) : null}
              </div>
              <div style={{ marginTop: 10, padding: 13, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 16, lineHeight: 1.65 }}>
                {prompt.script_text}
              </div>
              {prompt.usage_notes ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>{prompt.usage_notes}</p> : null}

              {take && !recording ? (
                <div style={{ marginTop: 12, display: "grid", gap: 9 }}>
                  <audio controls src={take.url} style={{ width: "100%" }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button type="button" onClick={() => void startRecording(prompt.id)} style={secondaryButtonStyle}>
                      Re-record
                    </button>
                    <button type="button" disabled={uploadingPromptId === prompt.id} onClick={() => void submitTake(prompt)} style={primaryButtonStyle}>
                      {uploadingPromptId === prompt.id ? "Submitting…" : "Submit this take"}
                    </button>
                  </div>
                </div>
              ) : submitted?.signed_url && !recording ? (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <audio controls src={submitted.signed_url} style={{ width: "100%" }} />
                  <button type="button" onClick={() => void startRecording(prompt.id)} style={secondaryButtonStyle}>
                    Record a replacement
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(recordingPromptId && !recording)}
                  onClick={() => (recording ? stopRecording() : void startRecording(prompt.id))}
                  style={{
                    ...primaryButtonStyle,
                    marginTop: 12,
                    background: recording ? "#dc2626" : "#f97316",
                    width: "100%",
                    minHeight: 48,
                  }}
                >
                  {recording ? "Stop recording" : "Record"}
                </button>
              )}
            </article>
          )
        })}
      </section>
    </main>
  )
}

const pageStyle = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: "max(18px, env(safe-area-inset-top)) 14px max(28px, env(safe-area-inset-bottom))",
  background: "linear-gradient(165deg, #fff7ed 0%, #f8fafc 40%, #eff6ff 100%)",
  fontFamily: "Inter, system-ui, sans-serif",
} as const

const unlockCardStyle = {
  width: "min(100%, 430px)",
  boxSizing: "border-box",
  margin: "8vh auto 0",
  padding: 24,
  borderRadius: 18,
  background: "#fff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 20px 50px rgba(15,23,42,0.12)",
} as const

const promptCardStyle = {
  padding: 16,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
} as const

const labelStyle = { display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 800 } as const
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 18,
} as const
const primaryButtonStyle = {
  padding: "11px 15px",
  borderRadius: 10,
  border: "none",
  background: "#f97316",
  color: "#fff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
} as const
const secondaryButtonStyle = {
  ...primaryButtonStyle,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
} as const
const errorStyle = {
  margin: "12px 0 0",
  padding: 10,
  borderRadius: 8,
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: 13,
} as const
