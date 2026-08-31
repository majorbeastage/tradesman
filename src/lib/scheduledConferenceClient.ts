import { withSupabasePublicCredentials } from "./platformToolsJsonBody"

export type ScheduledConferenceGuestView = {
  id: string
  name: string
  email: string | null
  phone: string | null
  inviteUrl: string
  emailSentAt: string | null
  smsSentAt: string | null
  lastEmailError: string | null
  lastSmsError: string | null
}

export type ScheduledConferenceView = {
  id: string
  title: string
  pin: string
  hostUserId: string
  hostName: string
  hostEmail: string | null
  hostPhone: string | null
  startsAt: string
  endsAt: string
  earlyJoinMinutes: number
  createdAt: string
  canceledAt: string | null
  dialInE164: string
  dialInDisplay: string
  guestLinks: ScheduledConferenceGuestView[]
}

export type PublicConferenceInvite = {
  title: string
  startsAt: string
  endsAt: string
  dialInDisplay: string
  dialInE164: string
  pin: string
  hostName: string
  guestName: string
  canceled: boolean
  joinStatus: "ok" | "too_early" | "ended" | "canceled"
}

export type GuestDraft = { name: string; email: string; phone: string }

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
}

export async function fetchPublicConferenceInvite(token: string): Promise<PublicConferenceInvite> {
  const res = await fetch(`/api/scheduled-conference?token=${encodeURIComponent(token.trim())}`)
  const data = await parseJson(res)
  if (!res.ok || !data.invite) {
    throw new Error(typeof data.error === "string" ? data.error : "Invite not found.")
  }
  return data.invite as PublicConferenceInvite
}

export async function listScheduledConferences(accessToken: string): Promise<{
  dialIn: { e164: string; display: string }
  conferences: ScheduledConferenceView[]
}> {
  const res = await fetch("/api/scheduled-conference", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`)
  return {
    dialIn: (data.dialIn as { e164: string; display: string }) ?? { e164: "+18633418778", display: "(863) 341-8778" },
    conferences: Array.isArray(data.conferences) ? (data.conferences as ScheduledConferenceView[]) : [],
  }
}

export async function createScheduledConferenceClient(
  accessToken: string,
  input: {
    title: string
    startsAt: string
    endsAt: string
    earlyJoinMinutes?: number
    customPin?: string
    hostName?: string
    hostEmail?: string
    hostPhone?: string
    guests: GuestDraft[]
    sendEmail: boolean
    sendSms: boolean
  },
): Promise<{ conference: ScheduledConferenceView; emailSent: number; smsSent: number; errors: string[] }> {
  const res = await fetch("/api/scheduled-conference", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(
      withSupabasePublicCredentials({
        action: "create",
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        earlyJoinMinutes: input.earlyJoinMinutes ?? 15,
        customPin: input.customPin || undefined,
        hostName: input.hostName,
        hostEmail: input.hostEmail,
        hostPhone: input.hostPhone,
        guests: input.guests,
        sendEmail: input.sendEmail,
        sendSms: input.sendSms,
      }),
    ),
  })
  const data = await parseJson(res)
  if (!res.ok || !data.conference) {
    throw new Error(typeof data.error === "string" ? data.error : `Could not create conference (${res.status})`)
  }
  return {
    conference: data.conference as ScheduledConferenceView,
    emailSent: typeof data.emailSent === "number" ? data.emailSent : 0,
    smsSent: typeof data.smsSent === "number" ? data.smsSent : 0,
    errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
  }
}

export async function resendScheduledConferenceInvites(
  accessToken: string,
  id: string,
  sendEmail: boolean,
  sendSms: boolean,
): Promise<{ conference: ScheduledConferenceView; emailSent: number; smsSent: number; errors: string[] }> {
  const res = await fetch("/api/scheduled-conference", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(withSupabasePublicCredentials({ action: "resend", id, sendEmail, sendSms })),
  })
  const data = await parseJson(res)
  if (!res.ok || !data.conference) {
    throw new Error(typeof data.error === "string" ? data.error : `Could not send invites (${res.status})`)
  }
  return {
    conference: data.conference as ScheduledConferenceView,
    emailSent: typeof data.emailSent === "number" ? data.emailSent : 0,
    smsSent: typeof data.smsSent === "number" ? data.smsSent : 0,
    errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
  }
}

export async function cancelScheduledConferenceClient(accessToken: string, id: string): Promise<void> {
  const res = await fetch("/api/scheduled-conference", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(withSupabasePublicCredentials({ action: "cancel", id })),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not cancel (${res.status})`)
}

export function formatConferenceWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

export function conferenceShareText(c: { title: string; startsAt: string; dialInDisplay: string; pin: string }): string {
  return [
    c.title,
    formatConferenceWhen(c.startsAt),
    `Dial ${c.dialInDisplay}`,
    `PIN ${c.pin}`,
  ].join("\n")
}

export function toLocalDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function defaultConferenceWindow(): { start: string; end: string } {
  const start = new Date()
  start.setMinutes(start.getMinutes() + 15, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start: toLocalDateTimeValue(start), end: toLocalDateTimeValue(end) }
}
