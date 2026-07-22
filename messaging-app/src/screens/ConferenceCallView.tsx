import { Capacitor } from "@capacitor/core"
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react"
import type { useConferenceRoom } from "../lib/useConferenceRoom"

type RoomApi = ReturnType<typeof useConferenceRoom>

type ChatProps = {
  messages: { id: string; mine: boolean; senderLabel: string; body: string }[]
  onSend: (text: string) => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Attach a remote WebRTC stream so audio (and optional video) actually plays. */
function RemoteMedia({ stream, video, muted, label, screen }: { stream: MediaStream | null; video?: boolean; muted?: boolean; label: string; screen?: boolean }) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !stream) return
    if (el.srcObject !== stream) el.srcObject = stream
    void el.play().catch(() => undefined)
  }, [stream])

  if (video) {
    return (
      <div style={{ ...tile, aspectRatio: screen ? "16 / 9" : "3 / 4" }}>
        {stream ? (
          <video ref={ref as RefObject<HTMLVideoElement>} autoPlay playsInline muted={muted} style={{ width: "100%", height: "100%", objectFit: screen ? "contain" : "cover" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>connecting…</div>
        )}
        <span style={tileLabel}>{label}</span>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
      {stream ? <audio ref={ref as RefObject<HTMLAudioElement>} autoPlay playsInline /> : null}
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#334155", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
        {initials(label)}
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: stream ? "#4ade80" : "#94a3b8", fontWeight: 700 }}>{stream ? "Connected" : "Ringing…"}</span>
    </div>
  )
}

function ControlBtn({
  label,
  sub,
  onClick,
  danger,
  active,
  mutedLook,
}: {
  label: string
  sub?: string
  onClick: () => void
  danger?: boolean
  active?: boolean
  mutedLook?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minWidth: 76,
        maxWidth: 110,
        flex: "1 1 76px",
        border: "none",
        borderRadius: 14,
        padding: "12px 8px",
        background: danger ? "#dc2626" : mutedLook ? "#b91c1c" : active ? "#1d4ed8" : "#334155",
        color: "#fff",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.15, textAlign: "center" }}>{label}</span>
      {sub ? <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.9, textAlign: "center", lineHeight: 1.2 }}>{sub}</span> : null}
    </button>
  )
}

export default function ConferenceCallView({
  room,
  selfName,
  chat,
}: {
  room: RoomApi
  selfName: string
  chat?: ChatProps | null
}) {
  const { state, participants, incoming, muted, cameraOn, isVideo, sharingScreen, speakerOn, seconds, error, selfStream } = room
  const [showChat, setShowChat] = useState(false)
  const [text, setText] = useState("")
  const endRef = useRef<HTMLDivElement | null>(null)
  const canScreenShare = Capacitor.getPlatform() !== "android"

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat?.messages.length, showChat])

  if (state === "incoming" && incoming) {
    return (
      <div style={fullscreen}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#334155", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 28 }}>
            {initials(incoming.fromName)}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center" }}>{incoming.fromName}</div>
          <div style={{ fontSize: 15, color: "#cbd5e1", textAlign: "center" }}>
            Incoming {incoming.video ? "video" : "audio"} call
            {incoming.members.length > 2 ? ` · ${incoming.members.length} people` : ""}
          </div>
          <div style={{ fontSize: 13, color: "#86efac", fontWeight: 700 }}>Ringing…</div>
        </div>
        <div style={{ display: "flex", gap: 16, padding: "16px 24px calc(24px + env(safe-area-inset-bottom))", justifyContent: "center" }}>
          <ControlBtn label="Decline" onClick={room.decline} danger />
          <ControlBtn label="Accept" onClick={() => void room.accept()} active />
        </div>
      </div>
    )
  }

  const connectedCount = participants.filter((p) => p.connected).length + 1
  const title = participants.length === 1 ? participants[0].name : `Team call · ${connectedCount}`
  const stateText =
    state === "ringing" ? "Calling… ringback on" : state === "error" ? "Call error" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

  function submitChat(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t || !chat) return
    chat.onSend(t)
    setText("")
  }

  return (
    <div style={fullscreen}>
      <div style={{ textAlign: "center", padding: "16px 12px 4px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>
          {stateText}
          {sharingScreen ? " · Sharing screen" : ""}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {isVideo || sharingScreen ? (
          <div style={{ display: "grid", gridTemplateColumns: participants.length > 0 ? "1fr 1fr" : "1fr", gap: 8 }}>
            {participants.map((p) => (
              <RemoteMedia key={p.id} stream={p.stream} video label={p.name} />
            ))}
            <RemoteMedia stream={selfStream} video muted label={sharingScreen ? `${selfName} (screen)` : selfName} screen={sharingScreen} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {participants.map((p) => (
              <RemoteMedia key={p.id} stream={p.stream} label={p.name} />
            ))}
            {participants.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 24, fontWeight: 600 }}>Waiting for others to join…</div>
            ) : null}
          </div>
        )}

        {showChat && chat ? (
          <div style={{ marginTop: 12, borderRadius: 12, background: "rgba(255,255,255,0.08)", overflow: "hidden", maxHeight: 220, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {chat.messages.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center" }}>Message while you talk</div>
              ) : (
                chat.messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                    {!m.mine ? <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{m.senderLabel}</div> : null}
                    <div style={{ padding: "7px 10px", borderRadius: 10, background: m.mine ? "#f97316" : "#1e293b", color: "#fff", fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
            <form onSubmit={submitChat} style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message…"
                style={{ flex: 1, borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", padding: "10px", fontSize: 15 }}
              />
              <button type="submit" style={{ border: "none", background: "#f97316", color: "#fff", borderRadius: 8, padding: "0 14px", fontWeight: 800 }}>
                Send
              </button>
            </form>
          </div>
        ) : null}

        {error ? <p style={{ margin: "12px 0 0", fontSize: 13, color: "#fca5a5", textAlign: "center" }}>{error}</p> : null}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "10px 12px calc(14px + env(safe-area-inset-bottom))", justifyContent: "center", flexWrap: "wrap" }}>
        <ControlBtn
          label={muted ? "Unmute" : "Mute"}
          sub="Microphone"
          onClick={room.toggleMute}
          mutedLook={muted}
        />
        <ControlBtn
          label={speakerOn ? "Loudspeaker" : "Earpiece"}
          sub={speakerOn ? "Tap for phone" : "Tap for speaker"}
          onClick={room.toggleSpeaker}
          active={speakerOn}
        />
        {(isVideo || sharingScreen) && !sharingScreen ? (
          <ControlBtn label={cameraOn ? "Camera on" : "Camera off"} sub="Video" onClick={room.toggleCamera} mutedLook={!cameraOn} />
        ) : null}
        {canScreenShare ? (
          <ControlBtn
            label={sharingScreen ? "Stop share" : "Share"}
            sub="Screen"
            onClick={() => void (sharingScreen ? room.stopScreenShare() : room.startScreenShare())}
            active={sharingScreen}
          />
        ) : null}
        {chat ? <ControlBtn label={showChat ? "Hide chat" : "Chat"} onClick={() => setShowChat((v) => !v)} active={showChat} /> : null}
        <ControlBtn label="Hang up" onClick={room.hangup} danger />
      </div>
    </div>
  )
}

const fullscreen: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "#0f172a",
  display: "flex",
  flexDirection: "column",
  paddingTop: "env(safe-area-inset-top)",
}
const tile: CSSProperties = {
  position: "relative",
  aspectRatio: "3 / 4",
  background: "#000",
  borderRadius: 12,
  overflow: "hidden",
}
const tileLabel: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  padding: "3px 8px",
  borderRadius: 6,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
}
