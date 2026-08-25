import { useRef, useState } from "react"
import { uploadAttendantAudio } from "../lib/attendantRecordingUpload"
import { acquireMicrophoneStream, createAudioMediaRecorder } from "../lib/mediaRecorderMime"
import { useAuth } from "../contexts/AuthContext"
import { useLocale } from "../i18n/LocaleContext"
import { theme } from "../styles/theme"

type Props = {
  onRecorded: (publicUrl: string) => void
}

export function AttendantStepRecorder({ onRecorded }: Props) {
  const { t } = useLocale()
  const { user } = useAuth()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  async function startRecording() {
    setError("")
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(t("account.callScreening.recordBrowserError"))
      return
    }
    try {
      const stream = await acquireMicrophoneStream()
      streamRef.current = stream
      const recorder = createAudioMediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        void saveBlob(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }), recorder.mimeType || "audio/webm")
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("account.callScreening.recordMicDenied"))
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  async function saveBlob(blob: Blob, mimeType: string) {
    if (!user?.id) {
      setError(t("account.callScreening.recordSignIn"))
      return
    }
    if (!blob.size) {
      setError(t("account.callScreening.recordEmpty"))
      return
    }
    setUploading(true)
    setError("")
    try {
      const publicUrl = await uploadAttendantAudio(user.id, blob, mimeType)
      onRecorded(publicUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return
    await saveBlob(file, file.type || "audio/mpeg")
    if (fileRef.current) fileRef.current.value = ""
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
            {uploading ? t("account.callScreening.recordSaving") : t("account.callScreening.recordButton")}
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
            {t("account.callScreening.recordStop")}
          </button>
        )}
        <button
          type="button"
          disabled={uploading || recording}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            color: theme.text,
            fontWeight: 600,
            fontSize: 12,
            cursor: uploading || recording ? "default" : "pointer",
          }}
        >
          {t("account.callScreening.recordUpload")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/webm,.mp3,.wav,.m4a,.webm"
          hidden
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
      </div>
      <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{t("account.callScreening.recordConvertHelp")}</span>
      {error ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  )
}
