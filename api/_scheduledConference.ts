import { randomBytes } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv, toTwilioE164 } from "./_communications.js"
import { isPhoneSmsOptedOut } from "./_smsOptOut.js"
import {
  formatUsPhone,
  resolveConferenceDialInFixed,
  type ConferenceSessionRecord,
} from "./_conferenceSession.js"

export const SCHEDULED_CONFERENCES_SETTINGS_KEY = "scheduled_conference_calls"

export type ScheduledConferenceGuest = {
  id: string
  name: string
  email: string | null
  phone: string | null
  inviteToken: string
  emailSentAt: string | null
  smsSentAt: string | null
  lastEmailError: string | null
  lastSmsError: string | null
}

export type ScheduledConference = {
  id: string
  title: string
  pin: string
  conferenceName: string
  hostUserId: string
  hostName: string
  hostEmail: string | null
  hostPhone: string | null
  startsAt: string
  endsAt: string
  earlyJoinMinutes: number
  guests: ScheduledConferenceGuest[]
  createdAt: string
  canceledAt: string | null
}

type ScheduledConferenceStore = {
  byId: Record<string, ScheduledConference>
  pinIndex: Record<string, string>
  tokenIndex: Record<string, { conferenceId: string; guestId: string }>
}

export type ConferenceJoinStatus = "ok" | "too_early" | "ended" | "canceled"

export type ScheduledConferencePinHit = {
  conference: ScheduledConference
  joinStatus: ConferenceJoinStatus
  speakableStart: string
}

function emptyStore(): ScheduledConferenceStore {
  return { byId: {}, pinIndex: {}, tokenIndex: {} }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function parseGuest(raw: unknown): ScheduledConferenceGuest | null {
  const o = asRecord(raw)
  const id = typeof o.id === "string" ? o.id : ""
  const inviteToken = typeof o.inviteToken === "string" ? o.inviteToken : ""
  if (!id || !inviteToken) return null
  return {
    id,
    name: typeof o.name === "string" ? o.name : "",
    email: typeof o.email === "string" && o.email.includes("@") ? o.email.trim() : null,
    phone: typeof o.phone === "string" && o.phone.trim() ? o.phone.trim() : null,
    inviteToken,
    emailSentAt: typeof o.emailSentAt === "string" ? o.emailSentAt : null,
    smsSentAt: typeof o.smsSentAt === "string" ? o.smsSentAt : null,
    lastEmailError: typeof o.lastEmailError === "string" ? o.lastEmailError : null,
    lastSmsError: typeof o.lastSmsError === "string" ? o.lastSmsError : null,
  }
}

function parseConference(raw: unknown): ScheduledConference | null {
  const o = asRecord(raw)
  const id = typeof o.id === "string" ? o.id : ""
  const pin = typeof o.pin === "string" ? o.pin.replace(/\D/g, "") : ""
  const startsAt = typeof o.startsAt === "string" ? o.startsAt : ""
  const endsAt = typeof o.endsAt === "string" ? o.endsAt : ""
  if (!id || pin.length < 4 || !startsAt || !endsAt) return null
  const guests = Array.isArray(o.guests) ? o.guests.map(parseGuest).filter((g): g is ScheduledConferenceGuest => Boolean(g)) : []
  return {
    id,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Conference call",
    pin,
    conferenceName: typeof o.conferenceName === "string" && o.conferenceName.trim() ? o.conferenceName : `sched-${id}`,
    hostUserId: typeof o.hostUserId === "string" ? o.hostUserId : "",
    hostName: typeof o.hostName === "string" ? o.hostName : "",
    hostEmail: typeof o.hostEmail === "string" && o.hostEmail.includes("@") ? o.hostEmail : null,
    hostPhone: typeof o.hostPhone === "string" && o.hostPhone.trim() ? o.hostPhone : null,
    startsAt,
    endsAt,
    earlyJoinMinutes: typeof o.earlyJoinMinutes === "number" && Number.isFinite(o.earlyJoinMinutes) ? Math.max(0, Math.min(180, o.earlyJoinMinutes)) : 15,
    guests,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    canceledAt: typeof o.canceledAt === "string" ? o.canceledAt : null,
  }
}

function readStore(value: unknown): ScheduledConferenceStore {
  const o = asRecord(value)
  const byIdRaw = asRecord(o.byId)
  const byId: Record<string, ScheduledConference> = {}
  for (const [id, raw] of Object.entries(byIdRaw)) {
    const rec = parseConference(raw)
    if (rec) byId[id] = rec
  }
  const pinIndex: Record<string, string> = {}
  const tokenIndex: Record<string, { conferenceId: string; guestId: string }> = {}
  for (const rec of Object.values(byId)) {
    if (!rec.canceledAt) pinIndex[rec.pin] = rec.id
    for (const g of rec.guests) {
      tokenIndex[g.inviteToken] = { conferenceId: rec.id, guestId: g.id }
    }
  }
  return { byId, pinIndex, tokenIndex }
}

async function loadStore(admin: SupabaseClient): Promise<ScheduledConferenceStore> {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", SCHEDULED_CONFERENCES_SETTINGS_KEY).maybeSingle()
  if (error) throw new Error(error.message)
  return readStore(data?.value)
}

async function saveStore(admin: SupabaseClient, store: ScheduledConferenceStore): Promise<void> {
  const { error } = await admin.from("platform_settings").upsert(
    {
      key: SCHEDULED_CONFERENCES_SETTINGS_KEY,
      value: {
        byId: store.byId,
        pinIndex: store.pinIndex,
        tokenIndex: store.tokenIndex,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  )
  if (error) throw new Error(error.message)
}

export function speakableEasternTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "the scheduled time"
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function joinStatusForConference(conf: ScheduledConference, now = Date.now()): ConferenceJoinStatus {
  if (conf.canceledAt) return "canceled"
  const start = Date.parse(conf.startsAt)
  const end = Date.parse(conf.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "ended"
  const openAt = start - conf.earlyJoinMinutes * 60 * 1000
  if (now < openAt) return "too_early"
  if (now > end) return "ended"
  return "ok"
}

export async function findScheduledConferenceByPin(pinRaw: string): Promise<ScheduledConferencePinHit | null> {
  const pin = pinRaw.replace(/\D/g, "").trim()
  if (pin.length < 4) return null
  const admin = createServiceSupabase()
  const store = await loadStore(admin)
  const id = store.pinIndex[pin]
  if (!id) return null
  const conference = store.byId[id]
  if (!conference || conference.pin !== pin) return null
  return {
    conference,
    joinStatus: joinStatusForConference(conference),
    speakableStart: speakableEasternTime(conference.startsAt),
  }
}

export function scheduledConferenceToSession(conf: ScheduledConference): ConferenceSessionRecord {
  const dial = resolveConferenceDialInFixed()
  return {
    sessionId: conf.id,
    conferenceName: conf.conferenceName,
    pin: conf.pin,
    dialInE164: dial.e164,
    dialInDisplay: dial.display,
    webrtcRoomId: null,
    calendarEventId: null,
    customerId: null,
    createdAt: conf.createdAt,
    expiresAt: conf.endsAt,
  }
}

function randomPin(length = 6): string {
  const min = 10 ** (length - 1)
  const max = 10 ** length - 1
  return String(Math.floor(min + Math.random() * (max - min + 1)))
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`
}

function inviteToken(): string {
  return randomBytes(12).toString("hex")
}

export function publicInviteOrigin(reqHost?: string | null): string {
  const env = firstEnv("VITE_SITE_URL", "PUBLIC_APP_URL", "VITE_PUBLIC_APP_ORIGIN").replace(/\/$/, "")
  if (env) return env
  if (reqHost) return `https://${reqHost.replace(/^https?:\/\//, "").split(",")[0].trim()}`
  return "https://www.tradesman-us.com"
}

export function conferenceInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/conference/${encodeURIComponent(token)}`
}

export type PublicInviteView = {
  title: string
  startsAt: string
  endsAt: string
  dialInDisplay: string
  dialInE164: string
  pin: string
  hostName: string
  guestName: string
  canceled: boolean
  joinStatus: ConferenceJoinStatus
}

export async function publicInviteByToken(tokenRaw: string): Promise<PublicInviteView | null> {
  const token = tokenRaw.trim()
  if (!token) return null
  const admin = createServiceSupabase()
  const store = await loadStore(admin)
  const hit = store.tokenIndex[token]
  if (!hit) return null
  const conference = store.byId[hit.conferenceId]
  const guest = conference?.guests.find((g) => g.id === hit.guestId)
  if (!conference || !guest) return null
  const dial = resolveConferenceDialInFixed()
  return {
    title: conference.title,
    startsAt: conference.startsAt,
    endsAt: conference.endsAt,
    dialInDisplay: dial.display,
    dialInE164: dial.e164,
    pin: conference.pin,
    hostName: conference.hostName,
    guestName: guest.name,
    canceled: Boolean(conference.canceledAt),
    joinStatus: joinStatusForConference(conference),
  }
}

export function listConferencesForUser(store: ScheduledConferenceStore, userId: string, isAdmin: boolean): ScheduledConference[] {
  const rows = Object.values(store.byId).filter((c) => isAdmin || c.hostUserId === userId)
  return rows.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
}

export async function loadConferenceStore(): Promise<ScheduledConferenceStore> {
  return loadStore(createServiceSupabase())
}

export type CreateScheduledConferenceInput = {
  hostUserId: string
  hostName: string
  hostEmail?: string | null
  hostPhone?: string | null
  title: string
  startsAt: string
  endsAt: string
  earlyJoinMinutes?: number
  customPin?: string | null
  inviteHost?: boolean
  guests: Array<{ name?: string; email?: string; phone?: string }>
}

export async function createScheduledConference(input: CreateScheduledConferenceInput): Promise<ScheduledConference> {
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Start and end time are required.")
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("End time must be after the start time.")
  }
  if (endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60 * 1000) {
    throw new Error("Conference cannot be longer than 12 hours.")
  }

  const admin = createServiceSupabase()
  const store = await loadStore(admin)
  const custom = (input.customPin ?? "").replace(/\D/g, "")
  if (custom && (custom.length < 4 || custom.length > 8)) {
    throw new Error("Custom PIN must be 4 to 8 digits.")
  }
  let pin = custom || randomPin(6)
  if (!custom) {
    for (let i = 0; i < 30 && store.pinIndex[pin]; i++) pin = randomPin(6)
  }
  if (store.pinIndex[pin]) throw new Error("That PIN is already in use for another live conference. Pick a different PIN.")

  const id = newId("sc")
  const guests: ScheduledConferenceGuest[] = []
  for (const g of input.guests) {
    const email = (g.email ?? "").trim().toLowerCase()
    const phone = toTwilioE164(g.phone ?? "") || (g.phone ?? "").trim()
    const name = (g.name ?? "").trim()
    if (!email && !phone) continue
    guests.push({
      id: newId("g"),
      name: name || (email ? email.split("@")[0] : "Guest"),
      email: email.includes("@") ? email : null,
      phone: phone || null,
      inviteToken: inviteToken(),
      emailSentAt: null,
      smsSentAt: null,
      lastEmailError: null,
      lastSmsError: null,
    })
  }

  const hostEmail = (input.hostEmail ?? "").trim().toLowerCase()
  const hostPhone = toTwilioE164(input.hostPhone ?? "") || (input.hostPhone ?? "").trim()
  if (input.inviteHost && (hostEmail.includes("@") || hostPhone) && !guests.some((g) => g.email === hostEmail || g.phone === hostPhone)) {
    guests.unshift({
      id: newId("g"),
      name: input.hostName.trim() || "Host",
      email: hostEmail.includes("@") ? hostEmail : null,
      phone: hostPhone || null,
      inviteToken: inviteToken(),
      emailSentAt: null,
      smsSentAt: null,
      lastEmailError: null,
      lastSmsError: null,
    })
  }

  const record: ScheduledConference = {
    id,
    title: input.title.trim() || "Conference call",
    pin,
    conferenceName: `sched-${id}`,
    hostUserId: input.hostUserId,
    hostName: input.hostName.trim() || "Host",
    hostEmail: hostEmail.includes("@") ? hostEmail : null,
    hostPhone: hostPhone || null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    earlyJoinMinutes: input.earlyJoinMinutes ?? 15,
    guests,
    createdAt: new Date().toISOString(),
    canceledAt: null,
  }

  store.byId[id] = record
  store.pinIndex[pin] = id
  for (const g of guests) store.tokenIndex[g.inviteToken] = { conferenceId: id, guestId: g.id }
  await saveStore(admin, store)
  return record
}

export async function cancelScheduledConference(id: string, userId: string, isAdmin: boolean): Promise<ScheduledConference> {
  const admin = createServiceSupabase()
  const store = await loadStore(admin)
  const rec = store.byId[id]
  if (!rec) throw new Error("Conference not found.")
  if (!isAdmin && rec.hostUserId !== userId) throw new Error("You can only cancel your own conference.")
  rec.canceledAt = new Date().toISOString()
  delete store.pinIndex[rec.pin]
  store.byId[id] = rec
  await saveStore(admin, store)
  return rec
}

export function buildInvitePlain(input: {
  guestName: string
  hostName: string
  title: string
  startsAt: string
  dialInDisplay: string
  pin: string
  inviteUrl?: string | null
}): string {
  const when = speakableEasternTime(input.startsAt)
  const lines = [
    `Hi ${input.guestName.trim() || "there"},`,
    "",
    `${input.hostName.trim() || "A host"} invited you to a conference call: ${input.title}.`,
    "",
    `When: ${when} (Eastern)`,
    `Dial: ${input.dialInDisplay}`,
    `PIN: ${input.pin}`,
    "",
    "Call the number at the scheduled time and enter the PIN when prompted.",
  ]
  if (input.inviteUrl) {
    lines.push("", `Details: ${input.inviteUrl}`)
  }
  return lines.join("\n")
}

export function buildInviteHtml(input: {
  guestName: string
  hostName: string
  title: string
  startsAt: string
  endsAt: string
  dialInDisplay: string
  pin: string
  inviteUrl?: string | null
}): string {
  const when = speakableEasternTime(input.startsAt)
  const until = speakableEasternTime(input.endsAt)
  const link = input.inviteUrl
    ? `<p><a href="${escapeHtml(input.inviteUrl)}">Open your conference details</a></p>`
    : ""
  return `<p>Hi ${escapeHtml(input.guestName.trim() || "there")},</p>
<p>${escapeHtml(input.hostName.trim() || "A host")} invited you to a conference call.</p>
<p><strong>${escapeHtml(input.title)}</strong><br/>
${escapeHtml(when)} – ${escapeHtml(until)} (Eastern)</p>
<p><strong>Join by phone</strong><br/>
Dial <strong>${escapeHtml(input.dialInDisplay)}</strong><br/>
When prompted, enter PIN <strong>${escapeHtml(input.pin)}</strong></p>
${link}
<p>Call at the scheduled time. The PIN only works for this one conference.</p>`
}

export function buildInviteSms(input: {
  title: string
  startsAt: string
  dialInDisplay: string
  pin: string
  inviteUrl?: string | null
}): string {
  const when = new Date(input.startsAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const parts = [`Conference: ${input.title}`, `Dial ${input.dialInDisplay} PIN ${input.pin}`, when]
  if (input.inviteUrl) parts.push(input.inviteUrl)
  return parts.join("\n")
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

async function sendResendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) throw new Error("Email is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).")
  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  })
  if (!sendRes.ok) {
    const t = await sendRes.text()
    throw new Error(t.slice(0, 240) || `Resend rejected the send (${sendRes.status})`)
  }
}

async function sendTwilioSms(toRaw: string, body: string, hostUserId: string): Promise<void> {
  const to = toTwilioE164(toRaw)
  if (!to) throw new Error("Invalid phone number.")
  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  if (!accountSid || !authToken) throw new Error("SMS is not configured (Twilio).")

  const admin = createServiceSupabase()
  if (hostUserId && (await isPhoneSmsOptedOut(admin, hostUserId, to))) {
    throw new Error("This number has opted out of SMS.")
  }

  const messagingServiceSid = firstEnv("TWILIO_MESSAGING_SERVICE_SID").trim()
  const fromNumber = resolveConferenceDialInFixed().e164 || toTwilioE164(firstEnv("TWILIO_FROM_NUMBER", "SMS_DEFAULT_FROM_NUMBER"))
  if (!messagingServiceSid && !fromNumber) throw new Error("No Twilio From number or Messaging Service for SMS.")

  const params = new URLSearchParams({ To: to, Body: body })
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid)
  if (fromNumber) params.set("From", fromNumber)

  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  })
  if (!twilioRes.ok) {
    const t = await twilioRes.text()
    throw new Error(t.slice(0, 240) || `Twilio rejected the SMS (${twilioRes.status})`)
  }
}

export type InviteSendResult = {
  conference: ScheduledConference
  emailSent: number
  smsSent: number
  errors: string[]
}

export async function sendConferenceInvites(opts: {
  conferenceId: string
  userId: string
  isAdmin: boolean
  sendEmail: boolean
  sendSms: boolean
  origin: string
}): Promise<InviteSendResult> {
  const admin = createServiceSupabase()
  const store = await loadStore(admin)
  const conference = store.byId[opts.conferenceId]
  if (!conference) throw new Error("Conference not found.")
  if (!opts.isAdmin && conference.hostUserId !== opts.userId) throw new Error("You can only send invites for your own conference.")
  if (conference.canceledAt) throw new Error("This conference was canceled.")

  const dial = resolveConferenceDialInFixed()
  const errors: string[] = []
  let emailSent = 0
  let smsSent = 0
  const now = new Date().toISOString()

  for (const guest of conference.guests) {
    const inviteUrl = conferenceInviteUrl(opts.origin, guest.inviteToken)
    const plain = buildInvitePlain({
      guestName: guest.name,
      hostName: conference.hostName,
      title: conference.title,
      startsAt: conference.startsAt,
      dialInDisplay: dial.display,
      pin: conference.pin,
      inviteUrl,
    })
    const html = buildInviteHtml({
      guestName: guest.name,
      hostName: conference.hostName,
      title: conference.title,
      startsAt: conference.startsAt,
      endsAt: conference.endsAt,
      dialInDisplay: dial.display,
      pin: conference.pin,
      inviteUrl,
    })
    const sms = buildInviteSms({
      title: conference.title,
      startsAt: conference.startsAt,
      dialInDisplay: dial.display,
      pin: conference.pin,
      inviteUrl,
    })

    if (opts.sendEmail && guest.email) {
      try {
        await sendResendEmail(guest.email, `${conference.title} — dial ${dial.display}`, plain, html)
        guest.emailSentAt = now
        guest.lastEmailError = null
        emailSent += 1
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        guest.lastEmailError = msg
        errors.push(`${guest.name || guest.email}: email — ${msg}`)
      }
    }
    if (opts.sendSms && guest.phone) {
      try {
        await sendTwilioSms(guest.phone, sms, conference.hostUserId)
        guest.smsSentAt = now
        guest.lastSmsError = null
        smsSent += 1
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        guest.lastSmsError = msg
        errors.push(`${guest.name || guest.phone}: text — ${msg}`)
      }
    }
  }

  store.byId[conference.id] = conference
  await saveStore(admin, store)
  return { conference, emailSent, smsSent, errors }
}
