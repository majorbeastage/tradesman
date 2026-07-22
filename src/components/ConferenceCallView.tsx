import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { theme } from "../styles/theme"
import type { useConferenceRoom } from "../lib/useConferenceRoom"

type RoomApi = ReturnType<typeof useConferenceRoom>

type ChatProps = {
  messages: { id: string; mine: boolean; senderLabel: string; body: string }[]
  onSend: (text: string) => void
  sending?: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function VideoTile({ stream, label, muted, screen, fill }: { stream: MediaStream | null; label: string; muted?: boolean; screen?: boolean; fill?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el && stream && el.srcObject !== stream) el.srcObject = stream
  }, [stream])
  return (
    <div
      style={{
        ...tile,
        aspectRatio: fill ? undefined : screen ? "16 / 9" : "4 / 3",
        ...(fill ? { minHeight: 0, height: "100%" } : null),
      }}
    >
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} style={{ width: "100%", height: "100%", objectFit: screen ? "contain" : "cover", background: "#000" }} />
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

function InCallChat({ chat }: { chat: ChatProps }) {
  const [text, setText] = useState("")
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat.messages.length])

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t || chat.sending) return
    chat.onSend(t)
    setText("")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${theme.border}`, background: "#fff", borderRadius: 10, overflow: "hidden", minHeight: 140, maxHeight: 200 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {chat.messages.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 8 }}>Message this call while you talk</div>
        ) : (
          chat.messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "88%" }}>
              {!m.mine ? <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 2 }}>{m.senderLabel}</div> : null}
              <div
                style={{
                  padding: "6px 9px",
                  borderRadius: 10,
                  background: m.mine ? theme.primary : "#f1f5f9",
                  color: m.mine ? "#fff" : theme.text,
                  fontSize: 12.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 6, padding: 8, borderTop: `1px solid ${theme.border}` }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, color: "#0f172a", background: "#fff" }}
        />
        <button type="submit" disabled={chat.sending || !text.trim()} style={{ border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "7px 10px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          Send
        </button>
      </form>
    </div>
  )
}

type Props = {
  room: RoomApi
  selfName: string
  /** Compact strip when chat is primary underneath. */
  compact?: boolean
  chat?: ChatProps | null
  /**
   * When true, Chat toggles the messenger thread below (parent-owned).
   * Do not render a second in-call chat panel here.
   */
  chatPanelExternal?: boolean
  /** Controlled visibility for Chat highlight / external panel. */
  showChat?: boolean
  onToggleChat?: () => void
  /** Grow to fill the messenger panel when thread chat is hidden. */
  fillHeight?: boolean
  /** Desktop: open video in a separate popup / PiP window. */
  onPopOut?: () => void
  poppedOut?: boolean
  onReturnFromPopOut?: () => void
}

export function ConferenceCallBody({
  room,
  selfName,
  compact,
  chat,
  chatPanelExternal,
  showChat: showChatProp,
  onToggleChat,
  fillHeight,
  onPopOut,
  poppedOut,
  onReturnFromPopOut,
}: Props) {
  const { state, participants, incoming, muted, cameraOn, isVideo, sharingScreen, seconds, error, selfStream } = room
  const [showChatLocal, setShowChatLocal] = useState(false)
  const showChat = showChatProp ?? showChatLocal

  function toggleChat() {
    if (onToggleChat) onToggleChat()
    else setShowChatLocal((v) => !v)
  }

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

  if (poppedOut) {
    return (
      <div style={{ ...wrap, padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>
            Video in popup · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onReturnFromPopOut} style={{ ...ctrlBtn, padding: "6px 10px", background: "#fff", border: `1px solid ${theme.border}`, color: "#0f172a" }}>
            Return video
          </button>
          <button type="button" onClick={room.hangup} style={{ ...ctrlBtn, padding: "6px 10px", background: "#dc2626", color: "#fff", border: "none" }}>
            Leave
          </button>
        </div>
        {chat && showChat && !chatPanelExternal ? (
          <div style={{ marginTop: 8 }}>
            <InCallChat chat={chat} />
          </div>
        ) : null}
      </div>
    )
  }

  const connectedCount = participants.filter((p) => p.connected).length + 1
  const title = participants.length === 1 ? participants[0].name : `Team call · ${connectedCount}`
  const stateText =
    state === "ringing" ? "Ringing…" : state === "error" ? "Call error" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  const showInlineChat = Boolean(chat) && showChat && !chatPanelExternal

  return (
    <div
      style={{
        ...wrap,
        padding: compact ? 10 : 14,
        gap: compact ? 8 : 12,
        ...(fillHeight
          ? {
              flex: 1,
              minHeight: 0,
              alignSelf: "stretch",
              boxSizing: "border-box" as const,
              display: "flex",
              flexDirection: "column" as const,
            }
          : null),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 13 : 16, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ marginTop: 1, fontSize: 12, fontWeight: 700, color: "#475569" }}>
            {stateText}
            {sharingScreen ? " · Sharing screen" : ""}
          </div>
        </div>
        {onPopOut ? (
          <button
            type="button"
            onClick={onPopOut}
            title="Pop out video into a separate window"
            style={{ ...ctrlBtn, padding: "6px 10px", background: "#fff", border: `1px solid ${theme.border}`, color: "#0f172a", flex: "0 0 auto", whiteSpace: "nowrap" }}
          >
            Pop out
          </button>
        ) : null}
      </div>

      {!compact || isVideo || sharingScreen ? (
        isVideo || sharingScreen ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: participants.length > 1 ? "1fr 1fr" : "1fr",
              gap: 8,
              ...(fillHeight ? { flex: 1, minHeight: 0, alignContent: "stretch", overflow: "hidden" } : null),
            }}
          >
            {participants.map((p) => (
              <VideoTile key={p.id} stream={p.stream} label={p.name} fill={fillHeight} />
            ))}
            <VideoTile
              stream={selfStream}
              label={sharingScreen ? `${selfName} (screen)` : selfName}
              muted
              screen={sharingScreen}
              fill={fillHeight}
            />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, ...(fillHeight ? { flex: 1, minHeight: 0, overflow: "auto" } : null) }}>
            {participants.map((p) => (
              <AudioTile key={p.id} name={p.name} connected={p.connected} />
            ))}
          </div>
        )
      ) : null}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
        <button
          type="button"
          onClick={room.toggleMute}
          style={{ ...ctrlBtn, flex: 1, minWidth: 70, background: muted ? "#fee2e2" : "#fff", color: "#0f172a", border: `1px solid ${theme.border}`, padding: "8px" }}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        {(isVideo || sharingScreen) && !sharingScreen ? (
          <button
            type="button"
            onClick={room.toggleCamera}
            style={{ ...ctrlBtn, flex: 1, minWidth: 70, background: cameraOn ? "#fff" : "#fee2e2", color: "#0f172a", border: `1px solid ${theme.border}`, padding: "8px" }}
          >
            {cameraOn ? "Cam" : "Cam off"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void (sharingScreen ? room.stopScreenShare() : room.startScreenShare())}
          style={{ ...ctrlBtn, flex: 1, minWidth: 70, background: sharingScreen ? "#dbeafe" : "#fff", color: "#0f172a", border: `1px solid ${theme.border}`, padding: "8px" }}
        >
          {sharingScreen ? "Stop share" : "Share"}
        </button>
        {chat || chatPanelExternal ? (
          <button
            type="button"
            onClick={toggleChat}
            style={{ ...ctrlBtn, flex: 1, minWidth: 70, background: showChat ? "#fff7ed" : "#fff", color: "#0f172a", border: `1px solid ${theme.border}`, padding: "8px" }}
          >
            {showChat ? "Hide chat" : "Chat"}
          </button>
        ) : null}
        <button type="button" onClick={room.hangup} style={{ ...ctrlBtn, flex: 1, minWidth: 70, background: "#dc2626", color: "#fff", border: "none", padding: "8px" }}>
          Leave
        </button>
      </div>

      {showInlineChat && chat ? <InCallChat chat={chat} /> : null}
      {error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626", textAlign: "center", flexShrink: 0 }}>{error}</p> : null}
    </div>
  )
}

export default function ConferenceCallView(props: Props) {
  return <ConferenceCallBody {...props} />
}

/** Open a desktop popup / Document PiP and render the call UI there. Returns a closer. */
export async function openConferencePopOut(render: (mount: HTMLElement) => () => void): Promise<() => void> {
  type Dip = { requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window> }
  const dip = (window as unknown as { documentPictureInPicture?: Dip }).documentPictureInPicture

  let win: Window | null = null
  try {
    if (dip?.requestWindow) {
      win = await dip.requestWindow({ width: 520, height: 420 })
    }
  } catch {
    win = null
  }
  if (!win) {
    win = window.open("", "tradesman-video-call", "popup=yes,width=640,height=480")
  }
  if (!win) throw new Error("Popup blocked — allow popups for Tradesman to pop out video.")

  const doc = win.document
  doc.title = "Tradesman call"
  doc.head.innerHTML = `<style>
    html,body{margin:0;height:100%;background:#0f172a;font-family:Segoe UI,system-ui,sans-serif}
    #root{height:100%;box-sizing:border-box;padding:10px;overflow:auto}
  </style>`
  const mount = doc.createElement("div")
  mount.id = "root"
  doc.body.replaceChildren(mount)

  const unmount = render(mount)

  const onUnload = () => {
    try {
      unmount()
    } catch {
      /* ignore */
    }
  }
  win.addEventListener("pagehide", onUnload)

  return () => {
    try {
      win?.removeEventListener("pagehide", onUnload)
      unmount()
      win?.close()
    } catch {
      /* ignore */
    }
  }
}

/** Helper to mount a React tree into a popup element. */
export function mountReactInPopup(mount: HTMLElement, node: ReactNode): () => void {
  const root: Root = createRoot(mount)
  root.render(node)
  return () => {
    try {
      root.unmount()
    } catch {
      /* ignore */
    }
  }
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
  fontSize: 12,
}
