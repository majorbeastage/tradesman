import { useMemo, useState } from "react"
import type { PortalConfig, PortalSettingItem } from "../../types/portal-builder"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import {
  buildPortalAssistantCatalogText,
  buildPortalAssistantUserContext,
  parsePortalItemsSuggestionFromAssistantText,
  type ParsedItemsSuggestion,
} from "../../lib/portalAssistantCatalog"

type ChatMessage = { role: "user" | "assistant"; content: string }

type Props = {
  previewPage: string
  selectedControl: { tab: string; controlId: string } | null
  config: PortalConfig
  onApplyControlItems: (tabId: string, controlId: string, items: PortalSettingItem[]) => void
  onApplyControlItemsPatch: (patch: Record<string, PortalSettingItem[]>) => void
}

const STORAGE_KEY = "tradesman_admin_portal_assistant_open"

export default function AdminPortalAssistant({
  previewPage,
  selectedControl,
  config,
  onApplyControlItems,
  onApplyControlItemsPatch,
}: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "0"
    } catch {
      return true
    }
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [invokeError, setInvokeError] = useState<string | null>(null)

  const pageContext = useMemo(
    () =>
      buildPortalAssistantUserContext({
        previewPage,
        selectedTabId: selectedControl?.tab ?? null,
        selectedControlId: selectedControl?.controlId ?? null,
        config,
      }),
    [previewPage, selectedControl, config]
  )

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const parsedSuggestion = lastAssistant ? parsePortalItemsSuggestionFromAssistantText(lastAssistant.content) : null

  function persistOpen(next: boolean) {
    setOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    if (!supabase) {
      setInvokeError("Supabase client is not configured.")
      return
    }
    setInvokeError(null)
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke<{ reply?: string; error?: string; detail?: string }>(
        "portal-assistant",
        { body: { messages: nextMessages, pageContext } }
      )
      if (error) {
        setInvokeError(error.message ?? "Function invoke failed")
        return
      }
      if (data?.error) {
        setInvokeError(data.detail ? `${data.error}: ${data.detail}` : data.error)
        return
      }
      const reply = data?.reply?.trim()
      if (!reply) {
        setInvokeError("No reply from assistant.")
        return
      }
      setMessages((prev) => [...prev, { role: "assistant", content: reply }])
    } finally {
      setLoading(false)
    }
  }

  function applyParsed(s: ParsedItemsSuggestion) {
    if (s.kind === "items") {
      if (
        !window.confirm(
          `Replace items for ${s.tabId}:${s.controlId} with ${s.items.length} item(s) from the assistant? Save portal config when done.`
        )
      )
        return
      onApplyControlItems(s.tabId, s.controlId, s.items)
    } else {
      const keys = Object.keys(s.controlItemsPatch)
      if (!window.confirm(`Apply patch to ${keys.length} control key(s)? Save portal config when done.`)) return
      onApplyControlItemsPatch(s.controlItemsPatch)
    }
  }

  return (
    <section
      style={{
        marginBottom: 20,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "white",
      }}
    >
      <button
        type="button"
        onClick={() => persistOpen(!open)}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: open ? "rgba(249,115,22,0.12)" : theme.background,
          color: theme.text,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>Portal assistant (AI)</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 14px 14px", borderTop: `1px solid ${theme.border}` }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.text, opacity: 0.85, lineHeight: 1.45 }}>
            Ask where to put checkboxes and dependent dropdowns, which <code>tabId:controlId</code> key to use, or why options
            do not appear in the live app. Deploy the <code>portal-assistant</code> Edge Function and set{" "}
            <code>OPENAI_API_KEY</code> in Supabase secrets.
          </p>
          <details style={{ marginBottom: 12, fontSize: 12 }}>
            <summary style={{ cursor: "pointer", color: theme.text, opacity: 0.9 }}>Offline reference (same rules the model uses)</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: "rgba(0,0,0,0.04)",
                borderRadius: 6,
                maxHeight: 180,
                overflow: "auto",
                fontSize: 11,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
              }}
            >
              {buildPortalAssistantCatalogText()}
            </pre>
          </details>
          <div
            style={{
              maxHeight: 220,
              overflow: "auto",
              marginBottom: 10,
              padding: 10,
              background: "rgba(0,0,0,0.03)",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {messages.length === 0 && (
              <p style={{ margin: 0, color: theme.text, opacity: 0.65 }}>
                Example: “I added a recurring checkbox in Calendar Job Types but it does not show when I click Add item to
                calendar — where should it go?”
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 10, color: theme.text }}>
                <strong style={{ color: m.role === "user" ? theme.primary : "#6366f1" }}>
                  {m.role === "user" ? "You" : "Assistant"}
                </strong>
                <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{m.content}</div>
              </div>
            ))}
          </div>
          {invokeError && (
            <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{invokeError}</p>
          )}
          {parsedSuggestion && (
            <div style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: theme.text }}>Detected config JSON in the last reply.</span>
              <button
                type="button"
                onClick={() => applyParsed(parsedSuggestion)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "#4f46e5",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Apply to portal config (draft)
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder="Describe what you want users to see…"
              rows={2}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                fontSize: 13,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: loading ? theme.border : theme.primary,
                color: "white",
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                alignSelf: "flex-end",
              }}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
