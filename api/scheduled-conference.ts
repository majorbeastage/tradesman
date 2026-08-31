import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { pickFirstString, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"
import { resolveConferenceDialInFixed } from "./_conferenceSession.js"
import {
  cancelScheduledConference,
  conferenceInviteUrl,
  createScheduledConference,
  listConferencesForUser,
  loadConferenceStore,
  publicInviteByToken,
  publicInviteOrigin,
  sendConferenceInvites,
} from "./_scheduledConference.js"

type GuestInput = { name?: string; email?: string; phone?: string }

type Body = {
  action?: string
  id?: string
  title?: string
  startsAt?: string
  endsAt?: string
  earlyJoinMinutes?: number
  customPin?: string
  hostName?: string
  hostEmail?: string
  hostPhone?: string
  guests?: GuestInput[]
  sendEmail?: boolean
  sendSms?: boolean
  supabaseUrl?: string
  supabaseAnonKey?: string
}

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")
}

function requestHost(req: VercelRequest): string {
  return pickFirstString(req.headers["x-forwarded-host"], req.headers.host) || "www.tradesman-us.com"
}

function publicConference(c: {
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
  guests: Array<{
    id: string
    name: string
    email: string | null
    phone: string | null
    inviteToken: string
    emailSentAt: string | null
    smsSentAt: string | null
    lastEmailError: string | null
    lastSmsError: string | null
  }>
  createdAt: string
  canceledAt: string | null
}, origin: string) {
  const dial = resolveConferenceDialInFixed()
  return {
    ...c,
    dialInE164: dial.e164,
    dialInDisplay: dial.display,
    guestLinks: c.guests.map((g) => ({
      id: g.id,
      name: g.name,
      email: g.email,
      phone: g.phone,
      inviteUrl: conferenceInviteUrl(origin, g.inviteToken),
      emailSentAt: g.emailSentAt,
      smsSentAt: g.smsSentAt,
      lastEmailError: g.lastEmailError,
      lastSmsError: g.lastSmsError,
    })),
  }
}

async function requireUser(req: VercelRequest, body: Body) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : ""
  if (!token) throw Object.assign(new Error("Sign in to schedule a conference."), { status: 401 })
  const supabaseUrl = pickSupabaseUrlForServer() || body.supabaseUrl?.trim() || ""
  const anonKey = pickSupabaseAnonKeyForServer() || body.supabaseAnonKey?.trim() || ""
  if (!supabaseUrl || !anonKey) throw Object.assign(new Error("Server missing Supabase URL / anon key"), { status: 500 })
  const sb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) throw Object.assign(new Error("Invalid session"), { status: 401 })
  const userId = userData.user.id
  const { data: profile } = await sb.from("profiles").select("role, display_name").eq("id", userId).maybeSingle()
  const role = typeof profile?.role === "string" ? profile.role.toLowerCase() : ""
  const isAdmin = role === "admin"
  const displayName =
    (typeof profile?.display_name === "string" && profile.display_name.trim()) ||
    (typeof userData.user.user_metadata?.display_name === "string" && userData.user.user_metadata.display_name.trim()) ||
    userData.user.email ||
    "Host"
  return { userId, isAdmin, displayName, email: userData.user.email ?? null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).end()

  const origin = publicInviteOrigin(requestHost(req))
  const tokenQ = pickFirstString(req.query?.token as string)
  if (req.method === "GET" && tokenQ) {
    try {
      const invite = await publicInviteByToken(tokenQ)
      if (!invite) return res.status(404).json({ error: "Invite not found." })
      return res.status(200).json({ ok: true, invite })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Body

  try {
    const auth = await requireUser(req, body)
    const action = pickFirstString(req.query?.action as string, body.action) || (req.method === "GET" ? "list" : "create")

    if (req.method === "GET" || action === "list") {
      const store = await loadConferenceStore()
      const rows = listConferencesForUser(store, auth.userId, auth.isAdmin).map((c) => publicConference(c, origin))
      return res.status(200).json({ ok: true, dialIn: resolveConferenceDialInFixed(), conferences: rows })
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS")
      return res.status(405).json({ error: "Method not allowed" })
    }

    if (action === "cancel") {
      const id = pickFirstString(body.id)
      if (!id) return res.status(400).json({ error: "Missing conference id." })
      const conference = await cancelScheduledConference(id, auth.userId, auth.isAdmin)
      return res.status(200).json({ ok: true, conference: publicConference(conference, origin) })
    }

    if (action === "resend") {
      const id = pickFirstString(body.id)
      if (!id) return res.status(400).json({ error: "Missing conference id." })
      const sent = await sendConferenceInvites({
        conferenceId: id,
        userId: auth.userId,
        isAdmin: auth.isAdmin,
        sendEmail: body.sendEmail !== false,
        sendSms: body.sendSms !== false,
        origin,
      })
      return res.status(200).json({
        ok: true,
        conference: publicConference(sent.conference, origin),
        emailSent: sent.emailSent,
        smsSent: sent.smsSent,
        errors: sent.errors,
      })
    }

    const created = await createScheduledConference({
      hostUserId: auth.userId,
      hostName: pickFirstString(body.hostName) || auth.displayName,
      hostEmail: pickFirstString(body.hostEmail) || auth.email,
      hostPhone: pickFirstString(body.hostPhone),
      inviteHost: Boolean(pickFirstString(body.hostEmail) || pickFirstString(body.hostPhone)),
      title: pickFirstString(body.title) || "Conference call",
      startsAt: pickFirstString(body.startsAt),
      endsAt: pickFirstString(body.endsAt),
      earlyJoinMinutes: typeof body.earlyJoinMinutes === "number" ? body.earlyJoinMinutes : 15,
      customPin: pickFirstString(body.customPin) || null,
      guests: Array.isArray(body.guests) ? body.guests : [],
    })

    const shouldEmail = body.sendEmail !== false
    const shouldSms = body.sendSms !== false
    let emailSent = 0
    let smsSent = 0
    let errors: string[] = []
    if ((shouldEmail || shouldSms) && created.guests.length > 0) {
      const sent = await sendConferenceInvites({
        conferenceId: created.id,
        userId: auth.userId,
        isAdmin: auth.isAdmin,
        sendEmail: shouldEmail,
        sendSms: shouldSms,
        origin,
      })
      emailSent = sent.emailSent
      smsSent = sent.smsSent
      errors = sent.errors
      return res.status(200).json({
        ok: true,
        conference: publicConference(sent.conference, origin),
        emailSent,
        smsSent,
        errors,
      })
    }

    return res.status(200).json({
      ok: true,
      conference: publicConference(created, origin),
      emailSent,
      smsSent,
      errors,
    })
  } catch (e) {
    const status = e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number"
      ? (e as { status: number }).status
      : 500
    return res.status(status).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
