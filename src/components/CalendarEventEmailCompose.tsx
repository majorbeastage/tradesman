import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { outboundMessagesJsonBody } from "../lib/platformToolsJsonBody"
import { readContactTargetFromMetadata, resolveCustomerContactByTarget } from "../lib/customerContactRouting"
import { appendHtmlEmailSignature, htmlToPlainText } from "../lib/emailSignature"
import { applyEmailTemplatePlaceholders, findEmailTemplate } from "../lib/emailTemplates"
import { uploadFilesForOutbound } from "../lib/uploadCommAttachment"
import { notifyCustomersEmailSync } from "../lib/workflowNavigation"
import { useEmailComposeSignature } from "../hooks/useEmailComposeSignature"
import EmailComposeRich from "./EmailComposeRich"
import { theme } from "../styles/theme"

function formatFetchApiError(response: Response, raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as { error?: string; message?: string }
      return j.error || j.message || trimmed || `Request failed (${response.status})`
    } catch {
      /* fall through */
    }
  }
  return trimmed || `Request failed (${response.status})`
}

export type CalendarEventEmailContext = {
  id: string
  title: string
  start_at: string
  customer_id?: string | null
  customers?: { display_name?: string | null } | null
  metadata?: unknown
}

type Props = {
  event: CalendarEventEmailContext
  userId: string
  displayName?: string | null
  role?: string | null
}

function formatAppointmentDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function formatAppointmentTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function CalendarEventEmailCompose({ event, userId, displayName, role }: Props) {
  const sig = useEmailComposeSignature(userId, role)
  const [primaryTo, setPrimaryTo] = useState("")
  const [additionalTo, setAdditionalTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [replyTo, setReplyTo] = useState("")
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [composeFiles, setComposeFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  const customerName = event.customers?.display_name?.trim() || "there"

  const templateVars = useMemo(
    () => ({
      customer_name: customerName,
      sender_name: displayName?.trim() || "Our team",
      company: "Our team",
      appointment_date: formatAppointmentDate(event.start_at),
      appointment_time: formatAppointmentTime(event.start_at),
      appointment_title: event.title?.trim() || "Your appointment",
    }),
    [customerName, displayName, event.start_at, event.title],
  )

  useEffect(() => {
    let cancelled = false
    const loadEmail = async () => {
      if (!event.customer_id || !supabase) {
        setPrimaryTo("")
        return
      }
      setEmailLoading(true)
      try {
        const { data: rows } = await supabase
          .from("customer_identifiers")
          .select("type, value, is_primary")
          .eq("customer_id", event.customer_id)
        if (cancelled) return
        const target = readContactTargetFromMetadata(event.metadata)
        const picked = resolveCustomerContactByTarget(rows ?? [], target)
        setPrimaryTo(picked.email?.trim() || "")
      } finally {
        if (!cancelled) setEmailLoading(false)
      }
    }
    void loadEmail()
    return () => {
      cancelled = true
    }
  }, [event.id, event.customer_id, event.metadata])

  useEffect(() => {
    const t = findEmailTemplate("appointment_confirm")
    if (!t) return
    const applied = applyEmailTemplatePlaceholders(t, templateVars)
    setSubject(applied.subject)
    setBodyHtml(applied.bodyHtml)
  }, [event.id, templateVars])

  const handleSend = useCallback(async () => {
    if (!userId) {
      alert("You must be signed in to send email.")
      return
    }
    const bodyHtmlWithSig = appendHtmlEmailSignature(bodyHtml.trim(), sig.signatureDoc)
    const body = htmlToPlainText(bodyHtmlWithSig)
    if (!primaryTo.trim() && !additionalTo.trim()) {
      alert("Enter at least one recipient.")
      return
    }
    if (!subject.trim() || !body.trim()) {
      alert("Enter a subject and message body.")
      return
    }
    setSending(true)
    try {
      let attachmentPublicUrls: string[] | undefined
      if (composeFiles.length > 0) {
        const urls = await uploadFilesForOutbound(userId, composeFiles, "calendar-email")
        if (urls.length) attachmentPublicUrls = urls
      }
      const response = await fetch("/api/outbound-messages?__channel=email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: outboundMessagesJsonBody({
          to: primaryTo.trim() || undefined,
          toAdditional: additionalTo.trim() || undefined,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          replyTo: replyTo.trim() || undefined,
          subject: subject.trim(),
          body,
          ...(bodyHtmlWithSig.includes("<") ? { bodyHtml: bodyHtmlWithSig } : {}),
          userId,
          customerId: event.customer_id || undefined,
          calendarEventId: event.id,
          ...(attachmentPublicUrls?.length ? { attachmentPublicUrls } : {}),
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      setComposeFiles([])
      notifyCustomersEmailSync()
      alert("Email sent.")
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }, [
    userId,
    bodyHtml,
    sig.signatureDoc,
    primaryTo,
    additionalTo,
    cc,
    bcc,
    replyTo,
    subject,
    composeFiles,
    event.customer_id,
    event.id,
  ])

  if (!event.customer_id) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
        Link a customer to this event to email them from here.
      </p>
    )
  }

  return (
    <div>
      {emailLoading ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>Loading customer email…</p>
      ) : null}
      <EmailComposeRich
        primaryTo={primaryTo}
        onPrimaryToChange={setPrimaryTo}
        additionalTo={additionalTo}
        onAdditionalToChange={setAdditionalTo}
        cc={cc}
        onCcChange={setCc}
        bcc={bcc}
        onBccChange={setBcc}
        replyTo={replyTo}
        onReplyToChange={setReplyTo}
        subject={subject}
        onSubjectChange={setSubject}
        bodyHtml={bodyHtml}
        onBodyHtmlChange={setBodyHtml}
        signatureText={sig.signatureText}
        onSignatureTextChange={sig.setSignatureText}
        onSignatureBlur={sig.onSignatureBlur}
        signatureLogoUrl={sig.signatureLogoUrl}
        onSignatureLogoUpload={(f) => void sig.uploadSignatureLogo(f)}
        onSignatureLogoClear={() => void sig.clearSignatureLogo()}
        signatureLogoUploading={sig.signatureLogoUploading}
        composeFiles={composeFiles}
        onComposeFilesChange={setComposeFiles}
        sending={sending}
        onSend={() => void handleSend()}
        templateVars={templateVars}
        defaultExpanded={false}
        footerNote={
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Appointment confirm template pre-filled. Sent via your Tradesman business address.
          </span>
        }
      />
    </div>
  )
}

export const calendarEventEmailDetailsStyle = {
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  padding: "8px 10px",
  marginBottom: 12,
} as const
