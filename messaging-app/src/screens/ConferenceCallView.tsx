import { Capacitor } from "@capacitor/core"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react"
import type { useConferenceRoom } from "../lib/useConferenceRoom"
import {
  MAX_VISIBLE_MOBILE,
  pickVisibleStageTiles,
  streamIsScreenShare,
  useSpeakingIds,
  videoGridLayout,
} from "../lib/conferenceVideoStage"

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

function streamHasLiveVideo(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false
  return stream.getVideoTracks().some((t) => t.readyState === "live")
}

/** Attach a remote WebRTC stream so audio (and optional video) actually plays. */
function RemoteMedia({
  stream,
  video,
  muted,
  label,
  screen,
  fill,
  thumbnail,
  speaking,
}: {
  stream: MediaStream | null
  video?: boolean
  muted?: boolean
  label: string
  screen?: boolean
  fill?: boolean
  thumbnail?: boolean
  speaking?: boolean
}) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !stream) return
    if (el.srcObject !== stream) el.srcObject = stream
    void el.play().catch(() => undefined)
  }, [stream])

  if (video) {
    return (
      <div
        style={{
          ...tile,
          aspectRatio: fill ? undefined : thumbnail ? "16 / 9" : screen ? "16 / 9" : "3 / 4",
          boxShadow: speaking ? "0 0 0 2px #4ade80, 0 0 14px rgba(74,222,128,0.45)" : undefined,
          ...(fill
            ? { minHeight: 0, minWidth: 0, width: "100%", height: "100%" }
            : thumbnail
              ? { width: "100%", flexShrink: 0, minHeight: 0, maxHeight: 84 }
              : null),
        }}
      >
        {stream ? (
          <video
            ref={ref as RefObject<HTMLVideoElement>}
            autoPlay
            playsInline
            muted={muted}
            style={{ width: "100%", height: "100%", objectFit: screen ? "contain" : "cover" }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>
            connecting…
          </div>
        )}
        <span style={tileLabel}>{label}</span>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
      {stream ? <audio ref={ref as RefObject<HTMLAudioElement>} autoPlay playsInline /> : null}
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "#334155",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
        }}
      >
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
  teamPeers,
  onInvitePeople,
  onStartSeparatePhoneCall,
}: {
  room: RoomApi
  selfName: string
  chat?: ChatProps | null
  teamPeers?: { id: string; name: string }[]
  onInvitePeople?: (ids: string[]) => void
  onStartSeparatePhoneCall?: (phone: string) => void
}) {
  const { state, participants, incoming, muted, cameraOn, isVideo, sharingScreen, speakerOn, seconds, error, selfStream } = room
  const [showChat, setShowChat] = useState(false)
  const [text, setText] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [addSel, setAddSel] = useState<Set<string>>(new Set())
  const [externalPhone, setExternalPhone] = useState("")
  const endRef = useRef<HTMLDivElement | null>(null)
  // Mobile WebViews cannot reliably getDisplayMedia — hide Share; still show remote video/screens.
  const canScreenShare = !Capacitor.isNativePlatform()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat?.messages.length, showChat])

  const remoteHasVideo = useMemo(
    () => participants.some((p) => streamHasLiveVideo(p.stream)),
    [participants],
  )
  const showVideoLayout = isVideo || sharingScreen || remoteHasVideo || streamHasLiveVideo(selfStream)
  const speakingIds = useSpeakingIds(participants)
  const speakingSet = useMemo(() => new Set(speakingIds), [speakingIds])
  const stageTiles = useMemo(() => {
    const rows = participants.map((p) => ({
      key: p.id,
      stream: p.stream,
      label: streamIsScreenShare(p.stream) ? `${p.name} (screen)` : p.name,
      screen: streamIsScreenShare(p.stream),
      muted: false,
    }))
    rows.push({
      key: "self",
      stream: selfStream,
      label: sharingScreen ? `${selfName} (screen)` : selfName,
      screen: sharingScreen,
      muted: true,
    })
    return rows
  }, [participants, selfStream, selfName, sharingScreen])
  const visibleTiles = useMemo(
    () => pickVisibleStageTiles(stageTiles, { max: MAX_VISIBLE_MOBILE, speakingIds }),
    [stageTiles, speakingIds],
  )
  const hiddenCount = Math.max(0, stageTiles.length - visibleTiles.length)
  const videoGrid = videoGridLayout(visibleTiles.length)
  const remoteScreenSharer = participants.find((p) => streamIsScreenShare(p.stream))
  const anyScreenShare = sharingScreen || Boolean(remoteScreenSharer)

  const addablePeers = useMemo(() => {
    const inCall = new Set(participants.map((p) => p.id))
    return (teamPeers ?? []).filter((p) => !inCall.has(p.id))
  }, [teamPeers, participants])
  const externalPhoneValid = externalPhone.replace(/\D/g, "").length >= 10

  if (state === "incoming" && incoming) {
    return (
      <div style={fullscreen}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "#334155",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 28,
            }}
          >
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

  function toggleAdd(id: string) {
    setAddSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmAdd() {
    if (!onInvitePeople || addSel.size === 0) {
      setAddOpen(false)
      return
    }
    onInvitePeople([...addSel])
    setAddSel(new Set())
    setAddOpen(false)
  }

  return (
    <div style={fullscreen}>
      <div style={{ textAlign: "center", padding: "16px 12px 4px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>
          {stateText}
          {sharingScreen ? " · Sharing screen" : ""}
          {remoteHasVideo && !sharingScreen && !isVideo ? " · Screen / video incoming" : ""}
          {hiddenCount > 0 ? ` · +${hiddenCount} more` : ""}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: showVideoLayout ? "hidden" : "auto", padding: 12, display: "flex", flexDirection: "column" }}>
        {showVideoLayout ? (
          anyScreenShare ? (
            (() => {
              const mainKey = sharingScreen ? "self" : remoteScreenSharer?.id ?? "self"
              const main = visibleTiles.find((t) => t.key === mainKey) ?? visibleTiles[0]
              const thumbs = visibleTiles.filter((t) => t.key !== mainKey)
              return (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", gap: 8, overflow: "hidden" }}>
                  <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
                    {main ? (
                      <RemoteMedia
                        stream={main.stream}
                        video
                        muted={main.muted}
                        label={main.label}
                        screen
                        fill
                        speaking={speakingSet.has(main.key)}
                      />
                    ) : null}
                  </div>
                  {thumbs.length > 0 ? (
                    <div style={{ width: 92, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, minHeight: 0, overflowY: "auto" }}>
                      {thumbs.map((t) => (
                        <RemoteMedia
                          key={t.key}
                          stream={t.stream}
                          video
                          muted={t.muted}
                          label={t.label}
                          screen={t.screen}
                          thumbnail
                          speaking={speakingSet.has(t.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })()
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "grid",
                gridTemplateColumns: `repeat(${videoGrid.columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${videoGrid.rows}, minmax(0, 1fr))`,
                gap: 8,
                overflow: "hidden",
              }}
            >
              {visibleTiles.map((t) => (
                <RemoteMedia
                  key={t.key}
                  stream={t.stream}
                  video
                  muted={t.muted}
                  label={t.label}
                  screen={t.screen}
                  fill
                  speaking={speakingSet.has(t.key)}
                />
              ))}
            </div>
          )
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
          <div
            style={{
              marginTop: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              maxHeight: 220,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {chat.messages.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center" }}>Message while you talk</div>
              ) : (
                chat.messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                    {!m.mine ? <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{m.senderLabel}</div> : null}
                    <div
                      style={{
                        padding: "7px 10px",
                        borderRadius: 10,
                        background: m.mine ? "#f97316" : "#1e293b",
                        color: "#fff",
                        fontSize: 14,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.body}
                    </div>
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

      {addOpen ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 110,
            maxHeight: "45%",
            overflow: "auto",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 12,
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ flex: 1, color: "#fff", fontSize: 14 }}>Team call vs phone call</strong>
            <button type="button" onClick={() => setAddOpen(false)} style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>
              ×
            </button>
          </div>
          <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: 12, lineHeight: 1.45 }}>
            Team calls stay on Tradesman (invite below). Outside numbers use a separate Twilio business-line call — not mixed into this room.
          </p>
          {onInvitePeople ? (
            <>
              <div style={{ color: "#5eead4", fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>Invite teammate · team call</div>
              {addablePeers.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 13, padding: 8 }}>Everyone on your team is already on this call (or no teammates loaded).</div>
              ) : (
                addablePeers.map((p) => {
                  const on = addSel.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleAdd(p.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 8px",
                        border: "none",
                        borderBottom: "1px solid #334155",
                        background: on ? "#1d4ed8" : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `2px solid ${on ? "#fff" : "#64748b"}`,
                          background: on ? "#fff" : "transparent",
                          color: "#1d4ed8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                        }}
                      >
                        {on ? "✓" : ""}
                      </span>
                      {p.name}
                    </button>
                  )
                })
              )}
              <button
                type="button"
                onClick={confirmAdd}
                disabled={addSel.size === 0}
                style={{
                  marginTop: 10,
                  width: "100%",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px",
                  background: addSel.size ? "#f97316" : "#334155",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: addSel.size ? "pointer" : "default",
                }}
              >
                {addSel.size ? `Invite (${addSel.size}) to team call` : "Select teammates"}
              </button>
            </>
          ) : addablePeers.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: 8 }}>No teammates available to invite on this call.</div>
          ) : null}
          {onStartSeparatePhoneCall ? (
            <div style={{ borderTop: "1px solid #334155", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
              <div style={{ color: "#fdba74", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>External phone · Twilio call</div>
              <p style={{ margin: 0, color: "#cbd5e1", fontSize: 12, lineHeight: 1.45 }}>
                Ends this team call, then starts a separate business-line phone call from your Tradesman number.
              </p>
              <input
                type="tel"
                inputMode="tel"
                value={externalPhone}
                onChange={(e) => setExternalPhone(e.target.value)}
                placeholder="(555) 123-4567"
                style={{ borderRadius: 8, border: "1px solid #475569", background: "#0f172a", color: "#fff", padding: "11px", fontSize: 15 }}
              />
              <button
                type="button"
                disabled={!externalPhoneValid}
                onClick={() => onStartSeparatePhoneCall(externalPhone)}
                style={{ border: "none", borderRadius: 10, padding: "12px", background: externalPhoneValid ? "#b45309" : "#334155", color: "#fff", fontWeight: 800, cursor: externalPhoneValid ? "pointer" : "default" }}
              >
                Leave team call &amp; start phone call
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, padding: "10px 12px calc(14px + env(safe-area-inset-bottom))", justifyContent: "center", flexWrap: "wrap" }}>
        <ControlBtn label={muted ? "Unmute" : "Mute"} sub="Microphone" onClick={room.toggleMute} mutedLook={muted} />
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
        {(onInvitePeople && (teamPeers?.length ?? 0) > 0) || onStartSeparatePhoneCall ? (
          <ControlBtn label={addOpen ? "Close" : "Invite / phone"} sub="Team or Twilio" onClick={() => setAddOpen((v) => !v)} active={addOpen} />
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
