import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, logCommunicationEvent, normalizePhone, pickFirstString } from "./_communications.js"

type HelpDeskOption = {
  id?: string
  digit?: string
  label?: string
  enabled?: boolean
  forward_to_phone?: string | null
}

type HelpDeskPayload = {
  title?: string
  greeting_mode?: string
  greeting_text?: string
  greeting_recording_url?: string
  menu_enabled?: boolean
  options?: HelpDeskOption[]
  /** Profile UUIDs that receive help-desk voicemails in Conversations / events. */
  voicemail_notify_user_ids?: unknown
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

function requestPublicOrigin(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers.host)
  if (!host) return "https://tradesman.vercel.app"
  return `${proto}://${host}`
}

function normalizeMenuOptions(raw: HelpDeskOption[] | undefined): HelpDeskOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => ({
      digit: typeof o.digit === "string" ? o.digit.replace(/\D/g, "").slice(0, 1) : "",
      label: typeof o.label === "string" ? o.label.trim() : "",
      enabled: o.enabled !== false,
      forward_to_phone: typeof o.forward_to_phone === "string" ? o.forward_to_phone.trim() : "",
    }))
    .filter((o) => o.digit && o.label)
}

const SAY = `voice="Polly.Matthew" language="en-US"`

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function parseNotifyUserIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(isLikelyUuid)
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(isLikelyUuid)
  }
  return []
}

function buildMenuSay(options: HelpDeskOption[], includeVoicemailHint: boolean): string {
  const parts = options
    .filter((o) => o.enabled)
    .map((o) => `Press ${o.digit} for ${o.label}.`)
  if (includeVoicemailHint) parts.push("Press 0 to leave a voicemail for our team.")
  return parts.join(" ")
}

function helpDeskVoicemailInnerVerbs(origin: string, notifyIds: string[]): string {
  const params = new URLSearchParams()
  params.set("notifyUserIds", notifyIds.join(","))
  const action = `${origin}/api/voicemail-result?${params.toString()}`
  return (
    `<Say ${SAY}>Please leave your message after the tone. When you are finished, you may hang up.</Say>` +
    `<Record action="${xmlEscape(action)}" method="POST" transcribe="true" maxLength="240" />`
  )
}

function buildHelpDeskVoicemailTwiml(origin: string, notifyIds: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${helpDeskVoicemailInnerVerbs(origin, notifyIds)}</Response>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "help-desk-voice",
      hint: "Set this URL as the Twilio Voice webhook (POST) for your Tradesman toll-free / help desk number.",
    })
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).send("Method not allowed")
  }

  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const digits = pickFirstString(req.body?.Digits, req.query?.Digits).replace(/\D/g, "").slice(0, 1)
  const logUserId = firstEnv("HELP_DESK_LOG_USER_ID", "HELP_DESK_EVENTS_USER_ID")

  let settings: HelpDeskPayload = {}
  try {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "tradesman_help_desk")
      .limit(1)
      .maybeSingle()
    if (!error && data?.value && typeof data.value === "object") {
      settings = data.value as HelpDeskPayload
    }
  } catch {
    settings = {}
  }

  const notifyUserIds = parseNotifyUserIds(settings.voicemail_notify_user_ids)

  const greetingText =
    typeof settings.greeting_text === "string" && settings.greeting_text.trim()
      ? settings.greeting_text.trim()
      : "Thank you for calling Tradesman."
  const greetingUrl =
    settings.greeting_mode === "recorded" && typeof settings.greeting_recording_url === "string"
      ? settings.greeting_recording_url.trim()
      : ""
  const menuEnabled = settings.menu_enabled === true
  const options = normalizeMenuOptions(settings.options)

  const origin = requestPublicOrigin(req)
  const selfUrl = `${origin}/api/help-desk-voice`

  async function logHelpDesk(body: string, meta: Record<string, unknown>) {
    if (!logUserId) return
    try {
      const supabase = createServiceSupabase()
      await logCommunicationEvent(supabase, {
        user_id: logUserId,
        customer_id: null,
        conversation_id: null,
        channel_id: null,
        event_type: "call",
        direction: "inbound",
        external_id: callSid || null,
        body,
        unread: true,
        previous_customer: false,
        metadata: { from, provider: "help-desk", ...meta },
      })
    } catch {
      // Twilio still needs TwiML
    }
  }

  if (!digits) {
    await logHelpDesk("Help desk: answered", { phase: "greeting" })

    const greetingNode = greetingUrl
      ? `<Play>${xmlEscape(greetingUrl)}</Play>`
      : `<Say ${SAY}>${xmlEscape(greetingText)}</Say>`

    if (menuEnabled && options.length > 0) {
      const menuText = buildMenuSay(options, notifyUserIds.length > 0)
      const afterGather =
        notifyUserIds.length > 0
          ? helpDeskVoicemailInnerVerbs(origin, notifyUserIds)
          : `<Say ${SAY}>We did not receive your selection. Goodbye.</Say><Hangup/>`
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        greetingNode +
        `<Gather numDigits="1" action="${xmlEscape(selfUrl)}" method="POST" timeout="8">` +
        `<Say ${SAY}>${xmlEscape(menuText)}</Say>` +
        `</Gather>` +
        afterGather +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      greetingNode +
      `<Say ${SAY}>Goodbye.</Say>` +
      `<Hangup/>` +
      `</Response>`
    return sendTwiml(res, twiml)
  }

  if (digits === "0" && notifyUserIds.length > 0) {
    await logHelpDesk("Help desk: voicemail (digit 0)", { phase: "voicemail", digit: "0" })
    return sendTwiml(res, buildHelpDeskVoicemailTwiml(origin, notifyUserIds))
  }

  const choice = options.find((o) => o.enabled && o.digit === digits)
  if (!choice) {
    await logHelpDesk(`Help desk: invalid key ${digits}`, { phase: "invalid", digit: digits })
    if (notifyUserIds.length > 0) {
      return sendTwiml(res, buildHelpDeskVoicemailTwiml(origin, notifyUserIds))
    }
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say ${SAY}>That option is not available. Goodbye.</Say>` +
      `<Hangup/>` +
      `</Response>`
    return sendTwiml(res, twiml)
  }

  const forward = normalizePhone(choice.forward_to_phone || "")
  await logHelpDesk(`Help desk: pressed ${digits} — ${choice.label}`, {
    phase: "selection",
    digit: digits,
    label: choice.label,
    forward_to: forward || null,
  })

  if (forward) {
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say ${SAY}>${xmlEscape(`Connecting you to ${choice.label}. Please hold.`)}</Say>` +
      `<Dial timeout="30">${xmlEscape(forward)}</Dial>` +
      `<Say ${SAY}>We could not complete your call. Goodbye.</Say>` +
      `<Hangup/>` +
      `</Response>`
    return sendTwiml(res, twiml)
  }

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say ${SAY}>${xmlEscape(`You selected ${choice.label}. Thank you for calling Tradesman. Goodbye.`)}</Say>` +
    `<Hangup/>` +
    `</Response>`
  return sendTwiml(res, twiml)
}
