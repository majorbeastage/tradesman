import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import { useIsMobile } from "../../hooks/useIsMobile"
import EmailComposeRich from "../../components/EmailComposeRich"
import { EmailEventAddressLine } from "../../components/EmailEventAddressLine"
import {
  appendHtmlEmailSignature,
  htmlToPlainText,
} from "../../lib/emailSignature"
import { useEmailComposeSignature } from "../../hooks/useEmailComposeSignature"
import { formatAppError } from "../../lib/formatAppError"
import { sandboxTrainingAlert, useSandboxTrainingMode } from "../../lib/sandboxTrainingUi"
import { uploadFilesForOutbound } from "../../lib/uploadCommAttachment"
import { queueCustomerFocus } from "../../lib/customerNavigation"
import {
  CUSTOMERS_EMAIL_INBOX_REFRESH_EVENT,
  notifyCustomersEmailSync,
} from "../../lib/workflowNavigation"
import {
  filterThreadsByFolder,
  filterThreadsBySearch,
  groupEmailEventsIntoThreads,
  loadEmailInboxEvents,
  resolveConversationIdForCustomer,
  type EmailInboxFolder,
  type EmailInboxThread,
} from "../../lib/customersEmailInboxData"
import { navigateToCustomersList, openCustomersEmailInNewTab } from "../../lib/customersEmailClientNav"

type CustomerPickRow = {
  id: string
  display_name: string | null
  customer_identifiers?: { type: string; value: string }[] | null
}

function formatFetchApiError(response: Response, raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>
      if (typeof j.error === "string" && j.error.trim()) return j.error.trim()
      if (typeof j.message === "string" && j.message.trim()) return j.message.trim()
    } catch {
      /* ignore */
    }
  }
  return trimmed || `Request failed (HTTP ${response.status})`
}

type Props = {
  setPage?: (page: string) => void
}

export default function CustomersEmailInboxPage({ setPage }: Props) {
  const userId = useScopedUserId()
  const { user, role } = useAuth()
  const isMobile = useIsMobile()
  const sandboxTraining = useSandboxTrainingMode()
  const emailSig = useEmailComposeSignature(userId, role)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [threads, setThreads] = useState<EmailInboxThread[]>([])
  const [folder, setFolder] = useState<EmailInboxFolder>("inbox")
  const [search, setSearch] = useState("")
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [mobilePane, setMobilePane] = useState<"browse" | "thread">("browse")

  const [customerList, setCustomerList] = useState<CustomerPickRow[]>([])
  const [composeCustomerId, setComposeCustomerId] = useState("")
  const [composeTo, setComposeTo] = useState("")
  const [composeAdditionalTo, setComposeAdditionalTo] = useState("")
  const [composeCc, setComposeCc] = useState("")
  const [composeBcc, setComposeBcc] = useState("")
  const [composeReplyTo, setComposeReplyTo] = useState("")
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBodyHtml, setComposeBodyHtml] = useState("")
  const [composeFiles, setComposeFiles] = useState<File[]>([])
  const [composeSending, setComposeSending] = useState(false)
  const [composeMountKey, setComposeMountKey] = useState(0)

  const filteredThreads = useMemo(() => {
    const byFolder = filterThreadsByFolder(threads, folder)
    return filterThreadsBySearch(byFolder, search)
  }, [threads, folder, search])

  const selectedThread = useMemo(
    () => filteredThreads.find((t) => t.threadKey === selectedThreadKey) ?? filteredThreads[0] ?? null,
    [filteredThreads, selectedThreadKey],
  )

  const templateVars = useMemo(
    () => ({
      customer_name: selectedThread?.customerName?.trim() || "there",
      sender_name:
        (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "") ||
        user?.email?.split("@")[0] ||
        "Our team",
      company: "Our team",
    }),
    [selectedThread?.customerName, user],
  )

  const [replySubject, setReplySubject] = useState("")
  const [replyBodyHtml, setReplyBodyHtml] = useState("")
  const [replyTo, setReplyTo] = useState("")
  const [replyAdditionalTo, setReplyAdditionalTo] = useState("")
  const [replyCc, setReplyCc] = useState("")
  const [replyBcc, setReplyBcc] = useState("")
  const [replyReplyTo, setReplyReplyTo] = useState("")
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replySending, setReplySending] = useState(false)
  const [replyMountKey, setReplyMountKey] = useState(0)

  useEffect(() => {
    if (!isMobile) setMobilePane("browse")
  }, [isMobile])

  useEffect(() => {
    if (isMobile && mobilePane === "thread" && !selectedThread) {
      setMobilePane("browse")
    }
  }, [isMobile, mobilePane, selectedThread])

  const openThread = useCallback(
    (threadKey: string) => {
      setSelectedThreadKey(threadKey)
      if (isMobile) setMobilePane("thread")
    },
    [isMobile],
  )

  const showBrowseList = !isMobile || mobilePane === "browse"
  const showThreadDetail = !isMobile || mobilePane === "thread"

  const reloadInbox = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadError(null)
    try {
      const events = await loadEmailInboxEvents(userId)
      const grouped = groupEmailEventsIntoThreads(events)
      setThreads(grouped)
    } catch (e) {
      setLoadError(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reloadInbox()
  }, [reloadInbox])

  useEffect(() => {
    const onRefresh = () => void reloadInbox()
    window.addEventListener(CUSTOMERS_EMAIL_INBOX_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(CUSTOMERS_EMAIL_INBOX_REFRESH_EVENT, onRefresh)
  }, [reloadInbox])

  useEffect(() => {
    if (!supabase || !userId) return
    void supabase
      .from("customers")
      .select("id, display_name, customer_identifiers(type, value)")
      .eq("user_id", userId)
      .order("display_name")
      .then(({ data }) => setCustomerList((data ?? []) as CustomerPickRow[]))
  }, [userId])

  useEffect(() => {
    if (!selectedThread) {
      setReplySubject("")
      setReplyBodyHtml("")
      setReplyTo("")
      return
    }
    const latest = selectedThread.events[selectedThread.events.length - 1]
    const subj = latest?.subject?.trim() || selectedThread.subject
    setReplySubject(subj.toLowerCase().startsWith("re:") ? subj : `Re: ${subj.replace(/^re:\s*/i, "")}`)
    setReplyBodyHtml("")
    setReplyTo(selectedThread.customerEmail ?? "")
    setReplyAdditionalTo("")
    setReplyCc("")
    setReplyBcc("")
    setReplyReplyTo("")
    setReplyFiles([])
    setReplyMountKey((k) => k + 1)
  }, [selectedThread?.threadKey])

  async function sendOutboundEmail(opts: {
    to: string
    additionalTo?: string
    cc?: string
    bcc?: string
    replyTo?: string
    subject: string
    bodyHtmlRaw: string
    customerId?: string | null
    conversationId?: string | null
    files: File[]
  }) {
    if (!userId) throw new Error("You must be signed in to send email.")
    const bodyHtml = appendHtmlEmailSignature(opts.bodyHtmlRaw.trim(), emailSig.signatureDoc)
    const body = htmlToPlainText(bodyHtml)
    if (!opts.to.trim() && !opts.additionalTo?.trim()) throw new Error("Enter at least one recipient.")
    if (!opts.subject.trim()) throw new Error("Enter a subject.")
    if (!body.trim()) throw new Error("Enter message body.")

    let attachmentPublicUrls: string[] | undefined
    if (opts.files.length > 0) {
      const urls = await uploadFilesForOutbound(userId, opts.files, "email-inbox")
      if (urls.length) attachmentPublicUrls = urls
    }

    const response = await fetch("/api/outbound-messages?__channel=email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: opts.to.trim() || undefined,
        toAdditional: opts.additionalTo?.trim() || undefined,
        cc: opts.cc?.trim() || undefined,
        bcc: opts.bcc?.trim() || undefined,
        replyTo: opts.replyTo?.trim() || undefined,
        subject: opts.subject.trim(),
        body,
        ...(bodyHtml.includes("<") ? { bodyHtml } : {}),
        userId,
        customerId: opts.customerId || undefined,
        conversationId: opts.conversationId || undefined,
        ...(attachmentPublicUrls?.length ? { attachmentPublicUrls } : {}),
      }),
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(formatFetchApiError(response, raw))
    notifyCustomersEmailSync()
  }

  async function handleComposeSend() {
    setComposeSending(true)
    try {
      let customerId = composeCustomerId.trim() || null
      let conversationId: string | null = null
      if (customerId && userId) {
        conversationId = await resolveConversationIdForCustomer(userId, customerId)
      }
      await sendOutboundEmail({
        to: composeTo,
        additionalTo: composeAdditionalTo,
        cc: composeCc,
        bcc: composeBcc,
        replyTo: composeReplyTo,
        subject: composeSubject,
        bodyHtmlRaw: composeBodyHtml,
        customerId,
        conversationId,
        files: composeFiles,
      })
      setComposeBodyHtml("")
      setComposeSubject("")
      setComposeFiles([])
      setComposeMountKey((k) => k + 1)
      setShowCompose(false)
      await reloadInbox()
    } catch (e) {
      sandboxTrainingAlert(sandboxTraining, formatAppError(e), "communication")
    } finally {
      setComposeSending(false)
    }
  }

  async function handleReplySend() {
    if (!selectedThread) return
    setReplySending(true)
    try {
      let conversationId = selectedThread.conversationId
      if (!conversationId && selectedThread.customerId && userId) {
        conversationId = await resolveConversationIdForCustomer(userId, selectedThread.customerId)
      }
      await sendOutboundEmail({
        to: replyTo,
        additionalTo: replyAdditionalTo,
        cc: replyCc,
        bcc: replyBcc,
        replyTo: replyReplyTo,
        subject: replySubject,
        bodyHtmlRaw: replyBodyHtml,
        customerId: selectedThread.customerId,
        conversationId,
        files: replyFiles,
      })
      setReplyBodyHtml("")
      setReplyFiles([])
      setReplyMountKey((k) => k + 1)
      await reloadInbox()
    } catch (e) {
      sandboxTrainingAlert(sandboxTraining, formatAppError(e), "communication")
    } finally {
      setReplySending(false)
    }
  }

  function openCustomerInEventsTab(customerId: string | null) {
    if (!customerId) return
    queueCustomerFocus(customerId)
    navigateToCustomersList(setPage)
  }

  const layoutCols = isMobile ? "1fr" : "240px minmax(280px, 340px) minmax(0, 1fr)"

  return (
    <div style={{ padding: isMobile ? "8px 8px 32px" : "8px 16px 40px", maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: isMobile ? 8 : 10,
          alignItems: isMobile ? "stretch" : "center",
          marginBottom: 12,
        }}
      >
        <div style={{ flex: isMobile ? "1 1 100%" : undefined }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? "1.35rem" : "1.6rem", fontWeight: 800, color: theme.text }}>
            Email
          </h1>
          {!isMobile ? (
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Synced with Customers — sends and replies appear in both places.
            </span>
          ) : (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              Synced with Customers events.
            </p>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: isMobile ? "100%" : undefined }}>
          <button
            type="button"
            onClick={() => {
              setShowCompose((v) => !v)
              if (isMobile && !showCompose) setMobilePane("browse")
            }}
            style={{ ...primaryBtnStyle, marginLeft: 0, flex: isMobile ? "1 1 auto" : undefined }}
          >
            {showCompose ? "Close compose" : "Compose"}
          </button>
          <button
            type="button"
            onClick={() => void reloadInbox()}
            style={{ ...ghostBtnStyle, flex: isMobile ? "1 1 auto" : undefined }}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => openCustomersEmailInNewTab()}
            title="Open email client in a new browser tab"
            style={{ ...ghostBtnStyle, flex: isMobile ? "1 1 auto" : undefined }}
          >
            Open in new tab
          </button>
        </div>
      </div>

      {loadError ? <p style={{ color: "#b91c1c" }}>{loadError}</p> : null}

      {isMobile && showBrowseList ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {(["inbox", "sent", "all"] as EmailInboxFolder[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFolder(f)}
              style={{
                ...folderPillStyle,
                fontWeight: folder === f ? 800 : 600,
                background: folder === f ? "#fff7ed" : "#fff",
                borderColor: folder === f ? theme.primary : theme.border,
              }}
            >
              {f === "inbox" ? "Inbox" : f === "sent" ? "Sent" : "All"}
            </button>
          ))}
          <input
            type="search"
            placeholder="Search mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...theme.formInput, flex: "1 1 140px", minWidth: 140, fontSize: 16 }}
          />
        </div>
      ) : null}

      {showCompose ? (
        <div style={{ marginBottom: 16 }}>
          <div style={panelStyle}>
            <label style={fieldLabelStyle}>
              Link to customer (optional)
              <select
                value={composeCustomerId}
                onChange={(e) => {
                  const id = e.target.value
                  setComposeCustomerId(id)
                  const row = customerList.find((c) => c.id === id)
                  const em =
                    row?.customer_identifiers?.find((i) => i.type === "email" && i.value?.trim())?.value?.trim() ?? ""
                  if (em) setComposeTo(em)
                }}
                style={theme.formInput}
              >
                <option value="">— New / external address —</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name?.trim() || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <EmailComposeRich
              key={`compose-${composeMountKey}`}
              primaryTo={composeTo}
              onPrimaryToChange={setComposeTo}
              additionalTo={composeAdditionalTo}
              onAdditionalToChange={setComposeAdditionalTo}
              cc={composeCc}
              onCcChange={setComposeCc}
              bcc={composeBcc}
              onBccChange={setComposeBcc}
              replyTo={composeReplyTo}
              onReplyToChange={setComposeReplyTo}
              subject={composeSubject}
              onSubjectChange={setComposeSubject}
              bodyHtml={composeBodyHtml}
              onBodyHtmlChange={setComposeBodyHtml}
              signatureText={emailSig.signatureText}
              onSignatureTextChange={emailSig.setSignatureText}
              onSignatureBlur={emailSig.onSignatureBlur}
              signatureLogoUrl={emailSig.signatureLogoUrl}
              onSignatureLogoUpload={(f) => void emailSig.uploadSignatureLogo(f)}
              onSignatureLogoClear={() => void emailSig.clearSignatureLogo()}
              signatureLogoUploading={emailSig.signatureLogoUploading}
              templateVars={templateVars}
              composeFiles={composeFiles}
              onComposeFilesChange={setComposeFiles}
              sending={composeSending}
              onSend={() => void handleComposeSend()}
              defaultExpanded
            />
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: layoutCols,
          gap: 12,
          alignItems: "stretch",
          minHeight: isMobile ? undefined : 560,
        }}
      >
        {!isMobile ? (
          <aside style={panelStyle}>
            <p style={sectionTitleStyle}>Folders</p>
            {(["inbox", "sent", "all"] as EmailInboxFolder[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFolder(f)}
                style={{
                  ...folderBtnStyle,
                  fontWeight: folder === f ? 800 : 600,
                  background: folder === f ? "#fff7ed" : "#fff",
                  borderColor: folder === f ? theme.primary : theme.border,
                }}
              >
                {f === "inbox" ? "Inbox" : f === "sent" ? "Sent" : "All mail"}
              </button>
            ))}
            <input
              type="search"
              placeholder="Search mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...theme.formInput, marginTop: 12, fontSize: 13 }}
            />
          </aside>
        ) : null}

        {showBrowseList ? (
        <section style={{ ...panelStyle, display: "flex", flexDirection: "column", minHeight: isMobile ? undefined : 320 }}>
          <p style={sectionTitleStyle}>
            {loading ? "Loading…" : `${filteredThreads.length} conversation${filteredThreads.length === 1 ? "" : "s"}`}
          </p>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {!loading && filteredThreads.length === 0 ? (
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>No email yet. Compose a message or wait for inbound mail.</p>
            ) : null}
            {filteredThreads.map((t) => {
              const active = selectedThread?.threadKey === t.threadKey
              return (
                <button
                  key={t.threadKey}
                  type="button"
                  onClick={() => openThread(t.threadKey)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: active ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    background: active ? "#fff7ed" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.customerName}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>
                      {formatShortDate(t.latestAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.subject}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.preview}
                  </div>
                  {t.messageCount > 1 ? (
                    <span style={{ fontSize: 11, color: theme.primary, fontWeight: 700 }}>{t.messageCount} messages</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
        ) : null}

        {showThreadDetail ? (
        <section style={{ ...panelStyle, minHeight: isMobile ? undefined : 320 }}>
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobilePane("browse")}
              style={{ ...ghostBtnStyle, marginBottom: 12, padding: "6px 0", border: "none" }}
            >
              ← Back to inbox
            </button>
          ) : null}
          {!selectedThread ? (
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Select a conversation to read and reply.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>{selectedThread.subject}</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                    {selectedThread.customerName}
                    {selectedThread.customerEmail ? ` · ${selectedThread.customerEmail}` : ""}
                  </p>
                </div>
                {selectedThread.customerId ? (
                  <button
                    type="button"
                    style={ghostBtnStyle}
                    onClick={() => openCustomerInEventsTab(selectedThread.customerId)}
                  >
                    View in Customers
                  </button>
                ) : null}
              </div>

              <div
                style={{
                  maxHeight: isMobile ? "none" : 340,
                  overflowY: isMobile ? "visible" : "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {selectedThread.events.map((ev) => (
                  <article
                    key={ev.id}
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: ev.direction === "outbound" ? "#f8fafc" : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ev.direction === "outbound" ? theme.primary : "#0f766e" }}>
                        {ev.direction === "outbound" ? "Sent" : "Received"}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{formatLongDate(ev.created_at)}</span>
                    </div>
                    {ev.subject?.trim() ? (
                      <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13, color: theme.text }}>{ev.subject}</p>
                    ) : null}
                    <EmailEventAddressLine event={ev} />
                    <div
                      style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: theme.text, whiteSpace: "pre-wrap" }}
                    >
                      {ev.body?.trim() || "(Empty body)"}
                    </div>
                  </article>
                ))}
              </div>

              <EmailComposeRich
                key={`reply-${selectedThread.threadKey}-${replyMountKey}`}
                primaryTo={replyTo}
                onPrimaryToChange={setReplyTo}
                additionalTo={replyAdditionalTo}
                onAdditionalToChange={setReplyAdditionalTo}
                cc={replyCc}
                onCcChange={setReplyCc}
                bcc={replyBcc}
                onBccChange={setReplyBcc}
                replyTo={replyReplyTo}
                onReplyToChange={setReplyReplyTo}
                subject={replySubject}
                onSubjectChange={setReplySubject}
                bodyHtml={replyBodyHtml}
                onBodyHtmlChange={setReplyBodyHtml}
                signatureText={emailSig.signatureText}
                onSignatureTextChange={emailSig.setSignatureText}
                onSignatureBlur={emailSig.onSignatureBlur}
                signatureLogoUrl={emailSig.signatureLogoUrl}
                onSignatureLogoUpload={(f) => void emailSig.uploadSignatureLogo(f)}
                onSignatureLogoClear={() => void emailSig.clearSignatureLogo()}
                signatureLogoUploading={emailSig.signatureLogoUploading}
                templateVars={templateVars}
                composeFiles={replyFiles}
                onComposeFilesChange={setReplyFiles}
                sending={replySending}
                onSend={() => void handleReplySend()}
                defaultExpanded={false}
                footerNote={
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Reply appears in this inbox and on the customer&apos;s event timeline.
                  </span>
                }
              />
            </>
          )}
        </section>
        ) : null}
      </div>

      {!user?.id ? (
        <p style={{ color: "#b91c1c", marginTop: 12 }}>Sign in to use the email client.</p>
      ) : null}
    </div>
  )
}

function formatShortDate(iso: string): string {
  const d = Date.parse(iso)
  if (!Number.isFinite(d)) return ""
  const dt = new Date(d)
  const now = new Date()
  if (dt.toDateString() === now.toDateString()) {
    return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatLongDate(iso: string | null): string {
  if (!iso) return ""
  const d = Date.parse(iso)
  if (!Number.isFinite(d)) return iso
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

const panelStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  background: "#fff",
  padding: 12,
  boxSizing: "border-box",
}

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 12,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}

const folderPillStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  color: theme.text,
  fontWeight: 600,
}

const folderBtnStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  marginBottom: 6,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  color: theme.text,
}

const primaryBtnStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}

const ghostBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.primary,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 12,
}
