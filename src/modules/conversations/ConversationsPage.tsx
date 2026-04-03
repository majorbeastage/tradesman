import { useEffect, useState, useMemo, Fragment, type ReactNode } from "react"
import { supabase } from "../../lib/supabase"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import PortalSettingItemsForm from "../../components/PortalSettingItemsForm"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import { getControlItemsForUser, getCustomActionButtonsForUser, getPageActionVisible } from "../../types/portal-builder"
import type { PortalSettingItem } from "../../types/portal-builder"
import { useIsMobile } from "../../hooks/useIsMobile"

type CustomerIdentifier = { type: string; value: string; is_primary?: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
type MessageRow = { content: string | null; created_at: string | null }
type EmailEventRow = {
  id: string
  subject: string | null
  body: string | null
  direction: string | null
  created_at: string | null
  metadata?: { to?: string; from?: string } | null
}
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
}

type ConversationsPageProps = { setPage?: (page: string) => void }

/** Supabase PostgrestError and other objects stringify to [object Object] in alerts */
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

function ConvoCollapsible({
  title,
  defaultOpen,
  showUnreadDot,
  onOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  showUnreadDot?: boolean
  /** Called when the user expands this section (not on initial mount). */
  onOpen?: () => void
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
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {title}
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
        <span style={{ fontSize: 18, lineHeight: 1, color: "#6b7280" }} aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div style={{ padding: 14, borderTop: `1px solid ${theme.border}` }}>{children}</div>
      )}
    </div>
  )
}

export default function ConversationsPage({ setPage }: ConversationsPageProps) {
  const userId = useScopedUserId()
  const portalConfig = usePortalConfigForPage()
  const isMobile = useIsMobile()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
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
  const [emailEvents, setEmailEvents] = useState<EmailEventRow[]>([])
  const [addConvoChannel, setAddConvoChannel] = useState<"sms" | "email">("sms")
  const [showArchivedCustomers, setShowArchivedCustomers] = useState(false)
  const [detailEditMode, setDetailEditMode] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailForm, setDetailForm] = useState<ConversationDetailForm>({
    customerName: "",
    channel: "sms",
    status: "open",
    identifiers: [],
    portalValues: {},
  })
  const conversationSettingsItems = useMemo(() => getControlItemsForUser(portalConfig, "conversations", "conversation_settings"), [portalConfig])
  const addConversationPortalItems = useMemo(() => getControlItemsForUser(portalConfig, "conversations", "add_conversation"), [portalConfig])
  const [addConversationPortalValues, setAddConversationPortalValues] = useState<Record<string, string>>({})
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "conversations"), [portalConfig])
  const showAddConversationAction = getPageActionVisible(portalConfig, "conversations", "add_conversation")

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
    if (!showSettings || conversationSettingsItems.length === 0) return
    const next: Record<string, string> = {}
    conversationSettingsItems.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [showSettings, conversationSettingsItems])

  function isSettingItemVisible(item: PortalSettingItem): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = conversationSettingsItems.find((i) => i.id === depId)
    let depValue = settingsFormValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
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
      if (item.id === "show_internal_conversations") return
      if (item.type === "checkbox") portalValues[item.id] = savedPortalValues[item.id] ?? (item.defaultChecked ? "checked" : "unchecked")
      else if (item.type === "dropdown" && item.options?.length) portalValues[item.id] = savedPortalValues[item.id] ?? item.options[0]
      else portalValues[item.id] = savedPortalValues[item.id] ?? ""
    })
    return {
      customerName: convo?.customers?.display_name ?? "",
      channel: convo?.channel ?? "sms",
      status: convo?.status ?? "open",
      identifiers,
      portalValues,
    }
  }

  function isDetailPortalItemVisible(item: PortalSettingItem): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = conversationSettingsItems.find((i) => i.id === depId)
    let depValue = detailForm.portalValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
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
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = items.find((i) => i.id === depId)
    let depValue = formValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
  }

  // Conversations settings (persist in localStorage for now)
  const [showInternalConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("convo_showInternalConversations") ?? "true") } catch { return true }
  })
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
    const selectWithRemoved = `
      id,
      channel,
      status,
      created_at,
      removed_at,
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      ),
      messages (
        content,
        created_at
      )
    `
    const selectWithoutRemoved = `
      id,
      channel,
      status,
      created_at,
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      ),
      messages (
        content,
        created_at
      )
    `
    let { data, error } = await supabase
      .from("conversations")
      .select(selectWithRemoved)
      .eq("user_id", userId)
      .is("removed_at", null)
      .order("created_at", { ascending: false })

    if (error && error.message?.includes("removed_at")) {
      const res = await supabase
        .from("conversations")
        .select(selectWithoutRemoved)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
      if (res.error) {
        console.error(res.error)
        return
      }
      data = (res.data || []).map((c: any) => ({ ...c, removed_at: c.removed_at ?? null }))
    } else if (error) {
      console.error(error)
      return
    }

    setConversations((data as any[]) || [])
  }

  useEffect(() => {
    loadConversations()
  }, [userId])

  /** Default-open SMS + email sections are visible when the row opens — mark read in one update to avoid parallel metadata races. */
  useEffect(() => {
    if (!supabase || !selectedConversation?.id) return
    let cancelled = false
    const convoId = selectedConversation.id
    const prev =
      selectedConversation.metadata && typeof selectedConversation.metadata === "object"
        ? { ...(selectedConversation.metadata as Record<string, unknown>) }
        : {}
    const prevRead =
      prev.convoReadAt && typeof prev.convoReadAt === "object" && !Array.isArray(prev.convoReadAt)
        ? { ...(prev.convoReadAt as Record<string, string>) }
        : {}
    const now = new Date().toISOString()
    const convoReadAt = { ...prevRead, sms: now, email: now }
    const metadata = { ...prev, convoReadAt }
    void (async () => {
      const { error } = await supabase.from("conversations").update({ metadata }).eq("id", convoId)
      if (cancelled || error) {
        if (error) console.error(error)
        return
      }
      setSelectedConversation((c: any) => (c && c.id === convoId ? { ...c, metadata } : c))
    })()
    return () => {
      cancelled = true
    }
  }, [selectedConversation?.id])

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

    if (error && String(error.message || "").includes("metadata")) {
      const fallback = await supabase
        .from("conversations")
        .select(selectWithoutMetadata)
        .eq("id", convoId)
        .single()
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

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: true })

    setMessages(msgs || [])
    const { data: emailData } = await supabase
      .from("communication_events")
      .select("id, subject, body, direction, created_at, metadata")
      .eq("conversation_id", convoId)
      .eq("event_type", "email")
      .order("created_at", { ascending: true })

    setEmailEvents((emailData as EmailEventRow[] | null) ?? [])
    const latestOutbound = ((emailData as EmailEventRow[] | null) ?? [])
      .filter((evt) => evt.direction === "outbound" && evt.subject)
      .slice(-1)[0]
    setReplySubject(latestOutbound?.subject ?? "")
    setEmailReplyBody("")
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

      const { error: customerErr } = await supabase
        .from("customers")
        .update({ display_name: detailForm.customerName.trim() || null })
        .eq("id", selectedConversation.customer_id)
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
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body: trimmed, userId, conversationId: selectedConversation.id }),
      })
      const raw = await response.text()
      if (!response.ok) {
        throw new Error(raw || `Failed with HTTP ${response.status}`)
      }
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedConversation.id,
        sender: "user",
        content: trimmed,
      })
      if (error) throw error
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), sender: "user", content: trimmed, created_at: new Date().toISOString() }])
      setReplyBody("")
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setReplySending(false)
    }
  }

  async function sendEmailReply() {
    if (!supabase || !selectedConversation?.id) return
    const to = selectedConversation.customers?.customer_identifiers?.find((i: any) => i.type === "email")?.value?.trim?.() ?? ""
    const subject = replySubject.trim()
    const body = emailReplyBody.trim()
    if (!to) {
      alert("This conversation does not have a customer email address.")
      return
    }
    if (!subject || !body) {
      alert("Enter a subject and email body.")
      return
    }
    setEmailSending(true)
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          userId,
          conversationId: selectedConversation.id,
          customerId: selectedConversation.customer_id,
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(raw || `Failed with HTTP ${response.status}`)
      const event: EmailEventRow = {
        id: crypto.randomUUID(),
        subject,
        body,
        direction: "outbound",
        created_at: new Date().toISOString(),
        metadata: { to },
      }
      setEmailEvents((prev) => [...prev, event])
      setEmailReplyBody("")
      await loadConversations()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setEmailSending(false)
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
      aVal = a.created_at || ""
      bVal = b.created_at || ""
    }
    if (sortAsc) return aVal > bVal ? 1 : -1
    return aVal < bVal ? 1 : -1
  })

  const unreadChannels = useMemo(() => {
    if (!selectedConversation) {
      return { sms: false, email: false, voicemail: false }
    }
    const smsRa = getChannelReadAtIso(selectedConversation.metadata, "sms")
    const inboundSms = messages.filter((m: any) => m.sender === "customer" && m.created_at)
    const smsSorted = [...inboundSms].sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""))
    const lastSms = smsSorted.length ? smsSorted[smsSorted.length - 1]?.created_at : undefined
    const smsUnread = isAfterReadAt(lastSms, smsRa)

    const emailRa = getChannelReadAtIso(selectedConversation.metadata, "email")
    const inboundEmails = emailEvents.filter((e) => e.direction === "inbound" && e.created_at)
    const emailSorted = [...inboundEmails].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    const lastEmail = emailSorted.length ? emailSorted[emailSorted.length - 1]?.created_at : undefined
    const emailUnread = isAfterReadAt(lastEmail, emailRa)

    return { sms: smsUnread, email: emailUnread, voicemail: false }
  }, [selectedConversation, messages, emailEvents])

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
            <button
              onClick={() => setShowSettings(true)}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                background: "white",
                cursor: "pointer",
                color: theme.text
              }}
            >
              Settings
            </button>
            {customActionButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => setOpenCustomButtonId(btn.id)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {showSettings && (
          <PortalSettingsModal
            title="Conversations Settings"
            items={conversationSettingsItems}
            formValues={settingsFormValues}
            setFormValue={(id, value) => setSettingsFormValues((prev) => ({ ...prev, [id]: value }))}
            isItemVisible={isSettingItemVisible}
            onClose={() => setShowSettings(false)}
          />
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
                      <td style={cellBase}>{convo.status ?? "—"}</td>
                      <td style={cellBase}>
                        {convo.created_at ? new Date(convo.created_at).toLocaleDateString() : "—"}
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

                {detailEditMode ? (
                  <div style={{ display: "grid", gap: 12, padding: 12, border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Customer</span>
                      <input value={detailForm.customerName} onChange={(e) => setDetailForm((prev) => ({ ...prev, customerName: e.target.value }))} style={theme.formInput} />
                    </label>
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
                        <input value={detailForm.status} onChange={(e) => setDetailForm((prev) => ({ ...prev, status: e.target.value }))} style={theme.formInput} />
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
                    {conversationSettingsItems.filter((item) => item.id !== "show_internal_conversations").length > 0 && (
                      <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
                        <PortalSettingItemsForm
                          title="Admin-configured detail fields"
                          items={conversationSettingsItems.filter((item) => item.id !== "show_internal_conversations")}
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
                    <p style={{ margin: 0 }}>
                      <strong>Phone(s):</strong> {selectedConversation.customers?.customer_identifiers?.filter((i: any) => i.type === "phone").map((i: any) => i.value).join(", ") || "—"}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Email(s):</strong> {selectedConversation.customers?.customer_identifiers?.filter((i: any) => i.type === "email").map((i: any) => i.value).join(", ") || "—"}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Channel:</strong> {selectedConversation.channel ?? "—"}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Status:</strong> {selectedConversation.status ?? "—"}
                    </p>
                    {conversationSettingsItems.filter((item) => item.id !== "show_internal_conversations").map((item) => {
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

              <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", maxWidth: 720 }}>
              <ConvoCollapsible
                key={`${selectedConversation.id}-sms`}
                title="Text messages"
                defaultOpen
                showUnreadDot={unreadChannels.sms}
                onOpen={() => void markChannelRead("sms")}
              >
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    padding: 12,
                    borderRadius: 8,
                    background: "#fff",
                    minHeight: 200,
                    maxHeight: 280,
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {messages.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No messages in this thread yet.</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                          {msg.sender === "customer" ? "Customer" : "You"}
                          {msg.created_at ? (
                            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                              {new Date(msg.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          ) : null}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, color: theme.text, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                      </div>
                    ))
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
                    maxHeight: 200,
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                    No voicemails are attached to this conversation yet. When call recordings are linked here, they will appear in this section.
                  </p>
                </div>
              </ConvoCollapsible>

              <ConvoCollapsible
                key={`${selectedConversation.id}-email`}
                title="Emails"
                defaultOpen
                showUnreadDot={unreadChannels.email}
                onOpen={() => void markChannelRead("email")}
              >
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    padding: 12,
                    borderRadius: 8,
                    background: "#fff",
                    minHeight: 200,
                    maxHeight: 280,
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {emailEvents.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No emails in this thread yet.</p>
                  ) : (
                    emailEvents.map((evt) => (
                      <div key={evt.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                          {evt.direction === "inbound" ? "Customer email" : "You"}
                          {evt.created_at ? (
                            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                              {new Date(evt.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 6 }}>{evt.subject || "(No subject)"}</div>
                        <p style={{ margin: 0, fontSize: 14, color: theme.text, whiteSpace: "pre-wrap" }}>{evt.body || "—"}</p>
                      </div>
                    ))
                  )}
                </div>
                <ConvoCollapsible title="Compose email" defaultOpen={false}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Email subject"
                      style={theme.formInput}
                    />
                    <textarea
                      value={emailReplyBody}
                      onChange={(e) => setEmailReplyBody(e.target.value)}
                      rows={5}
                      placeholder="Write an email reply..."
                      style={{ ...theme.formInput, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        Sends through your configured business email channel when available.
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
                  if (setPage) setPage("quotes")
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
            <h3 style={{ marginBottom: "12px", color: theme.text }}>Internal Conversations</h3>
            <p style={{ fontSize: "14px", color: theme.text, marginBottom: "12px" }}>
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
                  <th style={{ padding: "8px" }}>Title</th>
                  <th style={{ padding: "8px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {internalConversations.length === 0 ? (
                  <tr><td colSpan={2} style={{ padding: "12px", color: "#6b7280" }}>No internal conversations yet. Add one above.</td></tr>
                ) : (
                  internalConversations.map((ic) => (
                    <tr key={ic.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px" }}>{ic.title || "Untitled"}</td>
                      <td style={{ padding: "8px" }}>{new Date(ic.created_at).toLocaleString()}</td>
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
