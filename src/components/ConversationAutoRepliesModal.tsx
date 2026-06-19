/**
 * Automatic replies — per intake channel (phone / text / email) with clear outbound response.
 * Used from Customers and Conversations hubs.
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
import { MessagingComplianceGuardrailsCard } from "./MessagingComplianceGuardrailsCard"
import type { SetupMiniWizardId } from "../lib/setupGuideWizards"
import SetupWizardLaunchButton from "./SetupWizardLaunchButton"
import {
  AUTO_REPLY_INTAKE_CHANNELS,
  buildAutoReplySummary,
  defaultFlowForIntake,
  flattenPrimaryFlowForLegacy,
  formatSummaryLabel,
  hydrateFlowsFromLegacyFlat,
  INTAKE_CHANNEL_DESCRIPTIONS,
  outboundForFlow,
  OUTBOUND_OPTIONS_FOR_INTAKE,
  parseAutomaticRepliesSourceFlows,
  type AutoReplyIntakeChannel,
  type AutoReplyChannelFlow,
} from "../lib/automaticRepliesChannels"

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
  hideCarryOverToQuotes?: boolean
  guideWizardId?: SetupMiniWizardId
}

function flowItemsForChannel(
  allItems: PortalSettingItem[],
  intake: AutoReplyIntakeChannel,
  flow: AutoReplyChannelFlow,
): PortalSettingItem[] {
  const outbound = outboundForFlow(intake, flow)
  const skipIds = new Set(["conv_auto_reply_enabled", "conv_auto_reply_method"])
  return allItems.filter((item) => !skipIds.has(item.id)).filter((item) => {
    if (item.id.startsWith("conv_auto_phone_") && outbound !== "Phone call") return false
    if (
      (item.id === "conv_auto_reply_message" ||
        item.id === "conv_auto_reply_ai" ||
        item.id === "conv_auto_reply_ai_require_approval" ||
        item.id === "conv_auto_reply_ai_brief") &&
      outbound !== "Text message" &&
      outbound !== "Email"
    ) {
      return false
    }
    return true
  })
}

export default function ConversationAutoRepliesModal({
  open,
  onClose,
  userId,
  portalConfig,
  aiAutomationsEnabled,
  hideCarryOverToQuotes,
  guideWizardId = "customers_auto_replies",
}: ConversationAutoRepliesModalProps) {
  const automaticRepliesItems = useMemo(
    () => getControlItemsForUser(portalConfig, "conversations", "automatic_replies", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )

  const [channelFlows, setChannelFlows] = useState<Record<AutoReplyIntakeChannel, AutoReplyChannelFlow>>(() =>
    parseAutomaticRepliesSourceFlows(null),
  )
  const [expandedChannel, setExpandedChannel] = useState<AutoReplyIntakeChannel | null>("Phone call")
  const [legacyFlatLoaded, setLegacyFlatLoaded] = useState<Record<string, string>>({})
  const [autoRepliesRecordingBusy, setAutoRepliesRecordingBusy] = useState(false)
  const [autoRepliesUploading, setAutoRepliesUploading] = useState(false)
  const [autoRepliesRecordingSupported, setAutoRepliesRecordingSupported] = useState(false)
  const autoRepliesMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const autoRepliesRecordedChunksRef = useRef<Blob[]>([])
  const autoRepliesMediaStreamRef = useRef<MediaStream | null>(null)

  const summary = useMemo(() => buildAutoReplySummary(channelFlows), [channelFlows])

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
      if (cancelled || error || !data) return
      const meta =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const rawLegacy = meta.conversationsAutomaticRepliesValues
      const legacy =
        rawLegacy && typeof rawLegacy === "object" && !Array.isArray(rawLegacy)
          ? Object.fromEntries(Object.entries(rawLegacy as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]))
          : {}
      let flows = parseAutomaticRepliesSourceFlows(meta)
      flows = hydrateFlowsFromLegacyFlat(flows, legacy)
      setChannelFlows(flows)
      setLegacyFlatLoaded(legacy)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, open])

  function patchChannel(intake: AutoReplyIntakeChannel, patch: Partial<AutoReplyChannelFlow>) {
    setChannelFlows((prev) => ({
      ...prev,
      [intake]: { ...prev[intake], ...patch },
    }))
  }

  function setChannelFormValue(intake: AutoReplyIntakeChannel, id: string, value: string) {
    patchChannel(intake, { [id]: value })
  }

  function isChannelItemVisible(intake: AutoReplyIntakeChannel, item: PortalSettingItem): boolean {
    const flow = channelFlows[intake]
    const formValues = {
      ...flow,
      conv_auto_reply_method: intake,
      conv_auto_reply_enabled: flow.conv_auto_reply_enabled ?? "unchecked",
    }
    return isPortalSettingDependencyVisible(item, automaticRepliesItems, formValues)
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
    prevMeta.conversationsAutomaticRepliesSourceFlows = { ...channelFlows }
    prevMeta.conversationsAutomaticRepliesValues = {
      ...legacyFlatLoaded,
      ...flattenPrimaryFlowForLegacy(channelFlows),
    }
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    onClose()
  }

  async function carryOverAutoRepliesToQuotesProfile() {
    if (!supabase || !userId) {
      alert("Sign in to save.")
      return
    }
    const flat = flattenPrimaryFlowForLegacy(channelFlows)
    const quoteItems = getControlItemsForUser(portalConfig, "quotes", "auto_response_options", { aiAutomationsEnabled })
    const idSet = new Set(quoteItems.map((i) => i.id))
    const merged = carryConversationAutoRepliesToQuoteValues(flat, idSet)
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
        ? Object.fromEntries(Object.entries(prevQ as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]))
        : {}
    prevMeta.quotesAutomaticRepliesValues = { ...existing, ...merged }
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    alert("Copied these settings to Quotes → Automatic replies.")
  }

  async function uploadConversationsAutoVoiceBlob(blob: Blob, extension: string, contentType: string) {
    if (!supabase || !userId) return
    setAutoRepliesUploading(true)
    try {
      const filePath = `${userId}/conv-auto-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from(VOICEMAIL_GREETING_BUCKET).upload(filePath, blob, { upsert: true, contentType })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath)
      patchChannel("Phone call", { conv_auto_phone_recording_url: data.publicUrl })
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

  const phoneFlow = channelFlows["Phone call"]
  const showPhoneRecording =
    phoneFlow.conv_auto_reply_enabled === "checked" &&
    outboundForFlow("Phone call", phoneFlow) === "Phone call" &&
    phoneFlow.conv_auto_phone_allow_automation === "checked" &&
    phoneFlow.conv_auto_phone_delivery === "Record in app"

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
          width: "94%",
          maxWidth: "680px",
          maxHeight: "92vh",
          overflow: "auto",
          background: "white",
          borderRadius: "10px",
          padding: "24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          zIndex: 9999,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>
            {portalConfig?.controlLabels?.automatic_replies ?? "Automatic replies"}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {guideWizardId ? <SetupWizardLaunchButton wizardId={guideWizardId} compact /> : null}
            <button
              type="button"
              onClick={() => void closeAutomaticRepliesModal()}
              style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}
            >
              ✕
            </button>
          </div>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
          Configure what happens <strong>when a customer contacts you</strong> (intake) and <strong>how Tradesman responds</strong> (outbound).
          Each channel is independent — for example, missed calls can text back while emails stay manual.
        </p>

        <MessagingComplianceGuardrailsCard />

        <div
          style={{
            marginTop: 14,
            marginBottom: 16,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            overflow: "hidden",
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 120px",
              gap: 8,
              padding: "8px 12px",
              background: "#f1f5f9",
              fontWeight: 700,
              color: "#475569",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <span>When customer contacts you</span>
            <span>We automatically respond</span>
            <span>Status</span>
          </div>
          {summary.map((row) => (
            <div
              key={row.intake}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 120px",
                gap: 8,
                padding: "10px 12px",
                borderTop: `1px solid ${theme.border}`,
                alignItems: "center",
                background: row.enabled ? "#f0fdf4" : "#fff",
              }}
            >
              <span style={{ fontWeight: 600, color: theme.text }}>{row.intake}</span>
              <span style={{ color: "#334155" }}>{formatSummaryLabel(row)}</span>
              <span style={{ fontWeight: 700, color: row.enabled ? "#059669" : "#94a3b8", fontSize: 12 }}>
                {row.enabled ? "On" : "Off"}
              </span>
            </div>
          ))}
        </div>

        {AUTO_REPLY_INTAKE_CHANNELS.map((intake) => {
          const flow = channelFlows[intake]
          const expanded = expandedChannel === intake
          const enabled = flow.conv_auto_reply_enabled === "checked"
          const outbound = outboundForFlow(intake, flow)
          const channelItems = flowItemsForChannel(automaticRepliesItems, intake, flow)

          return (
            <div
              key={intake}
              style={{
                marginBottom: 10,
                border: `1px solid ${expanded ? theme.primary : theme.border}`,
                borderRadius: 8,
                background: expanded ? "#fafafa" : "#fff",
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedChannel((prev) => (prev === intake ? null : intake))}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: theme.text, fontSize: 14 }}>{intake}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{INTAKE_CHANNEL_DESCRIPTIONS[intake]}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: enabled ? "#059669" : "#94a3b8", whiteSpace: "nowrap" }}>
                  {enabled ? formatSummaryLabel({ intake, enabled, outbound }) : "Off"} {expanded ? "▾" : "▸"}
                </span>
              </button>

              {expanded ? (
                <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", cursor: "pointer", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        patchChannel(intake, { conv_auto_reply_enabled: e.target.checked ? "checked" : "unchecked" })
                      }
                    />
                    Send automatic reply for {intake.toLowerCase()}s
                  </label>

                  {enabled ? (
                    <>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 12 }}>
                        Respond using
                        <select
                          value={outbound}
                          onChange={(e) => patchChannel(intake, { conv_auto_reply_outbound: e.target.value })}
                          style={{ ...theme.formInput, display: "block", marginTop: 4, minWidth: 220 }}
                        >
                          {OUTBOUND_OPTIONS_FOR_INTAKE[intake].map((opt) => (
                            <option key={opt} value={opt}>
                              {opt === "None" ? "Do not respond automatically" : opt}
                            </option>
                          ))}
                        </select>
                        <span style={{ display: "block", marginTop: 4, fontWeight: 400, color: "#64748b", lineHeight: 1.45 }}>
                          {intake === "Phone call" && outbound === "Text message"
                            ? "Typical setup: missed call → immediate text-back (requires SMS consent below)."
                            : intake === "Text message" && outbound === "Text message"
                              ? "Customer texts you → you text back automatically."
                              : intake === "Email" && outbound === "Email"
                                ? "Customer emails you → auto-reply email (optional)."
                                : "Choose how Tradesman should reach back out."}
                        </span>
                      </label>

                      {intake === "Phone call" && outbound === "Text message" ? (
                        <label
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            marginBottom: 12,
                            cursor: "pointer",
                            fontSize: 12,
                            lineHeight: 1.45,
                            color: "#334155",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={flow.conv_auto_sms_consent_on_call !== "unchecked"}
                            onChange={(e) =>
                              patchChannel(intake, { conv_auto_sms_consent_on_call: e.target.checked ? "checked" : "unchecked" })
                            }
                            style={{ marginTop: 2 }}
                          />
                          <span>
                            <strong>Record SMS opt-in when customer calls</strong> — required before text-back. Saves consent on the
                            customer profile (phone call / verbal agreement).
                          </span>
                        </label>
                      ) : null}

                      {outbound !== "None" ? (
                        <PortalSettingItemsForm
                          items={channelItems}
                          formValues={{ ...flow, conv_auto_reply_method: intake }}
                          setFormValue={(id, value) => setChannelFormValue(intake, id, value)}
                          isItemVisible={(item) => isChannelItemVisible(intake, item)}
                        />
                      ) : null}

                      <button
                        type="button"
                        onClick={() => patchChannel(intake, defaultFlowForIntake(intake))}
                        style={{
                          marginTop: 8,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          background: "#fff",
                          fontSize: 11,
                          cursor: "pointer",
                          color: "#64748b",
                        }}
                      >
                        Reset {intake.toLowerCase()} defaults
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}

        {showPhoneRecording ? (
          <div style={{ marginTop: 14, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 8 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: theme.text }}>Record phone auto-reply message</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {!autoRepliesRecordingBusy ? (
                <button
                  type="button"
                  disabled={!autoRepliesRecordingSupported || autoRepliesUploading}
                  onClick={() => void startAutoRepliesRecording()}
                  style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                >
                  {autoRepliesUploading ? "Uploading…" : "Start recording"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => stopAutoRepliesRecording()}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fef2f2", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#b91c1c" }}
                >
                  Stop &amp; upload
                </button>
              )}
            </div>
          </div>
        ) : null}

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
