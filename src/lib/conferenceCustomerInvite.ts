import { outboundMessagesJsonBody, withSupabasePublicCredentials } from "./platformToolsJsonBody"
import { supabaseAnonKey, supabaseUrl } from "./supabase"

export type ConferenceSessionClient = {
  sessionId: string
  conferenceName: string
  pin: string
  dialInE164: string | null
  dialInDisplay: string | null
  webrtcRoomId: string | null
  calendarEventId: string | null
  customerId: string | null
  createdAt: string
  expiresAt: string
}

export type CreateConferenceSessionResult = {
  ok: boolean
  session?: ConferenceSessionClient
  joinLink?: string
  shareText?: string
  error?: string
}

export async function createConferenceSessionClient(
  accessToken: string,
  opts: {
    webrtcRoomId?: string | null
    calendarEventId?: string | null
    customerId?: string | null
  },
): Promise<CreateConferenceSessionResult> {
  const token = accessToken.trim()
  if (!token) return { ok: false, error: "Not signed in" }

  const res = await fetch("/api/conference-session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      withSupabasePublicCredentials({
        webrtcRoomId: opts.webrtcRoomId ?? undefined,
        calendarEventId: opts.calendarEventId ?? undefined,
        customerId: opts.customerId ?? undefined,
      }),
    ),
  })
  const data = (await res.json().catch(() => ({}))) as CreateConferenceSessionResult & { error?: string }
  if (!res.ok) return { ok: false, error: data.error || `Request failed (${res.status})` }
  return data
}

export function buildConferenceInviteEmailHtml(input: {
  customerName: string
  senderName: string
  company: string
  dialInDisplay: string | null
  pin: string
  joinLink?: string | null
}): string {
  const name = input.customerName.trim() || "there"
  const dialBlock = input.dialInDisplay
    ? `<p><strong>Join by phone</strong><br/>
Dial <strong>${escapeHtml(input.dialInDisplay)}</strong><br/>
When prompted, enter conference PIN: <strong>${escapeHtml(input.pin)}</strong></p>`
    : `<p><strong>Conference PIN:</strong> ${escapeHtml(input.pin)}<br/>
<span style="color:#64748b">Your contractor will share the dial-in number if needed.</span></p>`

  const linkBlock =
    input.joinLink?.trim()
      ? `<p><strong>Join online</strong> (team members):<br/>
<a href="${escapeHtml(input.joinLink.trim())}">${escapeHtml(input.joinLink.trim())}</a></p>`
      : ""

  return `<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(input.senderName.trim() || input.company.trim() || "Our team")} invited you to join a live conference call.</p>
${dialBlock}
${linkBlock}
<p>Reply to this email if you need help connecting.</p>
<p>Thank you,<br/>${escapeHtml(input.company.trim() || input.senderName.trim() || "Our team")}</p>`
}

export function buildConferenceInviteEmailPlain(input: {
  customerName: string
  senderName: string
  company: string
  dialInDisplay: string | null
  pin: string
  joinLink?: string | null
}): string {
  const name = input.customerName.trim() || "there"
  const who = input.senderName.trim() || input.company.trim() || "Our team"
  const lines = [`Hi ${name},`, "", `${who} invited you to join a live conference call.`, ""]
  if (input.dialInDisplay) {
    lines.push(`Join by phone: ${input.dialInDisplay}`)
    lines.push(`Conference PIN: ${input.pin}`)
    lines.push("(Enter the PIN when prompted after dialing.)")
  } else {
    lines.push(`Conference PIN: ${input.pin}`)
  }
  if (input.joinLink?.trim()) {
    lines.push("")
    lines.push(`Join online (team): ${input.joinLink.trim()}`)
  }
  lines.push("", "Reply to this email if you need help connecting.", "", "Thank you,", who)
  return lines.join("\n")
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function emailCustomerConferenceInvite(input: {
  accessToken: string
  userId: string
  customerId: string
  customerEmail: string
  customerName: string
  senderName: string
  company: string
  webrtcRoomId?: string | null
  calendarEventId?: string | null
  subject?: string
}): Promise<{ ok: boolean; error?: string; session?: ConferenceSessionClient; joinLink?: string }> {
  const created = await createConferenceSessionClient(input.accessToken, {
    webrtcRoomId: input.webrtcRoomId,
    calendarEventId: input.calendarEventId,
    customerId: input.customerId,
  })
  if (!created.ok || !created.session) return { ok: false, error: created.error || "Could not create conference session" }

  const session = created.session
  const bodyHtml = buildConferenceInviteEmailHtml({
    customerName: input.customerName,
    senderName: input.senderName,
    company: input.company,
    dialInDisplay: session.dialInDisplay,
    pin: session.pin,
    joinLink: created.joinLink,
  })
  const body = buildConferenceInviteEmailPlain({
    customerName: input.customerName,
    senderName: input.senderName,
    company: input.company,
    dialInDisplay: session.dialInDisplay,
    pin: session.pin,
    joinLink: created.joinLink,
  })

  const res = await fetch("/api/outbound-messages?__channel=email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: outboundMessagesJsonBody({
      to: input.customerEmail.trim(),
      subject: input.subject?.trim() || "Join our conference call",
      body,
      bodyHtml,
      userId: input.userId,
      customerId: input.customerId,
      ...(input.calendarEventId ? { calendarEventId: input.calendarEventId } : {}),
    }),
  })
  const raw = await res.text()
  if (!res.ok) {
    try {
      const j = JSON.parse(raw) as { error?: string }
      return { ok: false, error: j.error || raw || `Email failed (${res.status})` }
    } catch {
      return { ok: false, error: raw || `Email failed (${res.status})` }
    }
  }
  return { ok: true, session, joinLink: created.joinLink }
}

/** For diagnostics — exposed env keys the client may need. */
export function clientSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl.trim() || import.meta.env.VITE_SUPABASE_URL) && Boolean(supabaseAnonKey.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY)
}
