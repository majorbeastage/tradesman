import { useEffect, useState, useMemo, useRef, Fragment, type ReactNode } from "react"
import { supabase } from "../../lib/supabase"
import { platformToolsJsonBody } from "../../lib/platformToolsJsonBody"
import { carryConversationAutoRepliesToQuoteValues } from "../../lib/automaticRepliesCarryOver"
import {
  mergeConversationAutomaticRepliesPrefs,
  runQualifiedConversationToQuotesAutomation,
} from "../../lib/conversationQuoteAutomation"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import PortalSettingItemsForm from "../../components/PortalSettingItemsForm"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import {
  CONVERSATION_STATUS_OPTIONS,
  getControlItemsForUser,
  getCustomActionButtonsForUser,
  getOmPageActionVisible,
  getPageActionVisible,
  isPortalSettingDependencyVisible,
  normalizeConversationStatus,
} from "../../types/portal-builder"
import type { PortalSettingItem } from "../../types/portal-builder"
import { useIsMobile } from "../../hooks/useIsMobile"
import {
  VoicemailRecordingBlock,
  VoicemailTranscriptBlock,
  voicemailPreviewLine,
} from "../../components/VoicemailEventBlock"
import AttachmentStrip, { type AttachmentStripItem } from "../../components/AttachmentStrip"
import { loadAttachmentsByCommunicationEventIds } from "../../lib/communicationAttachments"
import { uploadFilesForOutbound } from "../../lib/uploadCommAttachment"
import AiConsumerReplyApprovalCard from "../../components/AiConsumerReplyApprovalCard"
import { PENDING_AI_CONSUMER_REPLY_KEY, parsePendingAiConsumerReply } from "../../types/aiOutboundApproval"
import TabNotificationAlertsButton from "../../components/TabNotificationAlertsButton"
import CustomerCallButton from "../../components/CustomerCallButton"

type CustomerIdentifier = { type: string; value: string; is_primary?: boolean }
type CustomerRow = {
  display_name: string | null
  customer_identifiers: CustomerIdentifier[] | null
  service_address?: string | null
  service_lat?: number | null
  service_lng?: number | null
}
type MessageRow = { content: string | null; created_at: string | null; sender?: string | null }
type CommEventListRow = { created_at: string | null; direction: string | null; event_type: string | null }
type CommEventRow = {
  id: string
  event_type: string
  subject: string | null
  body: string | null
  direction: string | null
  created_at: string | null
  recording_url?: string | null
  transcript_text?: string | null
  summary_text?: string | null
  metadata?: Record<string, unknown> | null
}

type ActivityTimelineItem =
  | { key: string; sortMs: number; kind: "sms_thread"; message: Record<string, unknown> }
  | { key: string; sortMs: number; kind: "comm_event"; event: CommEventRow }

type SmsPanelTimelineItem =
  | { key: string; sortMs: number; kind: "sms_thread"; message: Record<string, unknown> }
  | { key: string; sortMs: number; kind: "sms_log"; event: CommEventRow }
type DetailIdentifier = { id: string; type: "phone" | "email"; value: string }
type ConversationDetailForm = {
  customerName: string
  channel: string
  status: string
  identifiers: DetailIdentifier[]
  portalValues: Record<string, string>
}
type ConversationRow = {
  id: string
  channel: string | null
  status: string | null
  created_at?: string
  customers: CustomerRow | null
  messages?: MessageRow[] | null
  communication_events?: CommEventListRow[] | null
}

function ConversationsSmsComplianceNotice() {
  return (
    <div
      role="note"
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #fcd34d",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <strong>SMS and automated calls:</strong> You cannot send text messages or automated phone messages to customers through this platform until they have already contacted you here and, where applicable, accepted SMS consent.{" "}
      <strong>First SMS</strong> you send to a customer through Tradesman Systems may require the customer to accept an opt-in SMS consent message before your message is delivered.
    </div>
  )
}

function lastReceivedAtIso(convo: ConversationRow): string | null {
  const msgs = convo.messages ?? []
  const inboundMsgTimes = msgs
    .filter((m) => m.sender === "customer" && m.created_at)
    .map((m) => m.created_at as string)
  const evs = convo.communication_events ?? []
  const inboundEvTimes = evs
    .filter((e) => e.direction === "inbound" && e.created_at)
    .map((e) => e.created_at as string)
  const all = [...inboundMsgTimes, ...inboundEvTimes]
  if (all.length === 0) return null
  return all.reduce((best, t) => (t > best ? t : best), all[0])
}

function latestMessageCreatedIso(convo: ConversationRow): string | null {
  const msgs = convo.messages ?? []
  if (!msgs.length) return null
  const sorted = [...msgs].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
  return sorted[0]?.created_at ?? null
}

/** Shown in list / used for date sort: prefer last inbound, else any latest thread message, else conversation created. */
function displayLastUpdateIso(convo: ConversationRow): string | null {
  return lastReceivedAtIso(convo) ?? latestMessageCreatedIso(convo) ?? convo.created_at ?? null
}

type ConversationsPageProps = { setPage?: (page: string) => void }

const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

/** Turn API JSON fields into display text (nested objects/arrays → JSON, never "[object Object]"). */
function formatApiJsonPart(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => formatApiJsonPart(item))
      .filter(Boolean)
      .join("\n")
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** Prefer JSON `message` / `hint` from API routes; explain opaque Vercel failures. */
function formatFetchApiError(response: Response, raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes("Function_invocation_failed") || trimmed.includes("FUNCTION_INVOCATION_FAILED")) {
    return (
      "The server function crashed or timed out. Open Vercel → your deployment → Logs, filter by /api/outbound-messages (or legacy /api/send-email, /api/send-sms), and check the stack trace. " +
      "Common causes: missing SUPABASE_SERVICE_ROLE_KEY, Resend API/domain errors, or Twilio errors."
    )
  }
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>
      const parts: string[] = []
      const push = (v: unknown) => {
        const s = formatApiJsonPart(v)
        if (s) parts.push(s)
      }
      push(j.error)
      push(j.message)
      push(j.hint)
      push(j.logWarning)
      if (j.fixEither != null) push(j.fixEither)
      if (j.deliveryHint != null) push(j.deliveryHint)
      if (j.serverSeesSupabaseEnv != null) {
        parts.push(`Server sees Supabase env (booleans only): ${formatApiJsonPart(j.serverSeesSupabaseEnv)}`)
      }
      if (j.supabaseClientInitError != null) push(`Init: ${formatApiJsonPart(j.supabaseClientInitError)}`)
      if (parts.length) return parts.join("\n\n")
    } catch {
      /* ignore */
    }
  }
  return trimmed || `Request failed (HTTP ${response.status})`
}

function formatAppError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>
    const msg = typeof o.message === "string" ? o.message : ""
    const details = typeof o.details === "string" ? o.details : ""
    const hint = typeof o.hint === "string" ? o.hint : ""
    const code = typeof o.code === "string" ? o.code : ""
    const parts = [msg, details, hint, code && `(${code})`].filter(Boolean)
    if (parts.length) return parts.join(" — ")
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function getChannelReadAtIso(metadata: unknown, channel: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined
  const m = metadata as Record<string, unknown>
  const cr = m.convoReadAt
  if (!cr || typeof cr !== "object" || Array.isArray(cr)) return undefined
  const v = (cr as Record<string, string>)[channel]
  return typeof v === "string" ? v : undefined
}

function isAfterReadAt(eventIso: string | null | undefined, readAtIso: string | undefined): boolean {
  if (!eventIso) return false
  if (!readAtIso) return true
  return new Date(eventIso).getTime() > new Date(readAtIso).getTime()
}

function replySubjectLine(subj: string | null | undefined): string {
  const t = (subj ?? "").trim()
  if (!t || t === "(No subject)") return "Re:"
  if (/^re:\s*/i.test(t)) return t
  return `Re: ${t}`
}

function ConvoCollapsible({
  title,
  defaultOpen,
  showUnreadDot,
  onOpen,
  countBadge,
  children,
}: {
  title: string
  defaultOpen?: boolean
  showUnreadDot?: boolean
  /** Called when the user expands this section (not on initial mount). */
  onOpen?: () => void
  /** Shown next to the title when collapsed or open (e.g. message count). */
  countBadge?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        marginBottom: 10,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v
            if (next && onOpen) onOpen()
            return next
          })
        }}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          background: "#f9fafb",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontWeight: 600,
          fontSize: 14,
          color: "#111827",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {title}
          {typeof countBadge === "number" && countBadge > 0 ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>({countBadge})</span>
          ) : null}
          {showUnreadDot ? (
            <span
              title="Unread"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ea580c",
                flexShrink: 0,
                boxShadow: "0 0 0 2px rgba(234,88,12,0.25)",
              }}
            />
          ) : null}
        </span>
        <span style={{ fontSize: 18, lineHeight: 1, color: "#6b7280", flexShrink: 0 }} aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div style={{ padding: 14, borderTop: `1px solid ${theme.border}` }}>{children}</div>
      )}
    </div>
  )
}

function ExpandableTimelineRow({
  titleContent,
  children,
}: {
  titleContent: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        marginBottom: 8,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          background: "#f9fafb",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{titleContent}</div>
        <span style={{ flexShrink: 0, color: "#6b7280", fontSize: 14, lineHeight: 1.4 }} aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open ? (
        <div style={{ padding: 12, borderTop: `1px solid ${theme.border}`, fontSize: 14, color: theme.text }}>{children}</div>
      ) : null}
    </div>
  )
}

export default function ConversationsPage(_props: ConversationsPageProps) {
  void _props
  const userId = useScopedUserId()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
  const portalConfig = usePortalConfigForPage()
  const isMobile = useIsMobile()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [showAutomaticReplies, setShowAutomaticReplies] = useState(false)
  const [autoRepliesFormValues, setAutoRepliesFormValues] = useState<Record<string, string>>({})
  const [conversationsAutoRepliesProfile, setConversationsAutoRepliesProfile] = useState<Record<string, string>>({})
  const [autoRepliesRecordingBusy, setAutoRepliesRecordingBusy] = useState(false)
  const [autoRepliesUploading, setAutoRepliesUploading] = useState(false)
  const [autoRepliesRecordingSupported, setAutoRepliesRecordingSupported] = useState(false)
  const autoRepliesMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const autoRepliesRecordedChunksRef = useRef<Blob[]>([])
  const autoRepliesMediaStreamRef = useRef<MediaStream | null>(null)
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [showAddConversation, setShowAddConversation] = useState(false)
  const [customerList, setCustomerList] = useState<any[]>([])
  const [addConvoExistingId, setAddConvoExistingId] = useState<string>("")
  const [addConvoNewName, setAddConvoNewName] = useState("")
  const [addConvoNewPhone, setAddConvoNewPhone] = useState("")
  const [addConvoNewEmail, setAddConvoNewEmail] = useState("")
  const [addConvoUseNew, setAddConvoUseNew] = useState(false)
  const [addConvoLoading, setAddConvoLoading] = useState(false)
  const [replyBody, setReplyBody] = useState("")
  const [replySending, setReplySending] = useState(false)
  const [replySubject, setReplySubject] = useState("")
  const [emailReplyBody, setEmailReplyBody] = useState("")
  const [emailSending, setEmailSending] = useState(false)
  const [emailPrimaryTo, setEmailPrimaryTo] = useState("")
  const [emailAdditionalTo, setEmailAdditionalTo] = useState("")
  const [emailCc, setEmailCc] = useState("")
  const [emailBcc, setEmailBcc] = useState("")
  const [emailReplyToOverride, setEmailReplyToOverride] = useState("")
  const [emailSignature, setEmailSignature] = useState("")
  const [emailComposeMountKey, setEmailComposeMountKey] = useState(0)
  const [communicationEvents, setCommunicationEvents] = useState<CommEventRow[]>([])
  const [commAttachmentsByEvent, setCommAttachmentsByEvent] = useState<Record<string, AttachmentStripItem[]>>({})
  const [aiThreadSummaryEnabled, setAiThreadSummaryEnabled] = useState(false)
  const [threadSummaryBusy, setThreadSummaryBusy] = useState(false)
  const [threadSummaryText, setThreadSummaryText] = useState("")
  const [emailComposeFiles, setEmailComposeFiles] = useState<File[]>([])
  const [smsMediaFiles, setSmsMediaFiles] = useState<File[]>([])
  /** profiles.voicemail_conversations_display for the portal user (scoped). */
  const [voicemailProfileDisplay, setVoicemailProfileDisplay] = useState<string>("use_channel")
  const [addConvoChannel, setAddConvoChannel] = useState<"sms" | "email">("sms")
  const [showArchivedCustomers, setShowArchivedCustomers] = useState(false)
  const [detailEditMode, setDetailEditMode] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [convoPendingAiBusy, setConvoPendingAiBusy] = useState(false)
  const [detailForm, setDetailForm] = useState<ConversationDetailForm>({
    customerName: "",
    serviceAddress: "",
    serviceLat: "",
    serviceLng: "",
    channel: "sms",
    status: "Open",
    identifiers: [],
    portalValues: {},
  })
  const conversationSettingsItems = useMemo(
    () => getControlItemsForUser(portalConfig, "conversations", "conversation_settings", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const automaticRepliesItems = useMemo(
    () => getControlItemsForUser(portalConfig, "conversations", "automatic_replies", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const addConversationPortalItems = useMemo(
    () => getControlItemsForUser(portalConfig, "conversations", "add_conversation", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const [addConversationPortalValues, setAddConversationPortalValues] = useState<Record<string, string>>({})
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "conversations"), [portalConfig])
  const showAddConversationAction =
    getPageActionVisible(portalConfig, "conversations", "add_conversation") &&
    getOmPageActionVisible(portalConfig, "conversations", "add_conversation")
  const showConversationSettingsButton =
    getPageActionVisible(portalConfig, "conversations", "conversation_settings") &&
    getOmPageActionVisible(portalConfig, "conversations", "settings")
  const showAutomaticRepliesButton =
    getPageActionVisible(portalConfig, "conversations", "automatic_replies") &&
    getOmPageActionVisible(portalConfig, "conversations", "automatic_replies")

  const emailOnlyEvents = useMemo(
    () => communicationEvents.filter((e) => e.event_type === "email"),
    [communicationEvents],
  )

  const voicemailEvents = useMemo(
    () => communicationEvents.filter((e) => e.event_type === "voicemail"),
    [communicationEvents],
  )

  useEffect(() => {
    try {
      const s = localStorage.getItem("tradesman_email_signature")
      if (typeof s === "string") setEmailSignature(s)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("voicemail_conversations_display, ai_thread_summary_enabled")
        .eq("id", userId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) return
      const v = (data as { voicemail_conversations_display?: string }).voicemail_conversations_display
      if (typeof v === "string" && v.trim()) setVoicemailProfileDisplay(v.trim())
      setAiThreadSummaryEnabled((data as { ai_thread_summary_enabled?: boolean }).ai_thread_summary_enabled === true)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

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
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!showAutomaticReplies || automaticRepliesItems.length === 0) return
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
  }, [showAutomaticReplies, automaticRepliesItems, conversationsAutoRepliesProfile])

  const activityTimeline = useMemo((): ActivityTimelineItem[] => {
    const items: ActivityTimelineItem[] = []
    for (const m of messages) {
      const raw = m as Record<string, unknown>
      const id = String(raw.id ?? "")
      const ca = raw.created_at
      const at = typeof ca === "string" ? Date.parse(ca) : NaN
      items.push({
        key: `sms-${id}`,
        sortMs: Number.isFinite(at) ? at : 0,
        kind: "sms_thread",
        message: raw,
      })
    }
    for (const e of communicationEvents) {
      const at = e.created_at ? Date.parse(e.created_at) : NaN
      items.push({
        key: `ev-${e.id}`,
        sortMs: Number.isFinite(at) ? at : 0,
        kind: "comm_event",
        event: e,
      })
    }
    items.sort((a, b) => b.sortMs - a.sortMs)
    return items
  }, [messages, communicationEvents])

  const smsTextTimeline = useMemo((): SmsPanelTimelineItem[] => {
    const items: SmsPanelTimelineItem[] = []
    for (const m of messages) {
      const raw = m as Record<string, unknown>
      const id = String(raw.id ?? "")
      const ca = raw.created_at
      const at = typeof ca === "string" ? Date.parse(ca) : NaN
      items.push({
        key: `sms-${id}`,
        sortMs: Number.isFinite(at) ? at : 0,
        kind: "sms_thread",
        message: raw,
      })
    }
    for (const e of communicationEvents) {
      if (e.event_type !== "sms") continue
      const at = e.created_at ? Date.parse(e.created_at) : NaN
      items.push({
        key: `ev-${e.id}`,
        sortMs: Number.isFinite(at) ? at : 0,
        kind: "sms_log",
        event: e,
      })
    }
    items.sort((a, b) => b.sortMs - a.sortMs)
    return items
  }, [messages, communicationEvents])

  useEffect(() => {
    if (!showAddConversation) return
    if (addConversationPortalItems.length === 0) {
      setAddConversationPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of addConversationPortalItems) {
      try {
        const s = localStorage.getItem(`convo_add_${item.id}`)
        if (item.type === "checkbox") {
          next[item.id] = s === "checked" || s === "unchecked" ? s : item.defaultChecked ? "checked" : "unchecked"
        } else if (item.type === "dropdown" && item.options?.length) {
          next[item.id] = s && item.options.includes(s) ? s : item.options[0]
        } else {
          next[item.id] = s ?? ""
        }
      } catch {
        if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
        else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
        else next[item.id] = ""
      }
    }
    setAddConversationPortalValues(next)
  }, [showAddConversation, addConversationPortalItems])

  useEffect(() => {
    if (!showSettings || conversationSettingsItems.length === 0 || !supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("ai_thread_summary_enabled").eq("id", userId).maybeSingle()
      if (cancelled) return
      const aiOn = (data as { ai_thread_summary_enabled?: boolean } | null)?.ai_thread_summary_enabled === true
      setSettingsFormValues(() => {
        const out: Record<string, string> = {}
        if (conversationSettingsItems.some((i) => i.id === "ai_thread_summary_enabled")) {
          out.ai_thread_summary_enabled = aiOn ? "checked" : "unchecked"
        }
        for (const item of conversationSettingsItems) {
          if (out[item.id] !== undefined) continue
          if (item.id === "show_internal_conversations") {
            try {
              const stored = JSON.parse(localStorage.getItem("convo_showInternalConversations") ?? "true")
              out[item.id] = stored ? "checked" : "unchecked"
            } catch {
              out[item.id] = item.defaultChecked ? "checked" : "unchecked"
            }
          } else if (item.type === "checkbox") {
            out[item.id] = item.defaultChecked ? "checked" : "unchecked"
          } else if (item.type === "dropdown" && item.options?.length) {
            out[item.id] = item.options[0]
          } else {
            out[item.id] = ""
          }
        }
        return out
      })
    })()
    return () => {
      cancelled = true
    }
  }, [showSettings, conversationSettingsItems, userId])

  function isSettingItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, conversationSettingsItems, settingsFormValues)
  }

  function isAutomaticRepliesItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, automaticRepliesItems, autoRepliesFormValues)
  }

  function buildDetailFormFromConversation(convo: any): ConversationDetailForm {
    const identifiers = Array.isArray(convo?.customers?.customer_identifiers)
      ? convo.customers.customer_identifiers
          .filter((i: any) => i && (i.type === "phone" || i.type === "email"))
          .map((i: any) => ({
            id: crypto.randomUUID(),
            type: i.type as "phone" | "email",
            value: String(i.value ?? ""),
          }))
      : []
    const metadata = convo?.metadata && typeof convo.metadata === "object" ? convo.metadata : {}
    const savedPortalValues = metadata.portalValues && typeof metadata.portalValues === "object" ? metadata.portalValues as Record<string, string> : {}
    const portalValues: Record<string, string> = {}
    conversationSettingsItems.forEach((item) => {
      if (item.id === "show_internal_conversations" || item.id === "ai_thread_summary_enabled") return
      if (item.type === "checkbox") portalValues[item.id] = savedPortalValues[item.id] ?? (item.defaultChecked ? "checked" : "unchecked")
      else if (item.type === "dropdown" && item.options?.length) portalValues[item.id] = savedPortalValues[item.id] ?? item.options[0]
      else portalValues[item.id] = savedPortalValues[item.id] ?? ""
    })
    const cust = convo?.customers as CustomerRow | null | undefined
    return {
      customerName: convo?.customers?.display_name ?? "",
      serviceAddress: typeof cust?.service_address === "string" ? cust.service_address : "",
      serviceLat: cust?.service_lat != null && Number.isFinite(Number(cust.service_lat)) ? String(cust.service_lat) : "",
      serviceLng: cust?.service_lng != null && Number.isFinite(Number(cust.service_lng)) ? String(cust.service_lng) : "",
      channel: convo?.channel ?? "sms",
      status: normalizeConversationStatus(convo?.status),
      identifiers,
      portalValues,
    }
  }

  function isDetailPortalItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, conversationSettingsItems, detailForm.portalValues)
  }

  useEffect(() => {
    if (!openCustomButtonId) return
    const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
    if (!btn?.items?.length) return
    const next: Record<string, string> = {}
    btn.items.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setCustomButtonFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [openCustomButtonId, customActionButtons])

  function isCustomButtonItemVisible(item: PortalSettingItem, items: PortalSettingItem[], formValues: Record<string, string>): boolean {
    return isPortalSettingDependencyVisible(item, items, formValues)
  }

  const [showInternalConversations, setShowInternalConversations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("convo_showInternalConversations") ?? "true") as boolean
    } catch {
      return true
    }
  })

  async function closeConversationSettingsModal() {
    const v = settingsFormValues["show_internal_conversations"]
    if (v === "checked" || v === "unchecked") {
      const on = v === "checked"
      try {
        localStorage.setItem("convo_showInternalConversations", JSON.stringify(on))
      } catch {
        /* ignore */
      }
      setShowInternalConversations(on)
    }
    const aiVal = settingsFormValues["ai_thread_summary_enabled"]
    if ((aiVal === "checked" || aiVal === "unchecked") && supabase && userId) {
      const aiOn = aiVal === "checked"
      const { error } = await supabase.from("profiles").update({ ai_thread_summary_enabled: aiOn }).eq("id", userId)
      if (error) console.error(error)
      else setAiThreadSummaryEnabled(aiOn)
    }
    setShowSettings(false)
  }

  async function closeAutomaticRepliesModal() {
    if (!supabase || !userId) {
      setShowAutomaticReplies(false)
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
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setConversationsAutoRepliesProfile({ ...autoRepliesFormValues })
    setShowAutomaticReplies(false)
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

  // Internal conversations (in-memory for now; can wire to Supabase later)
  const [internalConversations, setInternalConversations] = useState<{ id: string; title: string; created_at: string }[]>([])
  const [showAddInternalConvo, setShowAddInternalConvo] = useState(false)
  const [newInternalConvoTitle, setNewInternalConvoTitle] = useState("")
  const [addInternalConvoLoading, setAddInternalConvoLoading] = useState(false)

  async function loadConversations() {
    if (!userId || !supabase) {
      if (!supabase) console.error("Supabase not configured.")
      return
    }
    const sb = supabase
    const uid = userId
    const customersBlock = `
      customers (
        display_name,
        service_address,
        service_lat,
        service_lng,
        customer_identifiers (
          type,
          value
        )
      ),
      messages (
        content,
        created_at,
        sender
      )`
    const commEventsBlock = `,
      communication_events (
        created_at,
        direction,
        event_type
      )`
    const customersBlockBasic = `
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      ),
      messages (
        content,
        created_at,
        sender
      )`
    function buildSelect(opts: { removedAt: boolean; embedCommEvents: boolean; customersBasic: boolean }): string {
      const ra = opts.removedAt ? ",\n      removed_at" : ""
      const ev = opts.embedCommEvents ? commEventsBlock : ""
      const cb = (opts.customersBasic ? customersBlockBasic : customersBlock).trim()
      return `
      id,
      channel,
      status,
      created_at${ra},
      ${cb}${ev}
    `
    }

    async function runQuery(removedAt: boolean, embedCommEvents: boolean, customersBasic: boolean) {
      let q = sb
        .from("conversations")
        .select(buildSelect({ removedAt, embedCommEvents, customersBasic }))
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
      if (removedAt) q = q.is("removed_at", null)
      return q
    }

    const attempts: { removedAt: boolean; embedCommEvents: boolean; customersBasic: boolean }[] = [
      { removedAt: true, embedCommEvents: true, customersBasic: false },
      { removedAt: true, embedCommEvents: true, customersBasic: true },
      { removedAt: false, embedCommEvents: true, customersBasic: false },
      { removedAt: false, embedCommEvents: true, customersBasic: true },
      { removedAt: true, embedCommEvents: false, customersBasic: false },
      { removedAt: true, embedCommEvents: false, customersBasic: true },
      { removedAt: false, embedCommEvents: false, customersBasic: false },
      { removedAt: false, embedCommEvents: false, customersBasic: true },
    ]
    let lastError: unknown
    for (const opts of attempts) {
      const res = await runQuery(opts.removedAt, opts.embedCommEvents, opts.customersBasic)
      if (!res.error) {
        let rows = (res.data || []) as any[]
        if (!opts.removedAt) rows = rows.map((c: any) => ({ ...c, removed_at: c.removed_at ?? null }))
        setConversations(rows)
        return
      }
      lastError = res.error
    }
    console.error(lastError)
  }

  useEffect(() => {
    loadConversations()
  }, [userId])

  async function loadCustomerList() {
    if (!supabase || !userId) return
    const { data } = await supabase
      .from("customers")
      .select("id, display_name, customer_identifiers(type, value)")
      .eq("user_id", userId)
      .order("display_name")
    setCustomerList(data || [])
  }

  async function createConversationFlow() {
    if (!supabase) return
    setAddConvoLoading(true)
    try {
      let customerId: string
      if (addConvoUseNew) {
        if (!addConvoNewName?.trim() && !addConvoNewPhone?.trim() && !addConvoNewEmail?.trim()) {
          alert("Enter at least a name, phone, or email for the new customer.")
          setAddConvoLoading(false)
          return
        }
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({ user_id: userId, display_name: addConvoNewName.trim() || null, notes: null })
          .select("id")
          .single()
        if (custErr) throw custErr
        customerId = newCustomer.id
        if (addConvoNewPhone.trim()) {
          await supabase.from("customer_identifiers").insert({
            user_id: userId,
            customer_id: customerId,
            type: "phone",
            value: addConvoNewPhone.trim(),
            is_primary: true,
            verified: false,
          })
        }
        if (addConvoNewEmail.trim()) {
          await supabase.from("customer_identifiers").insert({
            user_id: userId,
            customer_id: customerId,
            type: "email",
            value: addConvoNewEmail.trim(),
            is_primary: false,
            verified: false,
          })
        }
      } else {
        if (!addConvoExistingId) {
          alert("Select an existing customer.")
          setAddConvoLoading(false)
          return
        }
        customerId = addConvoExistingId
      }
      const { error: convoErr } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          customer_id: customerId,
          channel: addConvoChannel,
          status: "open",
        })
      if (convoErr) throw convoErr
      setShowAddConversation(false)
      setAddConvoExistingId("")
      setAddConvoNewName("")
      setAddConvoNewPhone("")
      setAddConvoNewEmail("")
      setAddConvoUseNew(false)
      setAddConvoChannel("sms")
      await loadConversations()
    } catch (err: any) {
      console.error(err)
      alert(err?.message ?? "Failed to create conversation.")
    } finally {
      setAddConvoLoading(false)
    }
  }

  async function openConversation(convoId: string) {
    setSelectedConversationId(convoId)
    if (!supabase) return

    const selectWithMetadata = `
      id,
      channel,
      status,
      created_at,
      customer_id,
      metadata,
      customers (
        display_name,
        service_address,
        service_lat,
        service_lng,
        customer_identifiers (
          type,
          value
        )
      )
    `
    const selectWithMetadataBasic = `
      id,
      channel,
      status,
      created_at,
      customer_id,
      metadata,
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      )
    `
    const selectWithoutMetadata = `
      id,
      channel,
      status,
      created_at,
      customer_id,
      customers (
        display_name,
        service_address,
        service_lat,
        service_lng,
        customer_identifiers (
          type,
          value
        )
      )
    `
    const selectWithoutMetadataBasic = `
      id,
      channel,
      status,
      created_at,
      customer_id,
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      )
    `
    let { data, error } = await supabase
      .from("conversations")
      .select(selectWithMetadata)
      .eq("id", convoId)
      .single()

    if (error && String(error.message || "").toLowerCase().includes("service_")) {
      const r = await supabase.from("conversations").select(selectWithMetadataBasic).eq("id", convoId).single()
      data = r.data
      error = r.error
    }

    if (error && String(error.message || "").includes("metadata")) {
      let fallback = await supabase.from("conversations").select(selectWithoutMetadata).eq("id", convoId).single()
      if (fallback.error && String(fallback.error.message || "").toLowerCase().includes("service_")) {
        fallback = await supabase.from("conversations").select(selectWithoutMetadataBasic).eq("id", convoId).single()
      }
      data = fallback.data ? { ...fallback.data, metadata: {} } : null
      error = fallback.error
    }

    if (error) {
      console.error(error)
      return
    }

    setSelectedConversation(data)
    setDetailForm(buildDetailFormFromConversation(data))
    setDetailEditMode(false)

    const { data: msgsDesc } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: false })
      .limit(80)

    const msgs = msgsDesc || []
    setMessages([...msgs].reverse())

    const { data: commDesc } = await supabase
      .from("communication_events")
      .select("id, event_type, subject, body, direction, created_at, metadata, recording_url, transcript_text, summary_text")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: false })
      .limit(120)

    const commChrono: CommEventRow[] = commDesc
      ? ([...commDesc].reverse() as CommEventRow[])
      : []
    setCommunicationEvents(commChrono)
    const eventIds = commChrono.map((e) => e.id).filter(Boolean)
    const attMap = await loadAttachmentsByCommunicationEventIds(eventIds)
    setCommAttachmentsByEvent(attMap)
    const outboundSubjects = commChrono.filter(
      (evt) => evt.event_type === "email" && evt.direction === "outbound" && evt.subject?.trim(),
    )
    const latestOutbound = outboundSubjects.length ? outboundSubjects[outboundSubjects.length - 1] : undefined
    setReplySubject(latestOutbound?.subject?.trim() ?? "")
    setEmailReplyBody("")
    const custEmail =
      (data as { customers?: { customer_identifiers?: { type: string; value: string }[] } })?.customers?.customer_identifiers
        ?.find((i) => i.type === "email")
        ?.value?.trim?.() ?? ""
    setEmailPrimaryTo(custEmail)
    setEmailAdditionalTo("")
    setEmailCc("")
    setEmailBcc("")
    setEmailReplyToOverride("")
    setEmailComposeMountKey(0)
    setEmailComposeFiles([])
    setSmsMediaFiles([])
    setThreadSummaryText("")
  }

  async function markChannelRead(channel: "sms" | "email" | "voicemail") {
    if (!supabase || !selectedConversation?.id) return
    const prev =
      selectedConversation.metadata && typeof selectedConversation.metadata === "object"
        ? { ...(selectedConversation.metadata as Record<string, unknown>) }
        : {}
    const prevRead = prev.convoReadAt && typeof prev.convoReadAt === "object" && !Array.isArray(prev.convoReadAt) ? { ...(prev.convoReadAt as Record<string, string>) } : {}
    const convoReadAt = { ...prevRead, [channel]: new Date().toISOString() }
    const metadata = { ...prev, convoReadAt }
    const { error } = await supabase.from("conversations").update({ metadata }).eq("id", selectedConversation.id)
    if (error) console.error(error)
    else setSelectedConversation((c: any) => (c && c.id === selectedConversation.id ? { ...c, metadata } : c))
  }

  async function saveConversationDetails() {
    if (!supabase || !selectedConversation?.id) return
    if (!userId) {
      alert("You must be signed in to save conversation details.")
      return
    }
    if (!selectedConversation.customer_id) {
      alert("This conversation is not linked to a customer record, so details cannot be saved. Try creating a new conversation from Add Conversation.")
      return
    }
    setDetailSaving(true)
    try {
      const statusBeforeSave = selectedConversation.status
      const cleanedIdentifiers = detailForm.identifiers
        .map((item) => ({ ...item, value: item.value.trim() }))
        .filter((item) => item.value)

      const prevMeta =
        selectedConversation?.metadata && typeof selectedConversation.metadata === "object"
          ? { ...(selectedConversation.metadata as Record<string, unknown>) }
          : {}
      const metadata = { ...prevMeta, portalValues: detailForm.portalValues }

      const { error: convoErr } = await supabase
        .from("conversations")
        .update({
          channel: detailForm.channel || null,
          status: detailForm.status || null,
          metadata,
        })
        .eq("id", selectedConversation.id)
      if (convoErr) throw convoErr

      const latRaw = detailForm.serviceLat.trim()
      const lngRaw = detailForm.serviceLng.trim()
      const latN = latRaw ? Number.parseFloat(latRaw) : Number.NaN
      const lngN = lngRaw ? Number.parseFloat(lngRaw) : Number.NaN
      const custPatch: Record<string, unknown> = {
        display_name: detailForm.customerName.trim() || null,
        service_address: detailForm.serviceAddress.trim() || null,
        service_lat: Number.isFinite(latN) ? latN : null,
        service_lng: Number.isFinite(lngN) ? lngN : null,
      }
      let { error: customerErr } = await supabase.from("customers").update(custPatch).eq("id", selectedConversation.customer_id)
      if (customerErr && String(customerErr.message || "").toLowerCase().includes("service_")) {
        const { service_address: _a, service_lat: _la, service_lng: _ln, ...rest } = custPatch
        const r = await supabase.from("customers").update(rest).eq("id", selectedConversation.customer_id)
        customerErr = r.error
      }
      if (customerErr) throw customerErr

      const { error: deleteErr } = await supabase
        .from("customer_identifiers")
        .delete()
        .eq("customer_id", selectedConversation.customer_id)
        .in("type", ["phone", "email"])
      if (deleteErr) throw deleteErr

      if (cleanedIdentifiers.length > 0) {
        const payload = cleanedIdentifiers.map((item, index) => ({
          user_id: userId,
          customer_id: selectedConversation.customer_id,
          type: item.type,
          value: item.value,
          is_primary: index === 0,
          verified: false,
        }))
        const { error: insertErr } = await supabase.from("customer_identifiers").insert(payload)
        if (insertErr) throw insertErr
      }

      const convoId = selectedConversation.id
      const prefsMerged = mergeConversationAutomaticRepliesPrefs(conversationsAutoRepliesProfile, autoRepliesFormValues)
      const autoQuotes = await runQualifiedConversationToQuotesAutomation({
        supabase,
        userId,
        conversationId: convoId,
        customerId: selectedConversation.customer_id,
        prevStatusRaw: statusBeforeSave,
        nextStatusRaw: detailForm.status,
        prefs: prefsMerged,
      })
      if (autoQuotes.action === "error") {
        alert(autoQuotes.message)
      }
      if (autoQuotes.action === "moved") {
        setSelectedConversation(null)
        setSelectedConversationId(null)
        setMessages([])
        setCommunicationEvents([])
        setCommAttachmentsByEvent({})
        setConversations((prev) => prev.filter((c) => c.id !== convoId))
        await loadConversations()
        setDetailEditMode(false)
        return
      }

      await openConversation(selectedConversation.id)
      await loadConversations()
      setDetailEditMode(false)
    } catch (err) {
      alert(formatAppError(err))
    } finally {
      setDetailSaving(false)
    }
  }

  async function activateConversationRow(convoId: string) {
    if (selectedConversationId === convoId && selectedConversation) {
      setSelectedConversation(null)
      setSelectedConversationId(null)
      setMessages([])
      setCommunicationEvents([])
      setCommAttachmentsByEvent({})
      return
    }
    await openConversation(convoId)
  }

  async function sendReply() {
    if (!supabase || !selectedConversation?.id) return
    const trimmed = replyBody.trim()
    const to = selectedConversation.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value?.trim?.() ?? ""
    if (!trimmed) {
      alert("Enter a message to send.")
      return
    }
    if (!to) {
      alert("This conversation does not have a customer phone number.")
      return
    }
    setReplySending(true)
    try {
      let mediaPublicUrls: string[] | undefined
      if (userId && smsMediaFiles.length > 0) {
        const urls = await uploadFilesForOutbound(userId, smsMediaFiles, "sms-reply")
        if (urls.length) mediaPublicUrls = urls
      }
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          body: trimmed,
          userId,
          conversationId: selectedConversation.id,
          ...(mediaPublicUrls?.length ? { mediaPublicUrls } : {}),
        }),
      })
      const raw = await response.text()
      if (!response.ok) {
        throw new Error(formatFetchApiError(response, raw))
      }
      try {
        const ok = JSON.parse(raw) as {
          logWarning?: string
          twilioSid?: string
          twilioStatus?: string
          deliveryHint?: string
        }
        if (ok.logWarning) console.warn("[send-sms]", ok.logWarning)
        if (ok.deliveryHint || ok.twilioSid) {
          console.info(
            "[send-sms] Twilio:",
            ok.twilioSid ?? "(no sid)",
            ok.twilioStatus ?? "",
            ok.deliveryHint ? `\n${ok.deliveryHint}` : "",
          )
        }
      } catch {
        /* non-JSON success body */
      }
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedConversation.id,
        sender: "user",
        content: trimmed,
      })
      if (error) throw error
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), sender: "user", content: trimmed, created_at: new Date().toISOString() }])
      setReplyBody("")
      setSmsMediaFiles([])
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setReplySending(false)
    }
  }

  function beginReplyToEmail(evt: CommEventRow) {
    setEmailComposeFiles([])
    setReplySubject(replySubjectLine(evt.subject))
    const when = evt.created_at ? new Date(evt.created_at).toLocaleString() : ""
    const role = evt.direction === "inbound" ? "Customer" : "You"
    const quote = evt.body?.trim()
      ? `\n\n----------\n${when} — ${role} wrote:\n\n${evt.body.trim()}`
      : ""
    setEmailReplyBody(quote.replace(/^\n+/, "") || "")
    setEmailComposeMountKey((k) => k + 1)
  }

  async function sendEmailReply() {
    if (!supabase || !selectedConversation?.id) return
    if (!userId) {
      alert("You must be signed in to send email.")
      return
    }
    const primary = emailPrimaryTo.trim().toLowerCase()
    const additional = emailAdditionalTo.trim()
    if (!primary && !additional) {
      alert("Enter at least one recipient (To) or add addresses in Additional recipients.")
      return
    }
    const subject = replySubject.trim()
    let body = emailReplyBody.trim()
    const sig = emailSignature.trim()
    if (sig) body = `${body}${body ? "\n\n" : ""}--\n${sig}`
    if (!subject || !body) {
      alert("Enter a subject and email body.")
      return
    }
    setEmailSending(true)
    try {
      let attachmentPublicUrls: string[] | undefined
      if (userId && emailComposeFiles.length > 0) {
        const urls = await uploadFilesForOutbound(userId, emailComposeFiles, "email-reply")
        if (urls.length) attachmentPublicUrls = urls
      }
      const response = await fetch("/api/outbound-messages?__channel=email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: primary || undefined,
          toAdditional: additional || undefined,
          cc: emailCc.trim() || undefined,
          bcc: emailBcc.trim() || undefined,
          replyTo: emailReplyToOverride.trim() || undefined,
          subject,
          body,
          userId,
          conversationId: selectedConversation.id,
          customerId: selectedConversation.customer_id,
          ...(attachmentPublicUrls?.length ? { attachmentPublicUrls } : {}),
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      let logWarning: string | undefined
      try {
        const j = JSON.parse(raw) as { logWarning?: string }
        logWarning = typeof j.logWarning === "string" ? j.logWarning : undefined
      } catch {
        /* ignore */
      }
      if (logWarning) {
        console.warn("[send-email]", logWarning)
        alert(`${logWarning}\n\nThe customer may still have received the email. Refresh conversations to confirm.`)
      }
      const toMeta =
        primary && additional
          ? `${primary}, ${additional}`
          : primary || additional || ""
      const event: CommEventRow = {
        id: crypto.randomUUID(),
        event_type: "email",
        subject,
        body,
        direction: "outbound",
        created_at: new Date().toISOString(),
        metadata: { to: toMeta },
      }
      setCommunicationEvents((prev) => [...prev, event])
      setEmailReplyBody("")
      setEmailComposeFiles([])
      await loadConversations()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setEmailSending(false)
    }
  }

  const pendingConvoAiReply = useMemo(
    () => parsePendingAiConsumerReply(selectedConversation?.metadata?.[PENDING_AI_CONSUMER_REPLY_KEY]),
    [selectedConversation?.metadata, selectedConversation?.id],
  )

  async function mergeConversationMetadata(
    convoId: string,
    mutator: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) {
    if (!supabase) return
    const { data: row } = await supabase.from("conversations").select("metadata").eq("id", convoId).maybeSingle()
    const prev =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const next = mutator(prev)
    const { error } = await supabase.from("conversations").update({ metadata: next }).eq("id", convoId)
    if (error) throw error
    setSelectedConversation((c: any) => (c && c.id === convoId ? { ...c, metadata: next } : c))
  }

  async function approveConvoPendingAi(finalBody: string) {
    if (!supabase || !userId || !selectedConversation?.id || !selectedConversation.customer_id || !pendingConvoAiReply) return
    setConvoPendingAiBusy(true)
    try {
      if (pendingConvoAiReply.channel === "sms") {
        const response = await fetch("/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: pendingConvoAiReply.to,
            body: finalBody,
            userId,
            conversationId: selectedConversation.id,
            customerId: selectedConversation.customer_id,
          }),
        })
        const raw = await response.text()
        if (!response.ok) throw new Error(formatFetchApiError(response, raw))
        const { error } = await supabase.from("messages").insert({
          conversation_id: selectedConversation.id,
          sender: "user",
          content: finalBody,
        })
        if (error) throw error
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), sender: "user", content: finalBody, created_at: new Date().toISOString() },
        ])
      } else {
        const subj = pendingConvoAiReply.subject?.trim() || "Message from us"
        const response = await fetch("/api/outbound-messages?__channel=email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: pendingConvoAiReply.to,
            subject: subj,
            body: finalBody,
            userId,
            conversationId: selectedConversation.id,
            customerId: selectedConversation.customer_id,
          }),
        })
        const raw = await response.text()
        if (!response.ok) throw new Error(formatFetchApiError(response, raw))
        const toMeta = pendingConvoAiReply.to
        const event: CommEventRow = {
          id: crypto.randomUUID(),
          event_type: "email",
          subject: subj,
          body: finalBody,
          direction: "outbound",
          created_at: new Date().toISOString(),
          metadata: { to: toMeta },
        }
        setCommunicationEvents((prev) => [...prev, event])
      }
      await mergeConversationMetadata(selectedConversation.id, (prev) => {
        const n = { ...prev }
        delete n[PENDING_AI_CONSUMER_REPLY_KEY]
        return n
      })
      await loadConversations()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setConvoPendingAiBusy(false)
    }
  }

  async function retryConvoPendingAi() {
    if (!selectedConversation?.id || !supabase) return
    setConvoPendingAiBusy(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("Not signed in.")
      const response = await fetch("/api/platform-tools?__route=ai-regenerate-conversation-consumer-reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversationId: selectedConversation.id }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      const j = JSON.parse(raw) as { body?: string }
      const newBody = typeof j.body === "string" ? j.body.trim() : ""
      if (!newBody) throw new Error("No draft text returned.")
      await mergeConversationMetadata(selectedConversation.id, (prev) => {
        const cur = parsePendingAiConsumerReply(prev[PENDING_AI_CONSUMER_REPLY_KEY])
        if (!cur) return prev
        return {
          ...prev,
          [PENDING_AI_CONSUMER_REPLY_KEY]: {
            ...cur,
            body: newBody.slice(0, cur.channel === "email" ? 12000 : 1500),
          },
        }
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setConvoPendingAiBusy(false)
    }
  }

  async function dismissConvoPendingAi() {
    if (!selectedConversation?.id) return
    setConvoPendingAiBusy(true)
    try {
      await mergeConversationMetadata(selectedConversation.id, (prev) => {
        const n = { ...prev }
        delete n[PENDING_AI_CONSUMER_REPLY_KEY]
        return n
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setConvoPendingAiBusy(false)
    }
  }

  async function summarizeThread() {
    if (!supabase || !selectedConversation?.id) return
    setThreadSummaryBusy(true)
    setThreadSummaryText("")
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("Not signed in.")
      const res = await fetch("/api/platform-tools?__route=ai-summarize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: platformToolsJsonBody({ conversationId: selectedConversation.id }),
      })
      const raw = await res.text()
      if (!res.ok) {
        let msg = raw.slice(0, 400)
        try {
          const j = JSON.parse(raw) as { error?: string }
          if (j.error) msg = j.error
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      const j = JSON.parse(raw) as { summary?: string }
      setThreadSummaryText((j.summary ?? "").trim())
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setThreadSummaryBusy(false)
    }
  }

  const filteredConversations = conversations.filter((convo: any) => {
    const name = (convo.customers?.display_name || "").toLowerCase()
    const phone = convo.customers?.customer_identifiers
      ?.find((i: any) => i.type === "phone")?.value || ""
    const email = convo.customers?.customer_identifiers
      ?.find((i: any) => i.type === "email")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    const matchesName = !searchLower || name.includes(searchLower) || email.toLowerCase().includes(searchLower)
    const matchesPhone = !phoneFilter || phone.includes(phoneFilter)
    return matchesName && matchesPhone
  })

  const sortedConversations = [...filteredConversations].sort((a: any, b: any) => {
    let aVal = ""
    let bVal = ""

    if (sortField === "name") {
      aVal = (a.customers?.display_name || "").toLowerCase()
      bVal = (b.customers?.display_name || "").toLowerCase()
    }
    if (sortField === "created_at") {
      aVal = displayLastUpdateIso(a as ConversationRow) || ""
      bVal = displayLastUpdateIso(b as ConversationRow) || ""
    }
    if (sortAsc) return aVal > bVal ? 1 : -1
    return aVal < bVal ? 1 : -1
  })

  const unreadChannels = useMemo(() => {
    if (!selectedConversation) {
      return { sms: false, email: false, voicemail: false }
    }
    const smsRa = getChannelReadAtIso(selectedConversation.metadata, "sms")
    const inboundSmsMsgs = messages.filter((m: any) => m.sender === "customer" && m.created_at)
    const inboundSmsEv = communicationEvents.filter((e) => e.event_type === "sms" && e.direction === "inbound" && e.created_at)
    const smsInboundTimes = [
      ...inboundSmsMsgs.map((m: any) => m.created_at as string),
      ...inboundSmsEv.map((e) => e.created_at as string),
    ]
    const lastSms =
      smsInboundTimes.length > 0 ? smsInboundTimes.reduce((best, t) => (t > best ? t : best), smsInboundTimes[0]) : undefined
    const smsUnread = isAfterReadAt(lastSms, smsRa)

    const emailRa = getChannelReadAtIso(selectedConversation.metadata, "email")
    const inboundEmails = emailOnlyEvents.filter((e) => e.direction === "inbound" && e.created_at)
    const emailSorted = [...inboundEmails].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    const lastEmail = emailSorted.length ? emailSorted[emailSorted.length - 1]?.created_at : undefined
    const emailUnread = isAfterReadAt(lastEmail, emailRa)

    const vmRa = getChannelReadAtIso(selectedConversation.metadata, "voicemail")
    const inboundVm = communicationEvents.filter((e) => e.event_type === "voicemail" && e.direction === "inbound" && e.created_at)
    const vmSorted = [...inboundVm].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    const lastVm = vmSorted.length ? vmSorted[vmSorted.length - 1]?.created_at : undefined
    const voicemailUnread = isAfterReadAt(lastVm, vmRa)

    return { sms: smsUnread, email: emailUnread, voicemail: voicemailUnread }
  }, [selectedConversation, messages, emailOnlyEvents, communicationEvents])

  const selectedRowText = "#0f172a"

  return (
    <div style={{ display: "flex", position: "relative", minWidth: 0 }}>
      <div style={{ width: "100%", minWidth: 0 }}>

        <h1>Conversations</h1>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px"
        }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {showAddConversationAction && (
              <button
                onClick={() => { setShowAddConversation(true); loadCustomerList() }}
                style={{
                  background: theme.primary,
                  color: "white",
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Add Conversation
              </button>
            )}
            {showConversationSettingsButton && (
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                  color: theme.text,
                }}
              >
                {portalConfig?.controlLabels?.conversation_settings ?? "Settings"}
              </button>
            )}
            {showAutomaticRepliesButton && (
              <button
                type="button"
                onClick={() => setShowAutomaticReplies(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                  color: theme.text,
                }}
              >
                {portalConfig?.controlLabels?.automatic_replies ?? "Automatic replies"}
              </button>
            )}
            {customActionButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => setOpenCustomButtonId(btn.id)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                {btn.label}
              </button>
            ))}
            {userId ? <TabNotificationAlertsButton tab="conversations" profileUserId={userId} /> : null}
          </div>
        </div>

        {showSettings && (
          <PortalSettingsModal
            title="Conversations Settings"
            items={conversationSettingsItems}
            formValues={settingsFormValues}
            setFormValue={(id, value) => setSettingsFormValues((prev) => ({ ...prev, [id]: value }))}
            isItemVisible={isSettingItemVisible}
            onClose={closeConversationSettingsModal}
          />
        )}

        {showAutomaticReplies && (
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
              <PortalSettingItemsForm
                items={automaticRepliesItems}
                formValues={autoRepliesFormValues}
                setFormValue={(id, value) => setAutoRepliesFormValues((prev) => ({ ...prev, [id]: value }))}
                isItemVisible={isAutomaticRepliesItemVisible}
              />
              {autoRepliesFormValues.conv_auto_reply_method === "Phone call" &&
                autoRepliesFormValues.conv_auto_phone_allow_automation === "checked" && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "#f9fafb",
                      fontSize: 12,
                      color: "#374151",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: theme.text }}>Prerecorded / AI-assisted voice:</strong> when calls are placed, the platform will play an introductory notice
                    such as &quot;This is a prerecorded message&quot; before your content (required for automated outreach; exact wording may follow your counsel and carrier
                    rules).
                  </div>
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
                            border: "1px solid #fca5a5",
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
        )}

        {openCustomButtonId && (() => {
          const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
          if (!btn) return null
          const items = btn.items ?? []
          const formValues = customButtonFormValues
          const setFormValue = (itemId: string, value: string) => setCustomButtonFormValues((prev) => ({ ...prev, [itemId]: value }))
          return (
            <>
              <div onClick={() => setOpenCustomButtonId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
              <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>{btn.label}</h3>
                  <button onClick={() => setOpenCustomButtonId(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
                  {items.length === 0 && <p style={{ fontSize: "14px", opacity: 0.8 }}>No options configured.</p>}
                  {items.map((item) => {
                    if (!isCustomButtonItemVisible(item, items, formValues)) return null
                    if (item.type === "checkbox") {
                      const checked = formValues[item.id] === "checked"
                      return (
                        <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                          <input type="checkbox" checked={checked} onChange={(e) => setFormValue(item.id, e.target.checked ? "checked" : "unchecked")} />
                          <span>{item.label}</span>
                        </label>
                      )
                    }
                    if (item.type === "dropdown" && item.options?.length) {
                      const value = formValues[item.id] ?? item.options[0]
                      return (
                        <div key={item.id}>
                          <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                          <select value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }}>{item.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>
                        </div>
                      )
                    }
                    if (item.type === "custom_field") {
                      const value = formValues[item.id] ?? ""
                      const isTextarea = item.customFieldSubtype === "textarea"
                      return (
                        <div key={item.id}>
                          <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                          {isTextarea ? <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} /> : <input value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }} />}
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
                <button onClick={() => setOpenCustomButtonId(null)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}>Done</button>
              </div>
            </>
          )
        })()}

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "center",
          marginBottom: "16px",
          padding: "12px",
          background: theme.charcoalSmoke,
          borderRadius: "8px",
          border: `1px solid ${theme.border}`,
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Filter</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="By name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
              />
              <input
                type="text"
                placeholder="By phone..."
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
              >
                <option value="name">Name</option>
                <option value="created_at">Date</option>
              </select>
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
              >
                {sortAsc ? "↑ Asc" : "↓ Desc"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ width: "100%", overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: isMobile ? "760px" : "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "14%" }} />
                <col />
              </colgroup>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th
                    onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }}
                    style={{ padding: "8px", cursor: "pointer" }}
                  >
                    Name
                  </th>
                  <th style={{ padding: "8px" }}>Phone</th>
                  <th style={{ padding: "8px" }}>Channel</th>
                  <th style={{ padding: "8px" }}>Status</th>
                  <th
                    onClick={() => { setSortField("created_at"); setSortAsc(!sortAsc) }}
                    style={{ padding: "8px", cursor: "pointer" }}
                  >
                    Last Update
                  </th>
                  <th style={{ padding: "8px" }}>Last message</th>
                </tr>
              </thead>
              <tbody>
                {sortedConversations.map((convo) => {
                  const phone = convo.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value || ""
                  const email = convo.customers?.customer_identifiers?.find((i: any) => i.type === "email")?.value || ""
                  const lastMsg = (convo.messages as MessageRow[] | undefined)?.length
                    ? [...(convo.messages as MessageRow[])].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
                    : null
                  const lastMsgText = lastMsg?.content?.trim() ? (lastMsg.content!.length > 50 ? lastMsg.content!.slice(0, 50) + "…" : lastMsg.content) : "—"
                  const isRowSelected = selectedConversationId === convo.id
                  const cellBase = { padding: "8px" as const, color: isRowSelected ? selectedRowText : undefined, fontWeight: isRowSelected ? 600 as const : 400 as const }
                  return (
                    <Fragment key={convo.id}>
                    <tr
                      onClick={() => void activateConversationRow(convo.id)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #eee",
                        background: isRowSelected ? "#bae6fd" : "transparent",
                      }}
                    >
                      <td style={cellBase}>{convo.customers?.display_name ?? "—"}</td>
                      <td style={cellBase}>{convo.channel === "email" ? (email || "—") : (phone || "—")}</td>
                      <td style={cellBase}>{convo.channel ?? "—"}</td>
                      <td style={cellBase}>{normalizeConversationStatus(convo.status)}</td>
                      <td style={cellBase}>
                        {(() => {
                          const iso = displayLastUpdateIso(convo as ConversationRow)
                          return iso ? new Date(iso).toLocaleDateString() : "—"
                        })()}
                      </td>
                      <td style={{ ...cellBase, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={lastMsg?.content ?? undefined}>{lastMsgText}</td>
                    </tr>
                    {isRowSelected ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: 0,
                          borderBottom: "1px solid #e5e7eb",
                          background: "#f8fafc",
                          verticalAlign: "top",
                        }}
                      >
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: "16px 18px 20px",
                            maxWidth: "min(960px, 100%)",
                            boxSizing: "border-box",
                          }}
                        >
              {selectedConversation?.id === convo.id ? (
              <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>
                    {selectedConversation.customers?.display_name ?? "Conversation"}
                  </h3>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                    History is grouped below. Click the same list row to close this panel.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close conversation detail"
                  onClick={() => {
                    setSelectedConversation(null)
                    setSelectedConversationId(null)
                    setMessages([])
                    setCommunicationEvents([])
                  }}
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                    color: theme.text,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: 14, color: theme.text, marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, color: theme.text }}>Conversation details</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setNotesCustomerId(selectedConversation.customer_id ?? null)
                        setNotesCustomerName(selectedConversation.customers?.display_name ?? "")
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: "12px",
                        background: theme.primary,
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Notes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (detailEditMode) {
                          setDetailForm(buildDetailFormFromConversation(selectedConversation))
                          setDetailEditMode(false)
                        } else {
                          setDetailForm(buildDetailFormFromConversation(selectedConversation))
                          setDetailEditMode(true)
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: "12px",
                        background: "#fff",
                        color: theme.text,
                        border: `1px solid ${theme.border}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      {detailEditMode ? "Cancel edit" : "Edit"}
                    </button>
                  </div>
                </div>

                {pendingConvoAiReply ? (
                  <AiConsumerReplyApprovalCard
                    key={`${selectedConversation.id}-${pendingConvoAiReply.created_at}-${pendingConvoAiReply.body.length}`}
                    pending={pendingConvoAiReply}
                    contextLabel="Automatic reply"
                    busy={convoPendingAiBusy}
                    onApprove={(text) => void approveConvoPendingAi(text)}
                    onRetry={() => void retryConvoPendingAi()}
                    onDiscard={() => void dismissConvoPendingAi()}
                  />
                ) : null}

                {detailEditMode ? (
                  <div style={{ display: "grid", gap: 12, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Customer</span>
                      <input value={detailForm.customerName} onChange={(e) => setDetailForm((prev) => ({ ...prev, customerName: e.target.value }))} style={theme.formInput} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Service / job site address</span>
                      <textarea
                        value={detailForm.serviceAddress}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, serviceAddress: e.target.value }))}
                        rows={2}
                        style={{ ...theme.formInput, resize: "vertical" }}
                      />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Lat</span>
                        <input value={detailForm.serviceLat} onChange={(e) => setDetailForm((prev) => ({ ...prev, serviceLat: e.target.value }))} style={theme.formInput} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Lng</span>
                        <input value={detailForm.serviceLng} onChange={(e) => setDetailForm((prev) => ({ ...prev, serviceLng: e.target.value }))} style={theme.formInput} />
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Channel</span>
                        <select value={detailForm.channel} onChange={(e) => setDetailForm((prev) => ({ ...prev, channel: e.target.value }))} style={theme.formInput}>
                          <option value="sms">sms</option>
                          <option value="email">email</option>
                          <option value="phone">phone</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Status</span>
                        <select
                          value={detailForm.status}
                          onChange={(e) => setDetailForm((prev) => ({ ...prev, status: e.target.value }))}
                          style={theme.formInput}
                        >
                          {CONVERSATION_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Contact methods</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" onClick={() => setDetailForm((prev) => ({ ...prev, identifiers: [...prev.identifiers, { id: crypto.randomUUID(), type: "phone", value: "" }] }))} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", color: "#111827", fontWeight: 600 }}>Add phone</button>
                          <button type="button" onClick={() => setDetailForm((prev) => ({ ...prev, identifiers: [...prev.identifiers, { id: crypto.randomUUID(), type: "email", value: "" }] }))} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", color: "#111827", fontWeight: 600 }}>Add email</button>
                        </div>
                      </div>
                      {detailForm.identifiers.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No phone or email values yet.</p>
                      ) : (
                        detailForm.identifiers.map((item) => (
                          <div key={item.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8, alignItems: "center" }}>
                            <select value={item.type} onChange={(e) => setDetailForm((prev) => ({ ...prev, identifiers: prev.identifiers.map((x) => x.id === item.id ? { ...x, type: e.target.value as "phone" | "email" } : x) }))} style={theme.formInput}>
                              <option value="phone">Phone</option>
                              <option value="email">Email</option>
                            </select>
                            <input value={item.value} onChange={(e) => setDetailForm((prev) => ({ ...prev, identifiers: prev.identifiers.map((x) => x.id === item.id ? { ...x, value: e.target.value } : x) }))} style={theme.formInput} />
                            <button type="button" onClick={() => setDetailForm((prev) => ({ ...prev, identifiers: prev.identifiers.filter((x) => x.id !== item.id) }))} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", cursor: "pointer" }}>Remove</button>
                          </div>
                        ))
                      )}
                    </div>
                    {conversationSettingsItems.filter(
                      (item) => item.id !== "show_internal_conversations" && item.id !== "ai_thread_summary_enabled",
                    ).length > 0 && (
                      <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
                        <PortalSettingItemsForm
                          title="Admin-configured detail fields"
                          items={conversationSettingsItems.filter(
                            (item) => item.id !== "show_internal_conversations" && item.id !== "ai_thread_summary_enabled",
                          )}
                          formValues={detailForm.portalValues}
                          setFormValue={(id, value) => setDetailForm((prev) => ({ ...prev, portalValues: { ...prev.portalValues, [id]: value } }))}
                          isItemVisible={isDetailPortalItemVisible}
                        />
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button type="button" onClick={() => { setDetailForm(buildDetailFormFromConversation(selectedConversation)); setDetailEditMode(false) }} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "#fff", color: theme.text, cursor: "pointer" }}>Cancel</button>
                      <button type="button" onClick={() => void saveConversationDetails()} disabled={detailSaving} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", cursor: detailSaving ? "wait" : "pointer", fontWeight: 600 }}>{detailSaving ? "Saving..." : "Save details"}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 0 }}>
                      <strong>Customer:</strong> {selectedConversation.customers?.display_name ?? "—"}
                    </p>
                    {(selectedConversation.customers as CustomerRow | null)?.service_address?.trim() ||
                    (selectedConversation.customers as CustomerRow | null)?.service_lat != null ? (
                      <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
                        <strong>Service address:</strong> {(selectedConversation.customers as CustomerRow)?.service_address?.trim() || "—"}
                        {(selectedConversation.customers as CustomerRow)?.service_lat != null &&
                        (selectedConversation.customers as CustomerRow)?.service_lng != null
                          ? ` · ${Number((selectedConversation.customers as CustomerRow).service_lat).toFixed(5)}, ${Number((selectedConversation.customers as CustomerRow).service_lng).toFixed(5)}`
                          : ""}
                      </p>
                    ) : null}
                    <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      <span>
                        <strong>Phone(s):</strong>{" "}
                        {selectedConversation.customers?.customer_identifiers?.filter((i: any) => i.type === "phone").map((i: any) => i.value).join(", ") || "—"}
                      </span>
                      {(() => {
                        const first = selectedConversation.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value
                        return first?.trim() ? (
                          <CustomerCallButton phone={String(first)} bridgeOwnerUserId={userId} compact />
                        ) : null
                      })()}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Email(s):</strong> {selectedConversation.customers?.customer_identifiers?.filter((i: any) => i.type === "email").map((i: any) => i.value).join(", ") || "—"}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Channel:</strong> {selectedConversation.channel ?? "—"}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Status:</strong> {normalizeConversationStatus(selectedConversation.status)}
                    </p>
                    {conversationSettingsItems
                      .filter((item) => item.id !== "show_internal_conversations" && item.id !== "ai_thread_summary_enabled")
                      .map((item) => {
                      const saved = selectedConversation?.metadata?.portalValues?.[item.id]
                      if (!saved || !isDetailPortalItemVisible(item)) return null
                      return (
                        <p key={item.id} style={{ margin: 0 }}>
                          <strong>{item.label}:</strong> {saved}
                        </p>
                      )
                    })}
                  </>
                )}
              </div>

              <ConversationsSmsComplianceNotice />

              <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", maxWidth: 720 }}>
              <ConvoCollapsible
                key={`${selectedConversation.id}-activity`}
                title="All activity"
                countBadge={activityTimeline.length}
              >
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>
                  Text thread messages plus logged SMS/email (and other events), newest first. Expand a row for the full message.
                </p>
                {aiAutomationsEnabled && aiThreadSummaryEnabled && selectedConversation?.id ? (
                  <div style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => void summarizeThread()}
                      disabled={threadSummaryBusy}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: "#fff",
                        cursor: threadSummaryBusy ? "wait" : "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                        color: theme.text,
                      }}
                    >
                      {threadSummaryBusy ? "Summarizing…" : "Summarize thread (AI)"}
                    </button>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      Uses server OpenAI when configured. An empty thread returns “no messages to summarize” — that is different from missing server keys.
                    </span>
                  </div>
                ) : null}
                {threadSummaryText ? (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      fontSize: 13,
                      color: theme.text,
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.45,
                    }}
                  >
                    {threadSummaryText}
                  </div>
                ) : null}
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    padding: 10,
                    borderRadius: 8,
                    background: "#fafafa",
                    maxHeight: "min(42vh, 420px)",
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {activityTimeline.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No activity in this thread yet.</p>
                  ) : (
                    activityTimeline.map((item) => {
                      if (item.kind === "sms_thread") {
                        const m = item.message
                        const sender = m.sender === "customer" ? "Customer" : "You"
                        const content = typeof m.content === "string" ? m.content : ""
                        const created = typeof m.created_at === "string" ? m.created_at : ""
                        const oneLine = (content || "—").replace(/\s+/g, " ").trim()
                        return (
                          <ExpandableTimelineRow
                            key={item.key}
                            titleContent={
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                  SMS (thread) · {sender}
                                  {created ? (
                                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                      {new Date(created).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  style={{
                                    fontSize: 13,
                                    color: "#6b7280",
                                    marginTop: 4,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine}
                                </div>
                              </div>
                            }
                          >
                            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{content || "—"}</p>
                          </ExpandableTimelineRow>
                        )
                      }
                      const ev = item.event
                      const label =
                        ev.event_type === "email"
                          ? "Email"
                          : ev.event_type === "sms"
                            ? "SMS (log)"
                            : ev.event_type === "call"
                              ? "Call"
                              : ev.event_type === "voicemail"
                                ? "Voicemail"
                                : String(ev.event_type || "Event")
                      const dir = ev.direction === "inbound" ? "In" : ev.direction === "outbound" ? "Out" : ""
                      const preview =
                        ev.event_type === "email"
                          ? (ev.subject?.trim() || "(No subject)")
                          : ev.event_type === "voicemail"
                            ? voicemailPreviewLine(ev, voicemailProfileDisplay, detailForm.portalValues)
                            : (ev.body || "—").replace(/\s+/g, " ").trim().slice(0, 140)
                      return (
                        <ExpandableTimelineRow
                          key={item.key}
                          titleContent={
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                {label}
                                {dir ? ` · ${dir}` : ""}
                                {ev.created_at ? (
                                  <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                    {new Date(ev.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#6b7280",
                                  marginTop: 4,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {preview.length > 160 ? `${preview.slice(0, 160)}…` : preview}
                              </div>
                            </div>
                          }
                        >
                          {ev.event_type === "email" ? (
                            <>
                              {ev.subject?.trim() ? (
                                <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{ev.subject.trim()}</p>
                              ) : null}
                              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                            </>
                          ) : ev.event_type === "voicemail" ? (
                            <div>
                              <VoicemailRecordingBlock recordingUrl={ev.recording_url} compactNote />
                              <VoicemailTranscriptBlock
                                ev={ev}
                                profileVoicemailDisplay={voicemailProfileDisplay}
                                conversationPortalValues={detailForm.portalValues}
                              />
                              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                            </div>
                          ) : (
                            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                          )}
                          <AttachmentStrip items={commAttachmentsByEvent[ev.id] ?? []} compact />
                        </ExpandableTimelineRow>
                      )
                    })
                  )}
                </div>
              </ConvoCollapsible>

              <ConvoCollapsible
                key={`${selectedConversation.id}-sms`}
                title="Text messages"
                countBadge={smsTextTimeline.length}
                showUnreadDot={unreadChannels.sms}
                onOpen={() => void markChannelRead("sms")}
              >
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>
                  Thread texts and logged SMS (inbound webhook / sends), newest first. Up to 80 thread messages and 120 log events loaded.
                </p>
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    padding: 12,
                    borderRadius: 8,
                    background: "#fff",
                    minHeight: 72,
                    maxHeight: "min(38vh, 360px)",
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {smsTextTimeline.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No messages in this thread yet.</p>
                  ) : (
                    smsTextTimeline.map((item) => {
                      if (item.kind === "sms_thread") {
                        const m = item.message
                        const sender = m.sender === "customer" ? "Customer" : "You"
                        const content = typeof m.content === "string" ? m.content : ""
                        const created = typeof m.created_at === "string" ? m.created_at : ""
                        return (
                          <div
                            key={item.key}
                            style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                              SMS (thread) · {sender}
                              {created ? (
                                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                  {new Date(created).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                </span>
                              ) : null}
                            </div>
                            <p style={{ margin: 0, fontSize: 14, color: theme.text, whiteSpace: "pre-wrap" }}>{content || "—"}</p>
                          </div>
                        )
                      }
                      const ev = item.event
                      const dir = ev.direction === "inbound" ? "In" : ev.direction === "outbound" ? "Out" : ""
                      const preview = (ev.body || "—").replace(/\s+/g, " ").trim().slice(0, 140)
                      return (
                        <ExpandableTimelineRow
                          key={item.key}
                          titleContent={
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                SMS (log)
                                {dir ? ` · ${dir}` : ""}
                                {ev.created_at ? (
                                  <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                    {new Date(ev.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#6b7280",
                                  marginTop: 4,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {preview.length > 160 ? `${preview.slice(0, 160)}…` : preview}
                              </div>
                            </div>
                          }
                        >
                          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                          <AttachmentStrip items={commAttachmentsByEvent[ev.id] ?? []} compact />
                        </ExpandableTimelineRow>
                      )
                    })
                  )}
                </div>
                <ConvoCollapsible title="Compose reply" defaultOpen={false}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={3}
                      placeholder="Reply to this text conversation..."
                      style={{ ...theme.formInput, resize: "vertical" }}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                      MMS images (optional)
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => setSmsMediaFiles(Array.from(e.target.files ?? []))}
                        style={{ display: "block", marginTop: 6, fontSize: 13 }}
                      />
                    </label>
                    {smsMediaFiles.length > 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{smsMediaFiles.length} file(s) selected</p>
                    ) : null}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        Uses your Twilio SMS number from Admin → Communications (this user). Inbound texts appear here when that number&apos;s webhook targets <code style={{ fontSize: 11 }}>/api/incoming-sms</code> on your deployed app.
                      </span>
                      <button
                        type="button"
                        onClick={() => void sendReply()}
                        disabled={replySending}
                        style={{
                          padding: "10px 16px",
                          background: theme.primary,
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: replySending ? "wait" : "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {replySending ? "Sending..." : "Send reply"}
                      </button>
                    </div>
                  </div>
                </ConvoCollapsible>
              </ConvoCollapsible>

              <ConvoCollapsible
                key={`${selectedConversation.id}-vm`}
                title="Voicemails"
                countBadge={voicemailEvents.length}
                showUnreadDot={unreadChannels.voicemail}
                onOpen={() => void markChannelRead("voicemail")}
              >
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    padding: 12,
                    borderRadius: 8,
                    background: "#fff",
                    minHeight: 120,
                    maxHeight: "min(42vh, 380px)",
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {voicemailEvents.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                      No voicemails in this thread yet. When someone leaves a message on your Twilio number (webhook{" "}
                      <code style={{ fontSize: 11 }}>/api/voicemail-result</code>), it appears here with audio. Transcription usually arrives a few seconds later (Twilio callback).
                    </p>
                  ) : (
                    [...voicemailEvents].reverse().map((ev) => (
                      <div key={ev.id} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f3f4f6" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                          {ev.direction === "inbound" ? "Inbound" : ev.direction || "Voicemail"}
                          {ev.created_at ? (
                            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                              {new Date(ev.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          ) : null}
                        </div>
                        <VoicemailRecordingBlock recordingUrl={ev.recording_url} />
                        <VoicemailTranscriptBlock
                          ev={ev}
                          profileVoicemailDisplay={voicemailProfileDisplay}
                          conversationPortalValues={detailForm.portalValues}
                        />
                        <p style={{ margin: 0, fontSize: 14, color: theme.text, whiteSpace: "pre-wrap" }}>{ev.body || "Voicemail"}</p>
                      </div>
                    ))
                  )}
                </div>
              </ConvoCollapsible>

              <ConvoCollapsible
                key={`${selectedConversation.id}-email`}
                title="Emails"
                countBadge={emailOnlyEvents.length}
                showUnreadDot={unreadChannels.email}
                onOpen={() => void markChannelRead("email")}
              >
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>
                  One row per message. Expand to read the full body. Inbound mail appears here after Resend routes it to this thread (up to 120 logged events).
                </p>
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    padding: 10,
                    borderRadius: 8,
                    background: "#fafafa",
                    minHeight: 72,
                    maxHeight: "min(38vh, 360px)",
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {emailOnlyEvents.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No emails in this thread yet.</p>
                  ) : (
                    emailOnlyEvents.map((evt) => {
                      const subj = evt.subject?.trim() || "(No subject)"
                      const who = evt.direction === "inbound" ? "Customer" : "You"
                      const bodyPreview = (evt.body || "—").replace(/\s+/g, " ").trim()
                      return (
                        <ExpandableTimelineRow
                          key={evt.id}
                          titleContent={
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                {who} · {subj}
                                {evt.created_at ? (
                                  <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                    {new Date(evt.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#6b7280",
                                  marginTop: 4,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {bodyPreview.length > 180 ? `${bodyPreview.slice(0, 180)}…` : bodyPreview}
                              </div>
                            </div>
                          }
                        >
                          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 15 }}>{subj}</p>
                          <p style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{evt.body || "—"}</p>
                          <AttachmentStrip items={commAttachmentsByEvent[evt.id] ?? []} compact />
                          <button
                            type="button"
                            onClick={() => beginReplyToEmail(evt)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: `1px solid ${theme.border}`,
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                              color: theme.text,
                            }}
                          >
                            Reply to this message
                          </button>
                        </ExpandableTimelineRow>
                      )
                    })
                  )}
                </div>
                <ConvoCollapsible
                  key={`${selectedConversation.id}-compose-${emailComposeMountKey}`}
                  title="Compose email"
                  defaultOpen={emailComposeMountKey > 0}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>To</label>
                    <input
                      value={emailPrimaryTo}
                      onChange={(e) => setEmailPrimaryTo(e.target.value)}
                      placeholder="customer@example.com"
                      style={theme.formInput}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Additional recipients (To)</label>
                    <input
                      value={emailAdditionalTo}
                      onChange={(e) => setEmailAdditionalTo(e.target.value)}
                      placeholder="Comma-separated extra To addresses"
                      style={theme.formInput}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>CC</label>
                    <input
                      value={emailCc}
                      onChange={(e) => setEmailCc(e.target.value)}
                      placeholder="Optional, comma-separated"
                      style={theme.formInput}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>BCC</label>
                    <input
                      value={emailBcc}
                      onChange={(e) => setEmailBcc(e.target.value)}
                      placeholder="Optional (inbox copy may still be added by your channel settings)"
                      style={theme.formInput}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Reply-To (optional)</label>
                    <input
                      value={emailReplyToOverride}
                      onChange={(e) => setEmailReplyToOverride(e.target.value)}
                      placeholder="Override where replies go; leave blank to use channel forward inbox"
                      style={theme.formInput}
                    />
                    <input
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Email subject"
                      style={theme.formInput}
                    />
                    <textarea
                      value={emailReplyBody}
                      onChange={(e) => setEmailReplyBody(e.target.value)}
                      rows={6}
                      placeholder="Write your message…"
                      style={{ ...theme.formInput, resize: "vertical" }}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                      Attachments (optional)
                      <input
                        type="file"
                        multiple
                        onChange={(e) => setEmailComposeFiles(Array.from(e.target.files ?? []))}
                        style={{ display: "block", marginTop: 6, fontSize: 13 }}
                      />
                    </label>
                    {emailComposeFiles.length > 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{emailComposeFiles.length} file(s) selected</p>
                    ) : null}
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                      Signature (optional, this browser only)
                    </label>
                    <textarea
                      value={emailSignature}
                      onChange={(e) => setEmailSignature(e.target.value)}
                      onBlur={() => {
                        try {
                          localStorage.setItem("tradesman_email_signature", emailSignature)
                        } catch {
                          /* ignore */
                        }
                      }}
                      rows={3}
                      placeholder="Appended to every send from this device. Account-wide signatures in MyT coming later."
                      style={{ ...theme.formInput, resize: "vertical", fontSize: 13 }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        From address comes from your newest saved email channel in Admin → Communications (or Vercel fallback).
                      </span>
                      <button
                        type="button"
                        onClick={() => void sendEmailReply()}
                        disabled={emailSending}
                        style={{
                          padding: "10px 16px",
                          background: theme.primary,
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: emailSending ? "wait" : "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {emailSending ? "Sending..." : "Send email"}
                      </button>
                    </div>
                  </div>
                </ConvoCollapsible>
              </ConvoCollapsible>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!supabase || !selectedConversation?.customer_id) return
                  const { error } = await supabase.from("quotes").insert({
                    user_id: userId,
                    customer_id: selectedConversation.customer_id,
                    conversation_id: selectedConversation.id,
                    status: "draft",
                  })
                  if (error) {
                    console.error(error)
                    alert(
                      error.message +
                        (error.message.includes("row-level security") || error.message.includes("policy")
                          ? " Run supabase-quotes-table.sql in Supabase."
                          : "")
                    )
                    return
                  }
                  const idToRemove = selectedConversation.id
                  setSelectedConversation(null)
                  setSelectedConversationId(null)
                  setMessages([])
                  setCommunicationEvents([])
                  setConversations((prev) => prev.filter((c) => c.id !== idToRemove))
                  const { error: updateErr } = await supabase
                    .from("conversations")
                    .update({ removed_at: new Date().toISOString() })
                    .eq("id", idToRemove)
                    .eq("user_id", userId)
                  if (updateErr)
                    alert(
                      "Conversation left the list but could not save to database: " +
                        updateErr.message +
                        "\n\nRun the full supabase-run-this.sql in Supabase (including the RLS policy at the end)."
                    )
                }}
                style={{
                  marginTop: 8,
                  padding: "10px 16px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Send to Quotes
              </button>

              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!supabase || !selectedConversation?.id) return
                    if (!confirm("Remove this conversation? It can be recalled from Customers later.")) return
                    const idToRemove = selectedConversation.id
                    setSelectedConversation(null)
                    setSelectedConversationId(null)
                    setMessages([])
                    setCommunicationEvents([])
                    setConversations((prev) => prev.filter((c) => c.id !== idToRemove))
                    const { error: updateErr } = await supabase
                      .from("conversations")
                      .update({ removed_at: new Date().toISOString() })
                      .eq("id", idToRemove)
                      .eq("user_id", userId)
                    if (updateErr)
                      alert(
                        "Conversation left the list but could not save to database: " +
                          updateErr.message +
                          "\n\nRun the full supabase-run-this.sql in Supabase (including the RLS policy at the end)."
                      )
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    background: "#b91c1c",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Remove
                </button>
              </div>
              </>
              ) : (
                <p style={{ margin: 0, padding: "20px 8px", color: "#64748b", fontSize: 14 }}>Loading conversation…</p>
              )}
                        </div>
                      </td>
                    </tr>
                    ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            </div>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, marginBottom: 0 }}>
              Tip: click a row to expand conversation details below that row; click the same row again to collapse.
            </p>

        {showInternalConversations && (
          <div style={{ marginTop: "32px" }}>
            <h3 style={{ marginBottom: "12px", color: "#64748b" }}>Internal Conversations</h3>
            <p style={{ fontSize: "14px", color: "#94a3b8", marginBottom: "12px" }}>
              Team conversations (same organization). Other users can talk to each other here.
            </p>
            <button
              type="button"
              onClick={() => { setShowAddInternalConvo(true); setNewInternalConvoTitle("") }}
              style={{
                padding: "8px 14px",
                background: theme.primary,
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                marginBottom: "12px"
              }}
            >
              Add Internal Conversation
            </button>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ddd", borderRadius: "6px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd", background: "#f9fafb" }}>
                  <th style={{ padding: "8px", color: "#0f172a", fontWeight: 800, fontSize: 13 }}>Title</th>
                  <th style={{ padding: "8px", color: "#0f172a", fontWeight: 800, fontSize: 13 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {internalConversations.length === 0 ? (
                  <tr><td colSpan={2} style={{ padding: "12px", color: "#6b7280" }}>No internal conversations yet. Add one above.</td></tr>
                ) : (
                  internalConversations.map((ic) => (
                    <tr key={ic.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px", color: "#1f2937", fontSize: 14 }}>{ic.title || "Untitled"}</td>
                      <td style={{ padding: "8px", color: "#1f2937", fontSize: 14 }}>{new Date(ic.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {showAddInternalConvo && (
          <>
            <div onClick={() => setShowAddInternalConvo(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "400px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, color: theme.text }}>Add Internal Conversation</h3>
                <button onClick={() => setShowAddInternalConvo(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <input
                placeholder="Conversation title (e.g. Project Alpha)"
                value={newInternalConvoTitle}
                onChange={(e) => setNewInternalConvoTitle(e.target.value)}
                style={{ ...theme.formInput, marginBottom: "12px" }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  disabled={addInternalConvoLoading}
                  onClick={() => {
                    setAddInternalConvoLoading(true)
                    const id = crypto.randomUUID()
                    const created_at = new Date().toISOString()
                    setInternalConversations((prev) => [...prev, { id, title: newInternalConvoTitle.trim() || "Untitled", created_at }])
                    setShowAddInternalConvo(false)
                    setNewInternalConvoTitle("")
                    setAddInternalConvoLoading(false)
                  }}
                  style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {addInternalConvoLoading ? "Adding..." : "Create"}
                </button>
                <button onClick={() => setShowAddInternalConvo(false)} style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {showAddConversation && (
          <>
            <div onClick={() => setShowAddConversation(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text }}>Add Conversation</h3>
                <button onClick={() => setShowAddConversation(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: theme.text }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Conversation type</span>
                  <select value={addConvoChannel} onChange={(e) => setAddConvoChannel(e.target.value as "sms" | "email")} style={theme.formInput}>
                    <option value="sms">SMS / text</option>
                    <option value="email">Email</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={!addConvoUseNew} onChange={() => { setAddConvoUseNew(false); setAddConvoExistingId(customerList[0]?.id ?? ""); loadCustomerList() }} />
                  Select existing customer
                </label>
                {!addConvoUseNew && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: theme.text, fontSize: 13 }}>
                      <input type="checkbox" checked={showArchivedCustomers} onChange={(e) => setShowArchivedCustomers(e.target.checked)} />
                      Include archived customers
                    </label>
                    <select
                      value={addConvoExistingId}
                      onFocus={loadCustomerList}
                      onChange={(e) => setAddConvoExistingId(e.target.value)}
                      style={{ ...theme.formInput }}
                    >
                      <option value="">— Select customer —</option>
                      {customerList.map((c: any) => {
                        const email = c.customer_identifiers?.find((i: any) => i.type === "email")?.value
                        const phone = c.customer_identifiers?.find((i: any) => i.type === "phone")?.value
                        return (
                          <option key={c.id} value={c.id}>
                            {c.display_name || "Unnamed"}{addConvoChannel === "email" && email ? ` • ${email}` : addConvoChannel === "sms" && phone ? ` • ${phone}` : ""}
                          </option>
                        )
                      })}
                    </select>
                  </>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={addConvoUseNew} onChange={() => setAddConvoUseNew(true)} />
                  Create new customer
                </label>
                {addConvoUseNew && (
                  <>
                    <input placeholder="Customer name" value={addConvoNewName} onChange={(e) => setAddConvoNewName(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Phone" value={addConvoNewPhone} onChange={(e) => setAddConvoNewPhone(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Email" value={addConvoNewEmail} onChange={(e) => setAddConvoNewEmail(e.target.value)} style={{ ...theme.formInput }} />
                    {addConvoChannel === "email" && (
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                        Email conversations need a customer email address so replies can be sent from the app.
                      </p>
                    )}
                  </>
                )}
                {addConversationPortalItems.length > 0 && (
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Options (from portal config)</p>
                    <PortalSettingItemsForm
                      items={addConversationPortalItems}
                      formValues={addConversationPortalValues}
                      setFormValue={(id, v) => {
                        setAddConversationPortalValues((prev) => ({ ...prev, [id]: v }))
                        try {
                          localStorage.setItem(`convo_add_${id}`, v)
                        } catch {
                          /* ignore */
                        }
                      }}
                      isItemVisible={(item) => isCustomButtonItemVisible(item, addConversationPortalItems, addConversationPortalValues)}
                    />
                  </div>
                )}
                <button onClick={createConversationFlow} disabled={addConvoLoading} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                  {addConvoLoading ? "Creating..." : "Create Conversation"}
                </button>
                <button onClick={() => setShowAddConversation(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {notesCustomerId && (
          <CustomerNotesPanel
            customerId={notesCustomerId}
            customerName={notesCustomerName}
            onClose={() => { setNotesCustomerId(null); setNotesCustomerName("") }}
          />
        )}
      </div>
    </div>
  )
}
