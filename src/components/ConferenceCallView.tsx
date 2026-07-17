import { useEffect, useRef, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { useConferenceRoom } from "../lib/useConferenceRoom"

type RoomApi = ReturnType<typeof useConferenceRoom>

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function VideoTile({ stream, label, muted }: { stream: MediaStream | null; label: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el && stream && el.srcObject !== stream) el.srcObject = stream
  }, [stream])
  return (
    <div style={tile}>
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 12 }}>
          connecting…
        </div>
      )}
      <span style={tileLabel}>{label}</span>
    </div>
  )
}

function AudioTile({ name, connected }: { name: string; connected: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "#fff", border: `1px solid ${theme.border}` }}>
      <span style={{ position: "relative" }}>
        <span style={{ width: 38, height: 38, borderRadius: "50%", background: "#e2e8f0", color: theme.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
          {initials(name)}
        </span>
        <span style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: connected ? "#22c55e" : "#cbd5e1", border: "2px solid #fff" }} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{name}</span>
      <span style={{ marginLeft: "auto", fontSize: 11.5, color: connected ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
        {connected ? "Connected" : "Ringing…"}
      </span>
    </div>
  )
}

export default function ConferenceCallView({ room, selfName }: { room: RoomApi; selfName: string }) {
  const { state, participants, incoming, muted, cameraOn, isVideo, seconds, error, selfStream } = room

  if (state === "incoming" && incoming) {
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", display: "grid", gap: 6 }}>
          <div style={{ fontSize: 40 }}>{incoming.video ? "🎥" : "📞"}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{incoming.fromName}</div>
          <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
            Incoming {incoming.video ? "video" : "audio"} call
            {incoming.members.length > 2 ? ` · ${incoming.members.length} people` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => void room.accept()} style={{ ...ctrlBtn, background: "#059669", color: "#fff", border: "none", flex: 1 }}>
            ✓ Accept
          </button>
          <button type="button" onClick={room.decline} style={{ ...ctrlBtn, background: "#dc2626", color: "#fff", border: "none", flex: 1 }}>
            ✕ Decline
          </button>
        </div>
      </div>
    )
  }

  const connectedCount = participants.filter((p) => p.connected).length + 1
  const title = participants.length === 1 ? participants[0].name : `Team call · ${connectedCount}`
  const stateText =
    state === "ringing" ? "Ringing…" : state === "error" ? "Call error" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

  return (
    <div style={wrap}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: "#475569" }}>{stateText}</div>
      </div>

      {isVideo ? (
        <div style={{ display: "grid", gridTemplateColumns: participants.length > 1 ? "1fr 1fr" : "1fr", gap: 8 }}>
          {participants.map((p) => (
            <VideoTile key={p.id} stream={p.stream} label={p.name} />
          ))}
          <VideoTile stream={selfStream} label={selfName} muted />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {participants.map((p) => (
            <AudioTile key={p.id} name={p.name} connected={p.connected} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={room.toggleMute}
          style={{ ...ctrlBtn, flex: 1, background: muted ? "#fee2e2" : "#fff", color: "#0f172a", border: `1px solid ${theme.border}` }}
        >
          {muted ? "🔇 Unmute" : "🎙 Mute"}
        </button>
        {isVideo ? (
          <button
            type="button"
            onClick={room.toggleCamera}
            style={{ ...ctrlBtn, flex: 1, background: cameraOn ? "#fff" : "#fee2e2", color: "#0f172a", border: `1px solid ${theme.border}` }}
          >
            {cameraOn ? "📷 Cam on" : "🚫 Cam off"}
          </button>
        ) : null}
        <button type="button" onClick={room.hangup} style={{ ...ctrlBtn, flex: 1, background: "#dc2626", color: "#fff", border: "none" }}>
          ✕ Leave
        </button>
      </div>

      {error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626", textAlign: "center" }}>{error}</p> : null}
    </div>
  )
}

const wrap: CSSProperties = {
  display: "grid",
  gap: 12,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  padding: 14,
  background: "#f8fafc",
}
const tile: CSSProperties = {
  position: "relative",
  aspectRatio: "4 / 3",
  background: "#0f172a",
  borderRadius: 10,
  overflow: "hidden",
}
const tileLabel: CSSProperties = {
  position: "absolute",
  left: 6,
  bottom: 6,
  padding: "2px 7px",
  borderRadius: 6,
  background: "rgba(15,23,42,0.6)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
}
const ctrlBtn: CSSProperties = {
  borderRadius: 8,
  padding: "10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
}
