import { useEffect, useRef, useState } from "react"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"
import { theme } from "../styles/theme"
import { useLocale } from "../i18n/LocaleContext"

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(pointer: coarse)")
    const apply = () => setCoarse(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])
  return coarse
}

/** Persistent help-desk AI chat — bottom-right, follows the user across tabs until closed. */
export default function HelpDeskChatPanel() {
  const ga = useGlobalAssistantOptional()
  const { t } = useLocale()
  const isMobile = useCoarsePointer()
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const open = ga?.helpDeskChatOpen ?? false
  const messages = ga?.helpDeskChatMessages ?? []
  const busy = ga?.assistantBusy ?? false

  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [open, messages.length, busy])

  useEffect(() => {
    if (!open) return
    const tid = window.setTimeout(() => inputRef.current?.focus(), 120)
    return () => window.clearTimeout(tid)
  }, [open])

  if (!ga || !open) return null

  const assistant = ga

  async function handleSend() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft("")
    await assistant.sendHelpDeskChatMessage(text)
  }

  const bottomOffset = isMobile
    ? "max(88px, calc(76px + env(safe-area-inset-bottom, 0px)))"
    : "max(96px, calc(84px + env(safe-area-inset-bottom, 0px)))"

  return (
    <div
      role="dialog"
      aria-label={t("sidebar.aiChat")}
      style={{
        position: "fixed",
        zIndex: 10048,
        right: isMobile ? 10 : 20,
        bottom: bottomOffset,
        width: isMobile ? "min(calc(100vw - 20px), 360px)" : 380,
        maxHeight: isMobile ? "min(62vh, 480px)" : "min(68vh, 520px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 14,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        boxShadow: "0 20px 48px rgba(15,23,42,0.22)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          borderBottom: `1px solid ${theme.border}`,
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 70%)",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{t("sidebar.aiChat")}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{t("helpDeskChat.subtitle")}</div>
        </div>
        <button
          type="button"
          onClick={() => assistant.closeHelpDeskChat()}
          aria-label={t("helpDeskChat.close")}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            color: theme.text,
          }}
        >
          ×
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "#f8fafc",
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: "10px 12px",
              borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: m.role === "user" ? theme.primary : "#fff",
              color: m.role === "user" ? "#fff" : theme.text,
              fontSize: 13,
              lineHeight: 1.5,
              border: m.role === "user" ? "none" : `1px solid ${theme.border}`,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}
        {busy ? (
          <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{t("helpDeskChat.thinking")}</div>
        ) : null}
      </div>

      <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${theme.border}`, background: "#fff" }}>
        <textarea
          ref={inputRef}
          rows={2}
          value={draft}
          disabled={busy}
          placeholder={t("helpDeskChat.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          style={{
            ...theme.formInput,
            width: "100%",
            resize: "none",
            marginBottom: 8,
            fontSize: 14,
          }}
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void handleSend()}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: busy || !draft.trim() ? "#cbd5e1" : theme.primary,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: busy || !draft.trim() ? "not-allowed" : "pointer",
          }}
        >
          {busy ? t("helpDeskChat.sending") : t("helpDeskChat.send")}
        </button>
      </div>
    </div>
  )
}
