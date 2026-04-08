import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, logCommunicationEvent, normalizePhone, pickFirstString } from "./_communications.js"

type HelpDeskOnSelect =
  | "dial"
  | "pin_greeting"
  | "record_help_desk_greeting"
  | "team_voicemail"
  | "thanks"
  | "submenu"
  | "trouble_ticket"

type HelpDeskOption = {
  id?: string
  digit?: string
  label?: string
  enabled?: boolean
  forward_to_phone?: string | null
  /** Empty or omitted = main menu row. Set to a main-menu digit (1–8) to show this row only in that submenu. */
  depends_on_digit?: string | null
  /** Optional audio URL played before the spoken action (dial, redirect, etc.). */
  play_recording_url?: string | null
  /** What to do when this key is pressed (stored as on_select in platform_settings). */
  on_select?: string | null
}

type NormalizedMenuOption = {
  digit: string
  label: string
  enabled: boolean
  forward_to_phone: string
  depends_on_digit: string
  play_recording_url: string
  on_select: HelpDeskOnSelect
}

type HelpDeskPayload = {
  title?: string
  greeting_mode?: string
  greeting_text?: string
  greeting_recording_url?: string
  menu_enabled?: boolean
  options?: HelpDeskOption[]
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

function normalizeOnSelect(o: HelpDeskOption, forward: string): HelpDeskOnSelect {
  const s = typeof o.on_select === "string" ? o.on_select.trim() : ""
  if (
    s === "pin_greeting" ||
    s === "record_help_desk_greeting" ||
    s === "team_voicemail" ||
    s === "thanks" ||
    s === "dial" ||
    s === "submenu" ||
    s === "trouble_ticket"
  )
    return s
  return forward ? "dial" : "thanks"
}

function normalizeMenuOptions(raw: HelpDeskOption[] | undefined): NormalizedMenuOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => {
      const forward = typeof o.forward_to_phone === "string" ? o.forward_to_phone.trim() : ""
      const depRaw = typeof o.depends_on_digit === "string" ? o.depends_on_digit.replace(/\D/g, "").slice(0, 1) : ""
      const play = typeof o.play_recording_url === "string" ? o.play_recording_url.trim() : ""
      return {
        digit: typeof o.digit === "string" ? o.digit.replace(/\D/g, "").slice(0, 1) : "",
        label: typeof o.label === "string" ? o.label.trim() : "",
        enabled: o.enabled !== false,
        forward_to_phone: forward,
        depends_on_digit: depRaw,
        play_recording_url: play,
        on_select: normalizeOnSelect(o, forward),
      }
    })
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

/** Reserved: 0 = help-desk voicemail, 9 = transfer to PIN-based personal greeting recorder. */
function buildMenuSay(
  options: NormalizedMenuOption[],
  includeVoicemailHint: boolean,
  includePersonalGreetingHint: boolean
): string {
  const parts = options
    .filter((o) => o.enabled)
    .map((o) => `Press ${o.digit} for ${o.label}.`)
  if (includeVoicemailHint) parts.push("Press 0 to leave a voicemail for our team.")
  if (includePersonalGreetingHint) parts.push("Press 9 to update your mailbox greeting using your PIN.")
  return parts.join(" ")
}

function playVerbs(url: string): string {
  const t = url.trim()
  if (!t) return ""
  return `<Play>${xmlEscape(t)}</Play>`
}

/** Twilio only transcribes Record verb audio when duration is &gt;2s and &lt;120s (see Twilio &lt;Record transcribe&gt; docs). */
const TWILIO_TRANSCRIBE_MAX_LENGTH_SEC = 118

function helpDeskVoicemailInnerVerbs(origin: string, notifyIds: string[]): string {
  const params = new URLSearchParams()
  params.set("notifyUserIds", notifyIds.join(","))
  const action = `${origin}/api/voicemail-result?${params.toString()}`
  const transcribeCb = `${action}&phase=transcribe`
  return (
    `<Say ${SAY}>Please leave your message after the tone. When you are finished, you may hang up.</Say>` +
    `<Record action="${xmlEscape(action)}" transcribeCallback="${xmlEscape(transcribeCb)}" method="POST" transcribe="true" maxLength="${TWILIO_TRANSCRIBE_MAX_LENGTH_SEC}" />`
  )
}

function buildHelpDeskVoicemailTwiml(origin: string, notifyIds: string[], prefixPlay?: string): string {
  const inner = `${playVerbs(prefixPlay ?? "")}${helpDeskVoicemailInnerVerbs(origin, notifyIds)}`
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`
}

function buildTroubleTicketRecordTwiml(origin: string, prefixPlay: string): string {
  const base = `${origin}/api/help-desk-trouble-ticket-result`
  const recordAction = `${base}?phase=record`
  const transcribeCb = `${base}?phase=transcribe`
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    playVerbs(prefixPlay) +
    `<Say ${SAY}>Please briefly explain your issue. Someone will return your call as soon as possible. When you are finished, you may hang up.</Say>` +
    `<Record action="${xmlEscape(recordAction)}" transcribeCallback="${xmlEscape(transcribeCb)}" method="POST" transcribe="true" maxLength="${TWILIO_TRANSCRIBE_MAX_LENGTH_SEC}" playBeep="true" />` +
    `<Say ${SAY}>We did not receive your message. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

function gatherActionUrl(selfUrl: string, parentDigit: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams()
  q.set("gather", "1")
  if (parentDigit) q.set("parent", parentDigit)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v)
    }
  }
  return `${selfUrl}?${q.toString()}`
}

function buildHelpDeskGreetingRecordTwiml(origin: string): string {
  const save = `${origin}/api/help-desk-greeting-save`
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say ${SAY}>After the tone, record the greeting callers hear when they first reach this line. When you are finished, press any key.</Say>` +
    `<Record action="${xmlEscape(save)}" method="POST" playBeep="true" maxLength="120" />` +
    `<Say ${SAY}>We did not receive a recording. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "help-desk-voice",
      hint:
        "Set your Twilio toll-free Voice webhook (POST) to this URL for the Tradesman help desk menu. Use /api/voicemail-greeting only if you use a separate number for PIN greeting updates.",
    })
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).send("Method not allowed")
  }

  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const digitsRaw = pickFirstString(req.body?.Digits, req.query?.Digits).replace(/\D/g, "").slice(0, 1)
  const fromGather = pickFirstString(req.query?.gather) === "1"
  const parentDigit = pickFirstString(req.query?.parent).replace(/\D/g, "").slice(0, 1)
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

  const options = normalizeMenuOptions(settings.options)
  const enabledOptions = options.filter((o) => o.enabled)
  const rootOptions = enabledOptions.filter((o) => !o.depends_on_digit)
  /** Treat missing menu_enabled as true when root options exist (older JSON omitted the flag). */
  const menuExplicitOff = settings.menu_enabled === false
  const menuEnabled = !menuExplicitOff && rootOptions.length > 0
  /** If a main-menu row already sends callers to the personal PIN greeting recorder, hide the extra "press 9" shortcut. */
  const hidePersonalGreetingNineShortcut = rootOptions.some((o) => o.enabled && o.on_select === "pin_greeting")

  const origin = requestPublicOrigin(req)
  const selfUrl = `${origin}/api/help-desk-voice`
  const voicemailGreetingUrl = `${origin}/api/voicemail-greeting`

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

  function optionPool(): NormalizedMenuOption[] {
    if (parentDigit) return enabledOptions.filter((o) => o.depends_on_digit === parentDigit)
    return rootOptions
  }

  // Callback from <Gather>: user pressed a key, or timeout (empty Digits).
  if (fromGather) {
    const hdGatherKind = pickFirstString(req.query?.hd_gather).toLowerCase()
    if (hdGatherKind === "help_greet_pin") {
      const pinEnv = firstEnv("HELP_DESK_GREETING_RECORD_PIN").replace(/\D/g, "")
      const entered = pickFirstString(req.body?.Digits, req.query?.Digits).replace(/\D/g, "")
      if (!pinEnv || pinEnv.length < 4) {
        await logHelpDesk("Help desk: main greeting PIN not configured on server", { phase: "help_greet_pin" })
        const twiml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say ${SAY}>This option is not set up yet. Goodbye.</Say>` +
          `<Hangup/>` +
          `</Response>`
        return sendTwiml(res, twiml)
      }
      if (!entered) {
        await logHelpDesk("Help desk: main greeting PIN gather timeout", { phase: "help_greet_pin" })
        const twiml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say ${SAY}>We did not receive your code. Goodbye.</Say>` +
          `<Hangup/>` +
          `</Response>`
        return sendTwiml(res, twiml)
      }
      if (entered !== pinEnv) {
        await logHelpDesk("Help desk: main greeting PIN incorrect", { phase: "help_greet_pin" })
        const twiml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say ${SAY}>That code is not correct. Goodbye.</Say>` +
          `<Hangup/>` +
          `</Response>`
        return sendTwiml(res, twiml)
      }
      await logHelpDesk("Help desk: recording new main greeting (after PIN)", { phase: "help_greet_record" })
      return sendTwiml(res, buildHelpDeskGreetingRecordTwiml(origin))
    }

    if (!digitsRaw) {
      await logHelpDesk("Help desk: menu timeout (no digit)", { phase: "gather_timeout", parent: parentDigit || null })
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        `<Say ${SAY}>We did not receive your selection. Please call again. Goodbye.</Say>` +
        `<Hangup/>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    if (digitsRaw === "9" && !hidePersonalGreetingNineShortcut) {
      await logHelpDesk("Help desk: redirect to personal greeting (digit 9)", { phase: "greeting_redirect", digit: "9" })
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        `<Redirect method="POST">${xmlEscape(voicemailGreetingUrl)}</Redirect>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    if (digitsRaw === "0" && notifyUserIds.length > 0) {
      await logHelpDesk("Help desk: voicemail (digit 0)", { phase: "voicemail", digit: "0" })
      return sendTwiml(res, buildHelpDeskVoicemailTwiml(origin, notifyUserIds))
    }

    const pool = optionPool()
    const choice = pool.find((o) => o.digit === digitsRaw)
    if (!choice) {
      await logHelpDesk(`Help desk: invalid key ${digitsRaw}`, { phase: "invalid", digit: digitsRaw, parent: parentDigit || null })
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        `<Say ${SAY}>That option is not available. Goodbye.</Say>` +
        `<Hangup/>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    const forward = normalizePhone(choice.forward_to_phone || "")
    await logHelpDesk(`Help desk: pressed ${digitsRaw} — ${choice.label}`, {
      phase: "selection",
      digit: digitsRaw,
      label: choice.label,
      on_select: choice.on_select,
      forward_to: forward || null,
      parent: parentDigit || null,
    })

    if (choice.on_select === "submenu") {
      if (parentDigit) {
        const twiml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say ${SAY}>That option is not available. Goodbye.</Say>` +
          `<Hangup/>` +
          `</Response>`
        return sendTwiml(res, twiml)
      }
      const subRows = enabledOptions.filter((o) => o.depends_on_digit === choice.digit)
      if (subRows.length === 0) {
        const twiml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say ${SAY}>That menu is not set up yet. Goodbye.</Say>` +
          `<Hangup/>` +
          `</Response>`
        return sendTwiml(res, twiml)
      }
      const menuText = buildMenuSay(subRows, false, false)
      const action = gatherActionUrl(selfUrl, choice.digit)
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        playVerbs(choice.play_recording_url) +
        `<Gather numDigits="1" action="${xmlEscape(action)}" method="POST" timeout="20">` +
        `<Say ${SAY}>${xmlEscape(menuText)}</Say>` +
        `</Gather>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    if (choice.on_select === "trouble_ticket") {
      return sendTwiml(res, buildTroubleTicketRecordTwiml(origin, choice.play_recording_url))
    }

    if (choice.on_select === "record_help_desk_greeting") {
      const pinEnv = firstEnv("HELP_DESK_GREETING_RECORD_PIN").replace(/\D/g, "")
      if (!pinEnv || pinEnv.length < 4) {
        await logHelpDesk("Help desk: record main greeting chosen but PIN env missing", { phase: "record_help_desk_greeting" })
        const twiml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say ${SAY}>This option is not set up yet. Goodbye.</Say>` +
          `<Hangup/>` +
          `</Response>`
        return sendTwiml(res, twiml)
      }
      const action = gatherActionUrl(selfUrl, parentDigit, { hd_gather: "help_greet_pin" })
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        playVerbs(choice.play_recording_url) +
        `<Gather numDigits="${pinEnv.length}" action="${xmlEscape(action)}" method="POST" timeout="20">` +
        `<Say ${SAY}>Enter the operations code to record the main help desk greeting.</Say>` +
        `</Gather>` +
        `<Say ${SAY}>We did not receive your code. Goodbye.</Say>` +
        `<Hangup/>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    if (choice.on_select === "pin_greeting") {
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        playVerbs(choice.play_recording_url) +
        `<Say ${SAY}>${xmlEscape("Please wait while we connect you to the greeting recorder.")}</Say>` +
        `<Redirect method="POST">${xmlEscape(voicemailGreetingUrl)}</Redirect>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    if (choice.on_select === "team_voicemail") {
      if (notifyUserIds.length > 0) {
        return sendTwiml(res, buildHelpDeskVoicemailTwiml(origin, notifyUserIds, choice.play_recording_url))
      }
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        playVerbs(choice.play_recording_url) +
        `<Say ${SAY}>Team voicemail is not available right now. Goodbye.</Say>` +
        `<Hangup/>` +
        `</Response>`
      return sendTwiml(res, twiml)
    }

    if (choice.on_select === "dial" && forward) {
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        playVerbs(choice.play_recording_url) +
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
      playVerbs(choice.play_recording_url) +
      `<Say ${SAY}>${xmlEscape(`Thank you for calling Tradesman. Goodbye.`)}</Say>` +
      `<Hangup/>` +
      `</Response>`
    return sendTwiml(res, twiml)
  }

  // Initial answer (no gather callback).
  await logHelpDesk("Help desk: answered", { phase: "greeting" })

  const greetingNode = greetingUrl
    ? `<Play>${xmlEscape(greetingUrl)}</Play>`
    : `<Say ${SAY}>${xmlEscape(greetingText)}</Say>`

  if (menuEnabled) {
    const menuText = buildMenuSay(rootOptions, notifyUserIds.length > 0, !hidePersonalGreetingNineShortcut)
    const action = gatherActionUrl(selfUrl, "")
    // Important: do NOT put <Record> or voicemail after </Gather> — on timeout Twilio runs those verbs immediately,
    // which skipped the menu and dumped callers into voicemail.
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      greetingNode +
      `<Gather numDigits="1" action="${xmlEscape(action)}" method="POST" timeout="20">` +
      `<Say ${SAY}>${xmlEscape(menuText)}</Say>` +
      `</Gather>` +
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
