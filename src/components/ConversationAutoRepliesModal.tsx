/**
 * Same automatic-replies UX as Conversations (profile metadata: conversationsAutomaticRepliesValues).
 * Used from Conversations-like hubs (e.g. Customers) without duplicating the entire page.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import PortalSettingItemsForm from "./PortalSettingItemsForm"
import {
  getControlItemsForUser,
  isPortalSettingDependencyVisible,
  type PortalConfig,
  type PortalSettingItem,
} from "../types/portal-builder"
import { carryConversationAutoRepliesToQuoteValues } from "../lib/automaticRepliesCarryOver"

const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

function formatAppError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export type ConversationAutoRepliesModalProps = {
  open: boolean
  onClose: () => void
  userId: string | null
  portalConfig: PortalConfig | null
  aiAutomationsEnabled: boolean
  /** Hide “Carry over these settings to Quotes tab” (Customers hub primary comms). */
  hideCarryOverToQuotes?: boolean
}

export default function ConversationAutoRepliesModal({
  open,
  onClose,
  userId,
  portalConfig,
  aiAutomationsEnabled,
  hideCarryOverToQuotes,
}: ConversationAutoRepliesModalProps) {
  const automaticRepliesItems = useMemo(
    () => getControlItemsForUser(portalConfig, "conversations", "automatic_replies", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const conversationSourceOptions = useMemo(() => {
    const methodItem = automaticRepliesItems.find((i) => i.id === "conv_auto_reply_method")
    return methodItem?.options?.length ? methodItem.options : ["Email", "Text message", "Phone call"]
  }, [automaticRepliesItems])

  const [autoRepliesFormValues, setAutoRepliesFormValues] = useState<Record<string, string>>({})
  const [conversationsAutoRepliesProfile, setConversationsAutoRepliesProfile] = useState<Record<string, string>>({})
  const [conversationSourceFlowConfigs, setConversationSourceFlowConfigs] = useState<Record<string, Record<string, string>>>(
    {},
  )
  const [expandedConversationSourceKey, setExpandedConversationSourceKey] = useState<string | null>(null)
  const [autoRepliesRecordingBusy, setAutoRepliesRecordingBusy] = useState(false)
  const [autoRepliesUploading, setAutoRepliesUploading] = useState(false)
  const [autoRepliesRecordingSupported, setAutoRepliesRecordingSupported] = useState(false)
  const autoRepliesMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const autoRepliesRecordedChunksRef = useRef<Blob[]>([])
  const autoRepliesMediaStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setAutoRepliesRecordingSupported(
      typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    )
  }, [])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (cancelled) return
      if (error || !data) return
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const raw = meta.conversationsAutomaticRepliesValues
      const saved =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.fromEntries(
              Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
            )
          : {}
      setConversationsAutoRepliesProfile(saved)
      const sourceRaw = meta.conversationsAutomaticRepliesSourceFlows
      const sourceSaved =
        sourceRaw && typeof sourceRaw === "object" && !Array.isArray(sourceRaw)
          ? Object.fromEntries(
              Object.entries(sourceRaw as Record<string, unknown>).map(([k, v]) => [
                k,
                v && typeof v === "object" && !Array.isArray(v)
                  ? Object.fromEntries(
                      Object.entries(v as Record<string, unknown>).map(([ik, iv]) => [ik, typeof iv === "string" ? iv : String(iv ?? "")]),
                    )
                  : {},
              ]),
            )
          : {}
      setConversationSourceFlowConfigs(sourceSaved)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!open || automaticRepliesItems.length === 0) return
    const base: Record<string, string> = {}
    for (const item of automaticRepliesItems) {
      const saved = conversationsAutoRepliesProfile[item.id]
      if (item.type === "checkbox") {
        base[item.id] = saved === "checked" || saved === "unchecked" ? saved : item.defaultChecked ? "checked" : "unchecked"
      } else if (item.type === "dropdown" && item.options?.length) {
        base[item.id] = saved && item.options.includes(saved) ? saved : item.options[0]
      } else {
        base[item.id] = saved ?? ""
      }
    }
    setAutoRepliesFormValues(base)
  }, [open, automaticRepliesItems, conversationsAutoRepliesProfile])

  function isAutomaticRepliesItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, automaticRepliesItems, autoRepliesFormValues)
  }

  async function closeAutomaticRepliesModal() {
    if (!supabase || !userId) {
      onClose()
      return
    }
    const { data: row, error: loadErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    if (loadErr) {
      alert(loadErr.message)
      return
    }
    const prevMeta =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    prevMeta.conversationsAutomaticRepliesValues = { ...autoRepliesFormValues }
    prevMeta.conversationsAutomaticRepliesSourceFlows = { ...conversationSourceFlowConfigs }
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setConversationsAutoRepliesProfile({ ...autoRepliesFormValues })
    onClose()
  }

  function saveCurrentConversationSourceFlow() {
    const source = (autoRepliesFormValues.conv_auto_reply_method || conversationSourceOptions[0] || "Email").trim()
    if (!source) return
    const next: Record<string, string> = {}
    for (const item of automaticRepliesItems) {
      next[item.id] = autoRepliesFormValues[item.id] ?? ""
    }
    next.conv_auto_reply_method = source
    setConversationSourceFlowConfigs((prev) => ({ ...prev, [source]: next }))
    setExpandedConversationSourceKey(source)
  }

  async function carryOverAutoRepliesToQuotesProfile() {
    if (!supabase || !userId) {
      alert("Sign in to save.")
      return
    }
    const quoteItems = getControlItemsForUser(portalConfig, "quotes", "auto_response_options", { aiAutomationsEnabled })
    const idSet = new Set(quoteItems.map((i) => i.id))
    const merged = carryConversationAutoRepliesToQuoteValues(autoRepliesFormValues, idSet)
    const { data: row, error: loadErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    if (loadErr) {
      alert(loadErr.message)
      return
    }
    const prevMeta =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const prevQ = prevMeta.quotesAutomaticRepliesValues
    const existing =
      prevQ && typeof prevQ === "object" && !Array.isArray(prevQ)
        ? Object.fromEntries(
            Object.entries(prevQ as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
          )
        : {}
    prevMeta.quotesAutomaticRepliesValues = { ...existing, ...merged }
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    alert("Copied these settings to Quotes → Automatic replies. Open Quotes to review; custom text fields there stay empty until you fill them.")
  }

  async function uploadConversationsAutoVoiceBlob(blob: Blob, extension: string, contentType: string) {
    if (!supabase || !userId) return
    setAutoRepliesUploading(true)
    try {
      const filePath = `${userId}/conv-auto-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from(VOICEMAIL_GREETING_BUCKET).upload(filePath, blob, { upsert: true, contentType })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath)
      const publicUrl = data.publicUrl
      setAutoRepliesFormValues((prev) => ({ ...prev, conv_auto_phone_recording_url: publicUrl }))
    } catch (err) {
      alert(formatAppError(err))
    } finally {
      setAutoRepliesUploading(false)
    }
  }

  async function startAutoRepliesRecording() {
    if (!autoRepliesRecordingSupported) {
      alert("This browser does not support microphone recording.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType })
      autoRepliesRecordedChunksRef.current = []
      autoRepliesMediaStreamRef.current = stream
      autoRepliesMediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) autoRepliesRecordedChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(autoRepliesRecordedChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        autoRepliesMediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        autoRepliesMediaStreamRef.current = null
        autoRepliesMediaRecorderRef.current = null
        setAutoRepliesRecordingBusy(false)
        if (blob.size) await uploadConversationsAutoVoiceBlob(blob, "webm", blob.type || "audio/webm")
      }
      recorder.start()
      setAutoRepliesRecordingBusy(true)
    } catch (err) {
      autoRepliesMediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      autoRepliesMediaStreamRef.current = null
      autoRepliesMediaRecorderRef.current = null
      setAutoRepliesRecordingBusy(false)
      alert(formatAppError(err))
    }
  }

  function stopAutoRepliesRecording() {
    if (autoRepliesMediaRecorderRef.current && autoRepliesMediaRecorderRef.current.state !== "inactive") {
      autoRepliesMediaRecorderRef.current.stop()
    }
  }

  if (!open) return null

  return (
    <>
      <div
        role="presentation"
        onClick={() => void closeAutomaticRepliesModal()}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          zIndex: 9999,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>
            {portalConfig?.controlLabels?.automatic_replies ?? "Automatic replies"}
          </h3>
          <button
            type="button"
            onClick={() => void closeAutomaticRepliesModal()}
            style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}
          >
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
          Preferences are saved to your profile. Outbound automation (send, call, AI) runs on the server when those features are enabled for your account.
        </p>
        <details open style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#f8fafc", padding: "10px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: theme.text }}>Core automatic reply settings</summary>
          <div style={{ marginTop: 10 }}>
            <PortalSettingItemsForm
              items={automaticRepliesItems}
              formValues={autoRepliesFormValues}
              setFormValue={(id, value) => setAutoRepliesFormValues((prev) => ({ ...prev, [id]: value }))}
              isItemVisible={isAutomaticRepliesItemVisible}
            />
          </div>
        </details>
        <details style={{ marginTop: 12, border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff", padding: "10px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: theme.text }}>Save source flow</summary>
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Save a full automatic-reply setup by contact method, then switch methods to apply saved flows.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ fontSize: 12, color: theme.text }}>
                Contact method
                <select
                  value={autoRepliesFormValues.conv_auto_reply_method ?? conversationSourceOptions[0]}
                  onChange={(e) => {
                    const source = e.target.value
                    setAutoRepliesFormValues((prev) => {
                      const saved = conversationSourceFlowConfigs[source]
                      if (!saved) return { ...prev, conv_auto_reply_method: source }
                      return { ...prev, ...saved, conv_auto_reply_method: source }
                    })
                  }}
                  style={{ ...theme.formInput, marginTop: 4, minWidth: 180 }}
                >
                  {conversationSourceOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={saveCurrentConversationSourceFlow}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save source flow
              </button>
            </div>
            {Object.keys(conversationSourceFlowConfigs).length > 0 ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#334155" }}>Saved source flows</p>
                {Object.entries(conversationSourceFlowConfigs).map(([source, cfg]) => {
                  const expanded = expandedConversationSourceKey === source
                  return (
                    <div key={source} style={{ border: `1px solid ${theme.border}`, borderRadius: 6, background: "#fff" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedConversationSourceKey((prev) => (prev === source ? null : source))}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          background: "transparent",
                          fontWeight: 700,
                          color: theme.text,
                          cursor: "pointer",
                        }}
                      >
                        {expanded ? "▾" : "▸"} {source}
                      </button>
                      {expanded ? (
                        <div style={{ padding: "0 10px 10px", fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                          <div>Auto reply: {(cfg.conv_auto_reply_enabled ?? "unchecked") === "checked" ? "On" : "Off"}</div>
                          <div>AI enabled: {(cfg.conv_auto_reply_ai ?? "unchecked") === "checked" ? "On" : "Off"}</div>
                          <div>
                            Template: {(cfg.conv_auto_reply_message ?? "").trim() ? (cfg.conv_auto_reply_message ?? "").trim().slice(0, 140) : "(empty)"}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </details>
        {autoRepliesFormValues.conv_auto_reply_method === "Phone call" &&
          autoRepliesFormValues.conv_auto_phone_allow_automation === "checked" && (
            <details style={{ marginTop: 14, border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff", padding: "10px 12px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: theme.text }}>Phone call automation details</summary>
              <div style={{ marginTop: 10, fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                <strong style={{ color: theme.text }}>Prerecorded / AI-assisted voice:</strong> when calls are placed, the platform will play an introductory notice such as
                &quot;This is a prerecorded message&quot; before your content (required for automated outreach; exact wording may follow your counsel and carrier rules).
              </div>
            </details>
          )}
        {autoRepliesFormValues.conv_auto_phone_delivery === "Record in app" &&
          autoRepliesFormValues.conv_auto_phone_allow_automation === "checked" &&
          autoRepliesFormValues.conv_auto_reply_method === "Phone call" && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: theme.text }}>Record in browser</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {!autoRepliesRecordingBusy ? (
                  <button
                    type="button"
                    disabled={!autoRepliesRecordingSupported || autoRepliesUploading}
                    onClick={() => void startAutoRepliesRecording()}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      cursor: autoRepliesRecordingSupported && !autoRepliesUploading ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      fontSize: 13,
                      color: theme.text,
                    }}
                  >
                    {autoRepliesUploading ? "Uploading…" : "Start recording"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => stopAutoRepliesRecording()}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid #fca5a5`,
                      background: "#fef2f2",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                      color: "#b91c1c",
                    }}
                  >
                    Stop &amp; upload
                  </button>
                )}
              </div>
              {autoRepliesFormValues.conv_auto_phone_recording_url?.trim() ? (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#059669" }}>Recording URL saved in the field above.</p>
              ) : null}
            </div>
          )}
        {!hideCarryOverToQuotes ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              disabled={!supabase || !userId}
              onClick={() => void carryOverAutoRepliesToQuotesProfile()}
              style={{
                alignSelf: "flex-start",
                padding: "8px 14px",
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                cursor: !supabase || !userId ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Carry over these settings to Quotes tab
            </button>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
              Copies toggles and methods to <strong>Quotes → Automatic replies</strong>. Quote custom message fields stay empty; “Require approval” for AI email/SMS on Quotes defaults to on.
            </p>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button
            type="button"
            onClick={() => void closeAutomaticRepliesModal()}
            style={{
              padding: "10px 18px",
              borderRadius: 6,
              border: "none",
              background: theme.primary,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Save &amp; close
          </button>
        </div>
      </div>
    </>
  )
}
