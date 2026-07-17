import { useEffect, useRef, type CSSProperties } from "react"
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>
          connecting…
        </div>
      )}
      <span style={tileLabel}>{label}</span>
    </div>
  )
}

export default function ConferenceCallView({ room, selfName }: { room: RoomApi; selfName: string }) {
  const { state, participants, incoming, muted, cameraOn, isVideo, seconds, error, selfStream } = room

  if (state === "incoming" && incoming) {
    return (
      <div style={fullscreen}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ fontSize: 64 }}>{incoming.video ? "🎥" : "📞"}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{incoming.fromName}</div>
          <div style={{ fontSize: 15, color: "#cbd5e1" }}>
            Incoming {incoming.video ? "video" : "audio"} call
            {incoming.members.length > 2 ? ` · ${incoming.members.length} people` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, padding: 24, justifyContent: "center" }}>
          <button type="button" onClick={room.decline} style={{ ...roundBtn, background: "#dc2626" }}>✕</button>
          <button type="button" onClick={() => void room.accept()} style={{ ...roundBtn, background: "#059669" }}>✓</button>
        </div>
      </div>
    )
  }

  const connectedCount = participants.filter((p) => p.connected).length + 1
  const title = participants.length === 1 ? participants[0].name : `Team call · ${connectedCount}`
  const stateText =
    state === "ringing" ? "Ringing…" : state === "error" ? "Call error" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

  return (
    <div style={fullscreen}>
      <div style={{ textAlign: "center", padding: "16px 12px 4px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>{stateText}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {isVideo ? (
          <div style={{ display: "grid", gridTemplateColumns: participants.length > 0 ? "1fr 1fr" : "1fr", gap: 8 }}>
            {participants.map((p) => (
              <VideoTile key={p.id} stream={p.stream} label={p.name} />
            ))}
            <VideoTile stream={selfStream} label={selfName} muted />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {participants.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#334155", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                  {initials(p.name)}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{p.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 12.5, color: p.connected ? "#4ade80" : "#94a3b8", fontWeight: 700 }}>
                  {p.connected ? "Connected" : "Ringing…"}
                </span>
              </div>
            ))}
          </div>
        )}
        {error ? <p style={{ margin: "12px 0 0", fontSize: 13, color: "#fca5a5", textAlign: "center" }}>{error}</p> : null}
      </div>

      <div style={{ display: "flex", gap: 18, padding: "16px 24px 28px", justifyContent: "center" }}>
        <button type="button" onClick={room.toggleMute} style={{ ...roundBtn, background: muted ? "#b91c1c" : "#334155", fontSize: 22 }}>
          {muted ? "🔇" : "🎙"}
        </button>
        {isVideo ? (
          <button type="button" onClick={room.toggleCamera} style={{ ...roundBtn, background: cameraOn ? "#334155" : "#b91c1c", fontSize: 22 }}>
            {cameraOn ? "📷" : "🚫"}
          </button>
        ) : null}
        <button type="button" onClick={room.hangup} style={{ ...roundBtn, background: "#dc2626", fontSize: 24 }}>📵</button>
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
}
const roundBtn: CSSProperties = {
  width: 68,
  height: 68,
  borderRadius: "50%",
  border: "none",
  color: "#fff",
  fontSize: 26,
  fontWeight: 800,
  cursor: "pointer",
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
