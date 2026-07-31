import { useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import { theme } from "../styles/theme"

const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

type Props = {
  onRecorded: (publicUrl: string) => void
}

export function AttendantStepRecorder({ onRecorded }: Props) {
  const { user } = useAuth()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  async function startRecording() {
    setError("")
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Use Chrome, Safari, or Edge and allow microphone access.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        void uploadRecording(recorder.mimeType || "audio/webm")
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access was denied.")
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  async function uploadRecording(mimeType: string) {
    if (!supabase || !user?.id) {
      setError("Sign in again to save your recording.")
      return
    }
    const blob = new Blob(chunksRef.current, { type: mimeType })
    if (!blob.size) {
      setError("Recording was empty. Try again and speak after tapping Record.")
      return
    }
    setUploading(true)
    setError("")
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm"
      const filePath = `${user.id}/auto-attendant/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from(VOICEMAIL_GREETING_BUCKET)
        .upload(filePath, blob, { upsert: true, contentType: mimeType })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath)
      onRecorded(data.publicUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {!recording ? (
          <button
            type="button"
            disabled={uploading}
            onClick={() => void startRecording()}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 600,
              fontSize: 12,
              cursor: uploading ? "wait" : "pointer",
            }}
          >
            {uploading ? "Saving…" : "Record my question"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Stop & save
          </button>
        )}
        <span style={{ fontSize: 11, color: "#64748b" }}>
          Uses your microphone in the browser. On mobile, allow mic access when prompted.
        </span>
      </div>
      {error ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  )
}
