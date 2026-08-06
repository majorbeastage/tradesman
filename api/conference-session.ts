import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import {
  buildConferenceShareText,
  conferenceJoinUrl,
  createConferenceSession,
  resolveConferenceDialInE164,
} from "./_conferenceSession.js"
import { pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

type Body = {
  webrtcRoomId?: string
  calendarEventId?: string
  customerId?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")
  if (req.method === "OPTIONS") return res.status(204).end()

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : ""
  if (!token) return res.status(401).json({ error: "Missing Authorization: Bearer <token>" })

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Body
  const supabaseUrl = pickSupabaseUrlForServer() || body.supabaseUrl?.trim() || ""
  const anonKey = pickSupabaseAnonKeyForServer() || body.supabaseAnonKey?.trim() || ""
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: "Server missing Supabase URL / anon key" })
  }

  const sb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" })
  const userId = userData.user.id

  try {
    const record = await createConferenceSession(sb, userId, {
      webrtcRoomId: body.webrtcRoomId,
      calendarEventId: body.calendarEventId,
      customerId: body.customerId,
    })
    const proto = typeof req.headers["x-forwarded-proto"] === "string" ? req.headers["x-forwarded-proto"].split(",")[0] : "https"
    const host =
      typeof req.headers["x-forwarded-host"] === "string"
        ? req.headers["x-forwarded-host"].split(",")[0].trim()
        : typeof req.headers.host === "string"
          ? req.headers.host
          : "www.tradesman-us.com"
    const origin = `${proto}://${host}`
    const joinLink = conferenceJoinUrl(origin, record.pin)
    const dial = await resolveConferenceDialInE164(userId)
    const { data: prof } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle()
    const businessName = typeof prof?.display_name === "string" ? prof.display_name.trim() : ""

    return res.status(200).json({
      ok: true,
      session: record,
      joinLink,
      shareText: buildConferenceShareText({
        dialInDisplay: record.dialInDisplay ?? dial.display,
        pin: record.pin,
        businessName,
      }),
    })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
