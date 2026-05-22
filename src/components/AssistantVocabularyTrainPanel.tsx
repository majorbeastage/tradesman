import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import type { AssistantCustomVocabularyEntry } from "../lib/platformAssistantCustomVocabulary"
import {
  askPlatformAssistantVocabularyCoach,
  describeCustomAction,
  proposalToDraftEntry,
  type VocabularyTrainChatTurn,
  type VocabularyTrainProposal,
} from "../lib/platformAssistantVocabularyTrain"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"

const AMBER = "#d97706"
const AMBER_DARK = "#b45309"
const TEXT = "#0f172a"
const TEXT_MUTED = "#475569"

type Props = {
  open: boolean
  onClose: () => void
  initialPhrase?: string
  selectedCustomerName?: string | null
  routingCatalog: string
  trainContext?: {
    platform?: string
    currentPage?: string
  }
  entries: AssistantCustomVocabularyEntry[]
  saveBusy: boolean
  saveError: string | null
  onSave: (entry: Omit<AssistantCustomVocabularyEntry, "id" | "createdAt" | "createdBy">) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const PLACEHOLDER =
  "Tell me what the customer said, what went wrong, and what should happen instead… (mic works too)"

function MicIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" fill="currentColor" />
      <path
        d="M19 11a7 7 0 01-14 0M12 18v3M8 21h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function AssistantVocabularyTrainPanel({
  open,
  onClose,
  initialPhrase = "",
  selectedCustomerName,
  routingCatalog,
  trainContext,
  entries,
  saveBusy,
  saveError,
  onSave,
  onDelete,
}: Props) {
  const [chatInput, setChatInput] = useState("")
  const [chatHistory, setChatHistory] = useState<VocabularyTrainChatTurn[]>([])
  const [coachBusy, setCoachBusy] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<VocabularyTrainProposal[]>([])
  const [readyToSave, setReadyToSave] = useState(false)
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [savedOpen, setSavedOpen] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const {
    speechSupported,
    listening: voiceListening,
    toggleListening,
    stopListening,
  } = useSpeechRecognitionInput(setChatInput, { preferLiveTranscript: true })

  useEffect(() => {
    if (!open) {
      stopListening()
      return
    }
    if (initialPhrase.trim()) setChatInput(initialPhrase.trim())
    const t = window.setTimeout(() => inputRef.current?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [open, initialPhrase, stopListening])

  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [open, chatHistory, proposals, coachBusy, quickReplies])

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)),
    [entries],
  )

  const sendCoachMessage = useCallback(
    async (text: string) => {
      const msg = text.trim()
      if (msg.length < 2 || coachBusy) return
      setCoachError(null)
      setProposals([])
      setReadyToSave(false)
      setQuickReplies([])
      setCoachBusy(true)
      stopListening()

      const priorHistory = chatHistory
      setChatHistory((h) => [...h, { role: "user", content: msg }])
      setChatInput("")

      try {
        if (!supabase) throw new Error("Not connected.")
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error("Sign in again to use the training coach.")

        const res = await askPlatformAssistantVocabularyCoach(token, {
          message: msg,
          catalog: routingCatalog,
          context: {
            platform: trainContext?.platform,
            currentPage: trainContext?.currentPage,
            selectedCustomerName,
          },
          history: priorHistory,
        })

        setChatHistory((h) => [...h, { role: "assistant", content: res.reply }])
        setReadyToSave(Boolean(res.readyToSave))
        if (res.proposals?.length) setProposals(res.proposals)
        if (res.clarifyingQuestions?.length) setQuickReplies(res.clarifyingQuestions)
      } catch (e) {
        const err = e instanceof Error ? e.message : "Coach request failed."
        setCoachError(err)
        setChatHistory((h) => [...h, { role: "assistant", content: err }])
      } finally {
        setCoachBusy(false)
      }
    },
    [chatHistory, coachBusy, routingCatalog, selectedCustomerName, stopListening, trainContext],
  )

  const applyProposal = useCallback(
    async (p: VocabularyTrainProposal) => {
      await onSave(proposalToDraftEntry(p))
      setProposals((list) => list.filter((x) => x.phrase !== p.phrase))
      if (proposals.length <= 1) {
        setReadyToSave(false)
        setChatHistory((h) => [
          ...h,
          {
            role: "assistant",
            content: "Saved. That phrase is live for everyone now. Anything else to train?",
          },
        ])
      }
    },
    [onSave, proposals.length],
  )

  const applyAllProposals = useCallback(async () => {
    for (const p of proposals) {
      await onSave(proposalToDraftEntry(p))
    }
    setProposals([])
    setReadyToSave(false)
    setChatHistory((h) => [
      ...h,
      { role: "assistant", content: "Saved all phrases — they are live now. What should we tackle next?" },
    ])
  }, [onSave, proposals])

  const toggleTrainMic = useCallback(() => {
    if (!speechSupported) return
    toggleListening(chatInput)
  }, [chatInput, speechSupported, toggleListening])

  const canSend = chatInput.trim().length >= 2 && !coachBusy

  if (!open) return null

  const panelBottom = "max(88px, calc(80px + env(safe-area-inset-bottom, 0px)))"

  return (
    <div
      role="dialog"
      aria-label="Train platform assistant"
      style={{
        position: "fixed",
        zIndex: 10051,
        right: 12,
        bottom: panelBottom,
        width: "min(420px, calc(100vw - 24px))",
        height: "min(72vh, 640px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        border: `2px solid ${AMBER}`,
        background: "#ffffff",
        color: TEXT,
        boxShadow: "0 12px 40px rgba(15,23,42,0.22)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: "12px 14px 10px",
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Training assistant</div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.45, marginTop: 4 }}>
              Talk or type like you would to a teammate. I will ask follow-ups until we agree, then save what customers
              should say.
            </div>
            {selectedCustomerName ? (
              <div style={{ fontSize: 11, color: AMBER_DARK, marginTop: 6 }}>
                Customer on screen: <strong>{selectedCustomerName}</strong>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: TEXT,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 14px",
          background: "#fafafa",
        }}
      >
        {chatHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5, padding: "8px 4px" }}>
            <p style={{ margin: "0 0 10px" }}>
              Example: &ldquo;On the Customers tab they said &lsquo;start a quote for this guy&rsquo; and nothing
              happened.&rdquo;
            </p>
            <p style={{ margin: 0 }}>Use the mic or type below — no forms or dropdowns required.</p>
          </div>
        ) : (
          chatHistory.map((turn, i) => (
            <div
              key={`${turn.role}-${i}`}
              style={{
                marginBottom: 10,
                display: "flex",
                justifyContent: turn.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "92%",
                  padding: "10px 12px",
                  borderRadius: turn.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  background: turn.role === "user" ? "#fffbeb" : "#fff",
                  border: `1px solid ${turn.role === "user" ? AMBER : theme.border}`,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: TEXT,
                  whiteSpace: "pre-wrap",
                }}
              >
                {turn.content}
              </div>
            </div>
          ))
        )}

        {coachBusy ? (
          <div style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: "italic", padding: "4px 0" }}>Thinking…</div>
        ) : null}

        {quickReplies.length > 0 && !coachBusy ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, marginBottom: 8 }}>
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendCoachMessage(q)}
                style={{
                  fontSize: 11,
                  padding: "6px 10px",
                  borderRadius: 16,
                  border: `1px solid ${AMBER}`,
                  background: "#fff",
                  color: TEXT,
                  cursor: "pointer",
                  lineHeight: 1.3,
                  textAlign: "left",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        {readyToSave && proposals.length > 0 ? (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Ready to turn on</div>
            {proposals.map((p) => (
              <div
                key={p.phrase}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 10,
                  border: `2px solid ${AMBER}`,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.4 }}>
                  {p.label || `When someone says “${p.phrase}”`}
                </div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>{describeCustomAction(p.action)}</div>
                {p.note ? (
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4, fontStyle: "italic" }}>{p.note}</div>
                ) : null}
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => void applyProposal(p)}
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: saveBusy ? "#fcd34d" : AMBER,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saveBusy ? "wait" : "pointer",
                  }}
                >
                  Turn this on
                </button>
              </div>
            ))}
            {proposals.length > 1 ? (
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void applyAllProposals()}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `2px solid ${AMBER}`,
                  background: "#fff",
                  color: AMBER_DARK,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saveBusy ? "wait" : "pointer",
                }}
              >
                Turn on all {proposals.length} phrases
              </button>
            ) : null}
          </div>
        ) : null}

        {coachError && !coachBusy ? (
          <p style={{ fontSize: 11, color: "#b91c1c", margin: "8px 0" }}>{coachError}</p>
        ) : null}
        {saveError ? <p style={{ fontSize: 11, color: "#b91c1c", margin: "8px 0" }}>{saveError}</p> : null}

        <div ref={chatEndRef} />
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "10px 12px 12px",
          borderTop: `1px solid ${theme.border}`,
          background: "#fff",
        }}
      >
        <textarea
          ref={inputRef}
          rows={3}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (canSend) void sendCoachMessage(chatInput)
            }
          }}
          placeholder={PLACEHOLDER}
          disabled={coachBusy}
          aria-label="Message to training assistant"
          style={{
            display: "block",
            width: "100%",
            marginBottom: 8,
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${voiceListening ? AMBER : theme.border}`,
            fontSize: 14,
            color: TEXT,
            background: voiceListening ? "#fffbeb" : "#fff",
            boxSizing: "border-box",
            resize: "none",
            lineHeight: 1.45,
            outline: voiceListening ? `2px solid ${AMBER}` : "none",
          }}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            title={voiceListening ? "Stop dictation" : "Dictate with microphone"}
            aria-label={voiceListening ? "Stop dictation" : "Start dictation"}
            disabled={!speechSupported || coachBusy}
            onClick={toggleTrainMic}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: `2px solid ${voiceListening ? AMBER : theme.border}`,
              background: voiceListening ? AMBER : "#f8fafc",
              color: voiceListening ? "#fff" : TEXT,
              cursor: speechSupported && !coachBusy ? "pointer" : "not-allowed",
              opacity: speechSupported ? 1 : 0.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 0,
            }}
          >
            <MicIcon />
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendCoachMessage(chatInput)}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: canSend ? AMBER : "#e2e8f0",
              color: canSend ? "#fff" : TEXT_MUTED,
              fontWeight: 600,
              fontSize: 14,
              cursor: canSend ? "pointer" : "not-allowed",
            }}
          >
            Send
          </button>
        </div>
        {!speechSupported ? (
          <p style={{ fontSize: 10, color: TEXT_MUTED, margin: "6px 0 0", textAlign: "center" }}>
            Voice dictation is not available in this browser — typing still works.
          </p>
        ) : null}
      </div>

      {sortedEntries.length > 0 ? (
        <div style={{ flexShrink: 0, borderTop: `1px solid ${theme.border}`, background: "#fff" }}>
          <button
            type="button"
            onClick={() => setSavedOpen((o) => !o)}
            style={{
              width: "100%",
              padding: "8px 14px",
              border: "none",
              background: "transparent",
              color: TEXT_MUTED,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {savedOpen ? "▾" : "▸"} Live phrases ({sortedEntries.length})
          </button>
          {savedOpen ? (
            <ul
              style={{
                margin: 0,
                padding: "0 14px 10px",
                listStyle: "none",
                fontSize: 11,
                color: TEXT,
                maxHeight: 120,
                overflowY: "auto",
              }}
            >
              {sortedEntries.slice(0, 20).map((e) => (
                <li
                  key={e.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "5px 0",
                    borderTop: `1px solid ${theme.border}`,
                  }}
                >
                  <span style={{ flex: 1, lineHeight: 1.35 }}>
                    <strong>{e.phrase}</strong>
                    <span style={{ color: TEXT_MUTED }}> → {describeCustomAction(e.action)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDelete(e.id)}
                    disabled={saveBusy}
                    style={{
                      fontSize: 10,
                      color: "#b91c1c",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
