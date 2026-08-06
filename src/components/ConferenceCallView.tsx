import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
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

/** Column/row layout so every participant tile fits on screen (pop-out + group calls). */
function videoGridLayout(tileCount: number): { columns: number; rows: number } {
  if (tileCount <= 1) return { columns: 1, rows: 1 }
  if (tileCount === 2) return { columns: 2, rows: 1 }
  if (tileCount <= 4) return { columns: 2, rows: 2 }
  if (tileCount <= 6) return { columns: 3, rows: 2 }
  if (tileCount <= 9) return { columns: 3, rows: 3 }
  const columns = Math.ceil(Math.sqrt(tileCount))
  return { columns, rows: Math.ceil(tileCount / columns) }
}

function streamIsScreenShare(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false
  const track = stream.getVideoTracks().find((t) => t.readyState === "live") ?? stream.getVideoTracks()[0]
  if (!track) return false
  const settings = track.getSettings?.()
  if (settings?.displaySurface) return true
  return /screen|display|window|tab|share/i.test(track.label || "")
}

function VideoTile({
  stream,
  label,
  muted,
  screen,
  fill,
  thumbnail,
  suppressAudio,
}: {
  stream: MediaStream | null
  label: string
  muted?: boolean
  screen?: boolean
  fill?: boolean
  /** Compact tile for screen-share sidebar or dense pop-out grids. */
  thumbnail?: boolean
  /** Video-only tile — remote audio plays via ConferenceCallRemoteAudio in the parent window. */
  suppressAudio?: boolean
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !stream) return
    if (el.srcObject !== stream) el.srcObject = stream
    void el.play().catch(() => undefined)
  }, [stream])
  return (
    <div
      style={{
        ...tile,
        aspectRatio: thumbnail ? "16 / 9" : fill ? undefined : screen ? "16 / 9" : "4 / 3",
        ...(thumbnail
          ? { width: "100%", flexShrink: 0, minHeight: 0, maxHeight: 88 }
          : fill
            ? { minHeight: 0, minWidth: 0, height: "100%", width: "100%" }
            : null),
      }}
    >
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={Boolean(muted || suppressAudio)} style={{ width: "100%", height: "100%", objectFit: screen ? "contain" : "cover", background: "#000" }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 12 }}>
          connecting…
        </div>
      )}
      <span style={{ ...tileLabel, ...(thumbnail ? { fontSize: 9, padding: "1px 5px", left: 4, bottom: 4 } : null) }}>{label}</span>
    </div>
  )
}

function AudioTile({ name, connected, stream }: { name: string; connected: boolean; stream?: MediaStream | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const el = audioRef.current
    if (!el || !stream) return
    if (el.srcObject !== stream) el.srcObject = stream
    void el.play().catch(() => undefined)
  }, [stream])
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "#fff", border: `1px solid ${theme.border}` }}>
      {stream ? <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} /> : null}
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
  /** Rendered inside the desktop pop-out window — shrink tiles to fit everyone. */
  popOut?: boolean
  teamPeers?: { id: string; name: string }[]
  onInvitePeople?: (ids: string[]) => void
  onStartSeparatePhoneCall?: (phone: string) => void
  /** Search customers to email a conference dial-in invite. */
  searchEmailCustomers?: (query: string) => Promise<Array<{ id: string; name: string; email: string | null }>>
  onEmailCustomer?: (customer: { id: string; email: string; name: string }) => void | Promise<void>
  emailCustomerBusy?: boolean
  conferenceDialInHint?: { dialInDisplay: string | null; pin: string } | null
  /** When true, remote tiles are video-only; play remote audio via ConferenceCallRemoteAudio. */
  remoteAudioExternal?: boolean
}

/** Keeps remote call audio playing in the main window (survives video pop-out). */
export function ConferenceCallRemoteAudio({
  participants,
}: {
  participants: Array<{ id: string; stream: MediaStream | null }>
}) {
  return (
    <div aria-hidden style={{ position: "fixed", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      {participants.map((p) => (
        <RemoteAudioTrack key={p.id} stream={p.stream} />
      ))}
    </div>
  )
}

function RemoteAudioTrack({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!stream) {
      el.srcObject = null
      return
    }
    if (el.srcObject !== stream) el.srcObject = stream
    const play = () => void el.play().catch(() => undefined)
    play()
    stream.addEventListener("addtrack", play)
    return () => stream.removeEventListener("addtrack", play)
  }, [stream])
  if (!stream) return null
  return <audio ref={ref} autoPlay playsInline />
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
  popOut,
  teamPeers,
  onInvitePeople,
  onStartSeparatePhoneCall,
  searchEmailCustomers,
  onEmailCustomer,
  emailCustomerBusy,
  conferenceDialInHint,
  remoteAudioExternal,
}: Props) {
  const { state, participants, incoming, muted, cameraOn, isVideo, sharingScreen, seconds, error, selfStream } = room
  const [showChatLocal, setShowChatLocal] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addSel, setAddSel] = useState<Set<string>>(new Set())
  const [externalPhone, setExternalPhone] = useState("")
  const [emailCustQuery, setEmailCustQuery] = useState("")
  const [emailCustResults, setEmailCustResults] = useState<Array<{ id: string; name: string; email: string | null }>>([])
  const showChat = showChatProp ?? showChatLocal
  const addablePeers = useMemo(() => {
    const inCall = new Set(participants.map((p) => p.id))
    return (teamPeers ?? []).filter((p) => !inCall.has(p.id))
  }, [participants, teamPeers])
  const externalPhoneValid = externalPhone.replace(/\D/g, "").length >= 10

  useEffect(() => {
    if (!searchEmailCustomers || !addOpen) return
    let cancelled = false
    const id = window.setTimeout(() => {
      void searchEmailCustomers(emailCustQuery).then((rows) => {
        if (!cancelled) setEmailCustResults(rows)
      })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [addOpen, emailCustQuery, searchEmailCustomers])

  type StageTile = { key: string; stream: MediaStream | null; label: string; muted?: boolean; screen?: boolean }

  const stageTiles: StageTile[] = useMemo(() => {
    const rows: StageTile[] = participants.map((p) => ({
      key: p.id,
      stream: p.stream,
      label: streamIsScreenShare(p.stream) ? `${p.name} (screen)` : p.name,
      screen: streamIsScreenShare(p.stream),
    }))
    rows.push({
      key: "self",
      stream: selfStream,
      label: sharingScreen ? `${selfName} (screen)` : selfName,
      muted: true,
      screen: sharingScreen,
    })
    return rows
  }, [participants, selfStream, selfName, sharingScreen])

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
  const videoTileCount = participants.length + 1
  const videoGrid = videoGridLayout(videoTileCount)
  const fitVideoTiles = fillHeight || popOut
  const remoteHasVideo = participants.some((p) => p.stream?.getVideoTracks().some((t) => t.readyState === "live"))
  const showVideoLayout = isVideo || sharingScreen || remoteHasVideo || Boolean(selfStream?.getVideoTracks().some((t) => t.readyState === "live"))
  const remoteScreenSharer = participants.find((p) => streamIsScreenShare(p.stream))
  const anyScreenShare = sharingScreen || Boolean(remoteScreenSharer)
  const useStageLayout = fitVideoTiles && showVideoLayout
  const suppressRemoteTileAudio = (tileMuted?: boolean) => Boolean(remoteAudioExternal && !tileMuted)

  function renderVideoStage() {
    if (anyScreenShare && useStageLayout) {
      const mainKey = sharingScreen ? "self" : remoteScreenSharer?.id ?? "self"
      const main = stageTiles.find((t) => t.key === mainKey) ?? stageTiles[0]
      const thumbs = stageTiles.filter((t) => t.key !== mainKey)
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 6,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
            {main ? (
              <VideoTile stream={main.stream} label={main.label} muted={main.muted} screen fill suppressAudio={suppressRemoteTileAudio(main.muted)} />
            ) : null}
          </div>
          {thumbs.length > 0 ? (
            <div
              style={{
                width: 108,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                overflowY: "auto",
                minHeight: 0,
                maxHeight: "100%",
              }}
            >
              {thumbs.map((t) => (
                <VideoTile key={t.key} stream={t.stream} label={t.label} muted={t.muted} screen={t.screen} thumbnail suppressAudio={suppressRemoteTileAudio(t.muted)} />
              ))}
            </div>
          ) : null}
        </div>
      )
    }

    if (useStageLayout) {
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${videoGrid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${videoGrid.rows}, minmax(0, 1fr))`,
            gap: 6,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignContent: "stretch",
          }}
        >
          {stageTiles.map((t) => (
            <VideoTile key={t.key} stream={t.stream} label={t.label} muted={t.muted} screen={t.screen} fill suppressAudio={suppressRemoteTileAudio(t.muted)} />
          ))}
        </div>
      )
    }

    if (anyScreenShare) {
      const mainKey = sharingScreen ? "self" : remoteScreenSharer?.id ?? "self"
      const main = stageTiles.find((t) => t.key === mainKey) ?? stageTiles[0]
      const thumbs = stageTiles.filter((t) => t.key !== mainKey)
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {main ? <VideoTile stream={main.stream} label={main.label} muted={main.muted} screen suppressAudio={suppressRemoteTileAudio(main.muted)} /> : null}
          {thumbs.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(thumbs.length, 3)}, minmax(0, 1fr))`,
                gap: 6,
                maxHeight: 120,
              }}
            >
              {thumbs.map((t) => (
                <VideoTile key={t.key} stream={t.stream} label={t.label} muted={t.muted} thumbnail suppressAudio={suppressRemoteTileAudio(t.muted)} />
              ))}
            </div>
          ) : null}
        </div>
      )
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${videoGrid.columns}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {stageTiles.map((t) => (
          <VideoTile key={t.key} stream={t.stream} label={t.label} muted={t.muted} screen={t.screen} suppressAudio={suppressRemoteTileAudio(t.muted)} />
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        ...wrap,
        padding: compact ? 10 : popOut ? 8 : 14,
        gap: compact ? 8 : popOut ? 8 : 12,
        ...(popOut
          ? {
              height: "100%",
              boxSizing: "border-box" as const,
              display: "flex",
              flexDirection: "column" as const,
              overflow: "hidden",
              border: "none",
              borderRadius: 0,
              background: "transparent",
            }
          : fillHeight
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
          <div
            style={{
              fontSize: compact ? 13 : 16,
              fontWeight: 800,
              color: popOut ? "#f8fafc" : "#0f172a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          <div style={{ marginTop: 1, fontSize: 12, fontWeight: 700, color: popOut ? "#cbd5e1" : "#475569" }}>
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

      {!compact || showVideoLayout ? (
        showVideoLayout ? (
          <div style={useStageLayout ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" } : undefined}>
            {renderVideoStage()}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, ...(fillHeight ? { flex: 1, minHeight: 0, overflow: "auto" } : null) }}>
            {participants.map((p) => (
              <AudioTile key={p.id} name={p.name} connected={p.connected} stream={remoteAudioExternal ? undefined : p.stream} />
            ))}
          </div>
        )
      ) : null}

      {addOpen ? (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10, background: "#fff", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ flex: 1, fontSize: 13, color: "#0f172a" }}>Team call vs phone call</strong>
            <button type="button" onClick={() => setAddOpen(false)} style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>
            Team calls stay on Tradesman (invite teammates below). Outside phone numbers use a separate Twilio business-line call — they are not mixed into this room.
          </p>
          {onInvitePeople ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#0f766e", textTransform: "uppercase" }}>Invite teammate · team call</div>
              {addablePeers.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 12 }}>No other teammates are available to invite.</div>
              ) : (
                addablePeers.map((p) => {
                  const selected = addSel.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAddSel((prev) => {
                        const next = new Set(prev)
                        if (next.has(p.id)) next.delete(p.id)
                        else next.add(p.id)
                        return next
                      })}
                      style={{ border: `1px solid ${selected ? theme.primary : theme.border}`, borderRadius: 8, background: selected ? "#eff6ff" : "#fff", color: "#0f172a", padding: "7px 9px", textAlign: "left", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
                    >
                      {selected ? "✓ " : ""}{p.name}
                    </button>
                  )
                })
              )}
              <button
                type="button"
                disabled={addSel.size === 0}
                onClick={() => {
                  if (addSel.size === 0) return
                  onInvitePeople([...addSel])
                  setAddSel(new Set())
                  setAddOpen(false)
                }}
                style={{ ...ctrlBtn, padding: "8px", border: "none", background: addSel.size ? theme.primary : "#cbd5e1", color: "#fff", cursor: addSel.size ? "pointer" : "default" }}
              >
                {addSel.size ? `Invite ${addSel.size} teammate${addSel.size === 1 ? "" : "s"} to team call` : "Select teammates"}
              </button>
            </>
          ) : null}
          {onStartSeparatePhoneCall ? (
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#9a3412", textTransform: "uppercase" }}>External phone · Twilio call</div>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                Ends this team call, then starts a separate business-line phone call from your Tradesman number.
              </p>
              <input
                type="tel"
                inputMode="tel"
                value={externalPhone}
                onChange={(e) => setExternalPhone(e.target.value)}
                placeholder="(555) 123-4567"
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "8px 9px", fontSize: 13, color: "#0f172a", background: "#fff" }}
              />
              <button
                type="button"
                disabled={!externalPhoneValid}
                onClick={() => onStartSeparatePhoneCall(externalPhone)}
                style={{ ...ctrlBtn, padding: "8px", border: "none", background: externalPhoneValid ? "#b45309" : "#cbd5e1", color: "#fff", cursor: externalPhoneValid ? "pointer" : "default" }}
              >
                Leave team call &amp; start phone call
              </button>
            </div>
          ) : null}
          {onEmailCustomer && searchEmailCustomers ? (
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase" }}>Email customer · conference invite</div>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                Sends dial-in number and conference PIN so they can join this call by phone.
              </p>
              {conferenceDialInHint?.pin ? (
                <p style={{ margin: 0, fontSize: 11.5, color: "#0f172a", lineHeight: 1.45, padding: "8px 9px", borderRadius: 8, background: "#eff6ff", border: `1px solid ${theme.border}` }}>
                  {conferenceDialInHint.dialInDisplay ? (
                    <>
                      <strong>Dial:</strong> {conferenceDialInHint.dialInDisplay}
                      <br />
                    </>
                  ) : null}
                  <strong>PIN:</strong> {conferenceDialInHint.pin}
                </p>
              ) : null}
              <input
                value={emailCustQuery}
                onChange={(e) => setEmailCustQuery(e.target.value)}
                placeholder="Search customer by name…"
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "8px 9px", fontSize: 13, color: "#0f172a", background: "#fff" }}
              />
              <div style={{ display: "grid", gap: 4, maxHeight: 120, overflowY: "auto" }}>
                {emailCustResults.length === 0 ? (
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Search for a customer with an email on file.</span>
                ) : (
                  emailCustResults.map((c) => {
                    const hasEmail = Boolean(c.email?.trim())
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!hasEmail || emailCustomerBusy}
                        onClick={() => {
                          if (!c.email?.trim()) return
                          void onEmailCustomer({ id: c.id, email: c.email.trim(), name: c.name })
                        }}
                        style={{
                          border: `1px solid ${theme.border}`,
                          borderRadius: 8,
                          background: hasEmail ? "#fff" : "#f8fafc",
                          color: hasEmail ? "#0f172a" : "#94a3b8",
                          padding: "7px 9px",
                          textAlign: "left",
                          cursor: hasEmail && !emailCustomerBusy ? "pointer" : "default",
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        Email {c.name}
                        {c.email?.trim() ? ` · ${c.email.trim()}` : " · no email"}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
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
        {(onInvitePeople && (teamPeers?.length ?? 0) > 0) || onStartSeparatePhoneCall || onEmailCustomer ? (
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            style={{ ...ctrlBtn, flex: 1, minWidth: 70, background: addOpen ? "#fff7ed" : "#fff", color: "#0f172a", border: `1px solid ${theme.border}`, padding: "8px" }}
          >
            {addOpen ? "Close" : "Invite / email"}
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
    #root{height:100%;box-sizing:border-box;padding:8px;display:flex;flex-direction:column;overflow:hidden}
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
