import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv, getPrimarySmsChannelForUser, samePhoneDigits, toTwilioE164 } from "./_communications.js"

export const CONFERENCE_SESSIONS_META_KEY = "conference_sessions_v1"

/** Owned PSTN conference line (863-341-8778). Override with CONFERENCE_DIAL_IN_E164. */
export const DEFAULT_CONFERENCE_DIAL_IN_E164 = "+18633418778"

export type ConferenceSessionRecord = {
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

type ConferenceSessionsMeta = {
  byId: Record<string, ConferenceSessionRecord>
  pinIndex: Record<string, string>
}

function emptyMeta(): ConferenceSessionsMeta {
  return { byId: {}, pinIndex: {} }
}

function readMeta(metadata: unknown): ConferenceSessionsMeta {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return emptyMeta()
  const raw = (metadata as Record<string, unknown>)[CONFERENCE_SESSIONS_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyMeta()
  const o = raw as Record<string, unknown>
  const byId =
    o.byId && typeof o.byId === "object" && !Array.isArray(o.byId)
      ? (o.byId as Record<string, ConferenceSessionRecord>)
      : {}
  const pinIndex =
    o.pinIndex && typeof o.pinIndex === "object" && !Array.isArray(o.pinIndex)
      ? (o.pinIndex as Record<string, string>)
      : {}
  return { byId, pinIndex }
}

function writeMeta(metadata: unknown, sessions: ConferenceSessionsMeta): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  base[CONFERENCE_SESSIONS_META_KEY] = sessions
  return base
}

export function formatUsPhone(e164: string): string {
  const d = e164.replace(/\D/g, "")
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : ""
  if (ten.length !== 10) return e164
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

export function resolveConferenceDialInFixed(): { e164: string; display: string } {
  const envDial = toTwilioE164(firstEnv("CONFERENCE_DIAL_IN_E164", "TWILIO_CONFERENCE_DIAL_IN"))
  const e164 = envDial || DEFAULT_CONFERENCE_DIAL_IN_E164
  return { e164, display: formatUsPhone(e164) }
}

export function isConferenceDialInNumber(to: string): boolean {
  if (!to.trim()) return false
  const candidates = [DEFAULT_CONFERENCE_DIAL_IN_E164, resolveConferenceDialInFixed().e164]
  return candidates.some((n) => samePhoneDigits(n, to))
}

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function newSessionId(): string {
  return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function pruneExpired(meta: ConferenceSessionsMeta, now = Date.now()): ConferenceSessionsMeta {
  const byId: Record<string, ConferenceSessionRecord> = {}
  const pinIndex: Record<string, string> = {}
  for (const [id, rec] of Object.entries(meta.byId)) {
    if (Date.parse(rec.expiresAt) <= now) continue
    byId[id] = rec
    if (rec.pin) pinIndex[rec.pin] = id
  }
  return { byId, pinIndex }
}

export async function resolveConferenceDialInE164(userId: string): Promise<{ e164: string | null; display: string | null }> {
  const fixed = resolveConferenceDialInFixed()
  if (fixed.e164) return fixed

  try {
    const admin = createServiceSupabase()
    const ch = await getPrimarySmsChannelForUser(admin, userId)
    const e164 = toTwilioE164(ch?.public_address ?? "")
    if (e164) return { e164, display: formatUsPhone(e164) }
  } catch {
    /* fall through */
  }

  const fallback = toTwilioE164(firstEnv("TWILIO_FROM_NUMBER", "SMS_DEFAULT_FROM_NUMBER"))
  if (fallback) return { e164: fallback, display: formatUsPhone(fallback) }
  return { e164: null, display: null }
}

export async function createConferenceSession(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    webrtcRoomId?: string | null
    calendarEventId?: string | null
    customerId?: string | null
    ttlHours?: number
  },
): Promise<ConferenceSessionRecord> {
  const { data: profile, error } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw new Error(error.message)

  const ttlHours = opts.ttlHours ?? 4
  const now = Date.now()
  const meta = pruneExpired(readMeta(profile?.metadata), now)

  const existing = opts.webrtcRoomId
    ? Object.values(meta.byId).find((s) => s.webrtcRoomId === opts.webrtcRoomId && Date.parse(s.expiresAt) > now)
    : opts.calendarEventId
      ? Object.values(meta.byId).find((s) => s.calendarEventId === opts.calendarEventId && Date.parse(s.expiresAt) > now)
      : null
  if (existing) return existing

  const dial = await resolveConferenceDialInE164(userId)
  let pin = randomPin()
  for (let i = 0; i < 20 && meta.pinIndex[pin]; i++) pin = randomPin()

  const sessionId = newSessionId()
  const conferenceName = `tm-${userId.replace(/-/g, "").slice(0, 8)}-${Date.now()}`
  const createdAt = new Date(now).toISOString()
  const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString()

  const record: ConferenceSessionRecord = {
    sessionId,
    conferenceName,
    pin,
    dialInE164: dial.e164,
    dialInDisplay: dial.display,
    webrtcRoomId: opts.webrtcRoomId?.trim() || null,
    calendarEventId: opts.calendarEventId?.trim() || null,
    customerId: opts.customerId?.trim() || null,
    createdAt,
    expiresAt,
  }

  meta.byId[sessionId] = record
  meta.pinIndex[pin] = sessionId

  const { error: upErr } = await supabase
    .from("profiles")
    .update({ metadata: writeMeta(profile?.metadata, meta) })
    .eq("id", userId)
  if (upErr) throw new Error(upErr.message)

  return record
}

export async function findConferenceSessionByPin(pinRaw: string): Promise<ConferenceSessionRecord | null> {
  const pin = pinRaw.replace(/\D/g, "").trim()
  if (pin.length < 4) return null

  const admin = createServiceSupabase()
  const { data: rows, error } = await admin.from("profiles").select("id, metadata").limit(500)
  if (error || !rows?.length) return null

  const now = Date.now()
  for (const row of rows) {
    const meta = pruneExpired(readMeta(row.metadata), now)
    const sessionId = meta.pinIndex[pin]
    if (!sessionId) continue
    const rec = meta.byId[sessionId]
    if (rec && rec.pin === pin && Date.parse(rec.expiresAt) > now) return rec
  }
  return null
}

export function buildConferenceShareText(input: {
  dialInDisplay: string | null
  pin: string
  businessName?: string
}): string {
  const who = input.businessName?.trim() || "Our team"
  const lines = [`${who} invited you to join a conference call.`]
  if (input.dialInDisplay) {
    lines.push(`Dial ${input.dialInDisplay}`)
    lines.push(`When prompted, enter PIN ${input.pin}`)
  } else {
    lines.push(`Conference PIN: ${input.pin}`)
    lines.push("We will call you, or reply to this email for the dial-in number.")
  }
  return lines.join("\n")
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
  const lines = [
    `Hi ${name},`,
    "",
    `${who} invited you to join a live conference call.`,
    "",
  ]
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
  lines.push("", "Reply to this email if you need help connecting.", "", `Thank you,`, who)
  return lines.join("\n")
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function conferenceJoinUrl(origin: string, pin: string): string {
  const base = origin.replace(/\/$/, "")
  return `${base}/?conference_pin=${encodeURIComponent(pin)}`
}
