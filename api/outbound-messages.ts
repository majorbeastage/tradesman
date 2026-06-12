import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  describeServerSupabaseEnvForDiagnostics,
  getPrimaryEmailChannelForUser,
  getPrimarySmsChannelForUser,
  logCommunicationEvent,
  normalizePhone,
  pickFirstString,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
  toTwilioE164,
} from "./_communications.js"
import {
  finalizeOutboundSmsBody,
  type SmsOutboundComplianceVariant,
} from "./_smsComplianceLimits.js"
import { resolveFirstSmsComplianceForOutbound } from "./_smsFirstComplianceResolve.js"
import { isPhoneSmsOptedOut } from "./_smsOptOut.js"

/**
 * Single Hobby-plan function for outbound email (Resend) + SMS (Twilio / webhook).
 * Legacy URLs /api/send-email and /api/send-sms rewrite here (see vercel.json).
 */
type OutboundPayload = {
  channel?: string
  to?: string
  /** Extra To recipients (comma-separated string or array of emails). */
  toAdditional?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  /** Overrides default reply-to (channel forward inbox). Comma-separated or array. */
  replyTo?: string | string[]
  subject?: string
  body?: string
  userId?: string
  conversationId?: string
  leadId?: string
  customerId?: string
  /** Public HTTPS URLs (e.g. Supabase storage); fetched server-side and attached for Resend. */
  attachmentPublicUrls?: unknown
  /** Inline base64 attachments for Resend ({ filename, content }). Prefer for generated PDFs. */
  attachments?: unknown
  /** When true, return 502 if no attachments could be prepared (e.g. estimate PDF email). */
  requireAttachments?: boolean
  /** Twilio MMS: public URLs of images/files (max ~10). */
  mediaPublicUrls?: unknown
  /** Optional override for policy URL in long first-SMS footer (https). */
  smsPolicyUrl?: string
  /** With Bearer JWT, used when Vercel has no service role (same pattern as platform-tools). */
  supabaseUrl?: string
  supabaseAnonKey?: string
}

async function resolveSupabaseClientForOutbound(
  req: VercelRequest,
  userId: string,
  payload: OutboundPayload,
): Promise<SupabaseClient> {
  try {
    return createServiceSupabase()
  } catch {
    /* continue */
  }
  const authHeader = typeof req.headers?.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : ""
  const supabaseUrl = pickSupabaseUrlForServer() || pickFirstString(payload.supabaseUrl)
  const anonKey = pickSupabaseAnonKeyForServer() || pickFirstString(payload.supabaseAnonKey)
  if (!token || !supabaseUrl || !anonKey) {
    throw new Error(
      "Missing server env: SUPABASE_URL (exact name, all caps — or VITE_SUPABASE_URL; case-insensitive match also tried) · SUPABASE_SERVICE_ROLE_KEY (exact name, all caps — not the anon key; case-insensitive match also tried). In Vercel: Project → Settings → Environment Variables — use names SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, All Environments, then Redeploy; or send Authorization: Bearer <JWT> plus supabaseUrl and supabaseAnonKey in the JSON body.",
    )
  }
  const sb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !userData.user?.id || userData.user.id !== userId) {
    throw new Error("Invalid or expired session for outbound email (sign in again).")
  }
  return sb
}

/** Vercel sometimes delivers `body` as a string; rewrites should still forward JSON. */
function parseJsonBody(req: VercelRequest): OutboundPayload {
  const raw = req.body
  if (raw == null || raw === "") return {}
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw) as unknown
      return v && typeof v === "object" && !Array.isArray(v) ? (v as OutboundPayload) : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as OutboundPayload
  return {}
}

const RESEND_FETCH_MS = 25_000

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function parseEmailList(value: unknown): string[] {
  if (value == null) return []
  const parts: string[] = Array.isArray(value)
    ? value.map((x) => String(x))
    : String(value)
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    const e = normalizeEmail(p)
    if (e && !out.includes(e)) out.push(e)
  }
  return out
}

/** Local part + @ + domain with at least one dot (good enough for Resend validation). */
function isBareEmailAddress(s: string): boolean {
  const t = s.trim().toLowerCase()
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(t)
}

/**
 * Resend requires `email@domain` or `Display Name <email@domain>`.
 * Never lowercase the whole string (that can break valid formatted addresses).
 */
function sanitizeFromRawInput(s: string): string {
  let t = String(s || "")
    .replace(/\u200b|\ufeff/g, "")
    .trim()
  t = t.replace(/^mailto:/i, "").trim()
  const onlyBrackets = /^<([^<>]+@[^<>]+)>\s*$/i.exec(t)
  if (onlyBrackets) t = onlyBrackets[1].trim()
  return t.replace(/\s+/g, " ")
}

function buildResendFromField(
  rawPrimary: string,
  friendlyName: string | null | undefined,
  envDisplayName: string,
): string | null {
  const raw = sanitizeFromRawInput(rawPrimary)
  if (!raw) return null

  const m = /^(.+?)\s*<([^<>]+@[^<>]+)>\s*$/i.exec(raw)
  if (m) {
    const display = m[1].trim()
    const em = m[2].trim().toLowerCase()
    if (!isBareEmailAddress(em)) return null
    if (!display) return em
    return `${display} <${em}>`
  }

  if (isBareEmailAddress(raw)) {
    const em = raw.trim().toLowerCase()
    const dn = (friendlyName || envDisplayName || "").trim()
    if (dn) return `${dn} <${em}>`
    return em
  }

  return null
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim()
  }
  return ""
}

function coerceInlineAttachments(raw: unknown): Array<{ filename: string; content: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ filename: string; content: string }> = []
  for (let i = 0; i < raw.length && out.length < 10; i++) {
    const row = raw[i]
    if (!row || typeof row !== "object" || Array.isArray(row)) continue
    const o = row as { filename?: unknown; content?: unknown }
    const content = typeof o.content === "string" ? o.content.trim() : ""
    if (!content || content.length > 20_000_000) continue
    const filenameRaw = typeof o.filename === "string" ? o.filename.trim() : ""
    const filename =
      filenameRaw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || `attachment-${out.length + 1}.bin`
    out.push({ filename, content })
  }
  return out
}

function coercePublicUrlList(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((u) => u.startsWith("https://") && u.length < 2048)
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((u) => u.startsWith("https://"))
  }
  return []
}

function filenameFromUrl(u: string, index: number): string {
  try {
    const path = new URL(u).pathname.split("/").filter(Boolean).pop() || ""
    const cleaned = path.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
    if (cleaned) return cleaned
  } catch {
    /* ignore */
  }
  return `attachment-${index + 1}`
}

function parseTwilioMessageResponse(text: string): {
  sid?: string
  status?: string
  errorMessage?: string
  errorCode?: string
} {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>
    const sid = typeof j.sid === "string" ? j.sid : undefined
    const status = typeof j.status === "string" ? j.status : undefined
    const errorMessage =
      typeof j.message === "string"
        ? j.message
        : typeof j.error_message === "string"
          ? j.error_message
          : undefined
    const errorCode =
      typeof j.code === "string" || typeof j.code === "number" ? String(j.code) : undefined
    return { sid, status, errorMessage, errorCode }
  } catch {
    return {}
  }
}

function resolveChannel(req: VercelRequest, payload: OutboundPayload): "email" | "sms" {
  const q = pickFirstString(req.query?.__channel, req.query?.channel).toLowerCase()
  if (q === "email" || q === "sms") return q
  const c = typeof payload.channel === "string" ? payload.channel.toLowerCase() : ""
  if (c === "email" || c === "sms") return c
  if (typeof payload.subject === "string" && payload.subject.trim()) return "email"
  return "sms"
}

async function handleEmail(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const payload = parseJsonBody(req)
  const primaryTo = normalizeEmail(payload.to)
  const extraTo = parseEmailList(payload.toAdditional)
  const toList = [...new Set([primaryTo, ...extraTo].filter(Boolean))]
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : ""
  const body = typeof payload.body === "string" ? payload.body.trim() : ""
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : ""
  const leadId = typeof payload.leadId === "string" ? payload.leadId.trim() : ""
  const customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : ""
  const attachUrls = coercePublicUrlList(payload.attachmentPublicUrls).slice(0, 15)
  const inlineAttachments = coerceInlineAttachments(payload.attachments)

  if (toList.length === 0 || !subject || !body || !userId) {
    return res.status(400).json({
      error: "to (or toAdditional), subject, body, and userId are required",
    })
  }

  let supabase: SupabaseClient
  try {
    supabase = await resolveSupabaseClientForOutbound(req, userId, payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({
      error: "Server email misconfiguration",
      message: msg,
      hint:
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel, or call with Authorization: Bearer <Supabase JWT> and supabaseUrl + supabaseAnonKey in the JSON body.",
    })
  }
  const dbChannel = await getPrimaryEmailChannelForUser(supabase, userId)
  const rawFrom =
    (typeof dbChannel?.public_address === "string" && dbChannel.public_address.trim()
      ? dbChannel.public_address.trim()
      : "") || firstEnv("RESEND_FROM_EMAIL", "EMAIL_DEFAULT_FROM")
  const envFromDisplay = firstEnv("RESEND_FROM_NAME", "RESEND_FROM_DISPLAY_NAME")
  const resendFrom = buildResendFromField(rawFrom, dbChannel?.friendly_name ?? null, envFromDisplay)
  const resendApiKey = firstEnv("RESEND_API_KEY")
  const copyInbox = normalizeEmail(dbChannel?.forward_to_email)
  const ccList = parseEmailList(payload.cc)
  const userBccList = parseEmailList(payload.bcc)
  const clientReplyToList = parseEmailList(payload.replyTo)

  if (!resendApiKey) {
    return res.status(500).json({
      error: "No outbound email provider configured.",
      hint: "Set RESEND_API_KEY on Vercel.",
    })
  }

  if (!resendFrom) {
    const reason = !rawFrom.trim()
      ? dbChannel
        ? "email_channel_public_address_empty"
        : "no_email_channel_for_user"
      : "public_address_not_recognized_as_email"
    return res.status(500).json({
      error: "Invalid outbound From address for Resend.",
      reason,
      hint:
        "Admin → Communications: add an Email channel with Email enabled, public address joe@tradesman-us.com (saved). RESEND_FROM_EMAIL on Vercel is only used if no channel or empty public address — it does not override a saved joe@ address. Optional RESEND_FROM_NAME adds a display name only.",
    })
  }

  const bccMerged: string[] = [...userBccList]
  if (copyInbox && !toList.includes(copyInbox) && !ccList.includes(copyInbox) && !bccMerged.includes(copyInbox)) {
    bccMerged.push(copyInbox)
  }

  const replyToFinal =
    clientReplyToList.length > 0 ? clientReplyToList : copyInbox ? [copyInbox] : undefined

  const resendPayload: Record<string, unknown> = {
    from: resendFrom,
    to: toList,
    subject,
    text: body,
    reply_to: replyToFinal,
  }
  if (ccList.length) resendPayload.cc = ccList
  if (bccMerged.length) resendPayload.bcc = bccMerged

  type ResendAttachmentRow = { filename: string; content?: string; path?: string }
  const resendAttachments: ResendAttachmentRow[] = inlineAttachments.map((row) => ({
    filename: row.filename,
    content: row.content,
  }))
  if (attachUrls.length > 0) {
    for (let i = 0; i < attachUrls.length; i++) {
      const u = attachUrls[i]
      resendAttachments.push({
        filename: filenameFromUrl(u, i),
        path: u,
      })
    }
  }
  if (resendAttachments.length > 15) resendAttachments.splice(15)
  const requireAttachments = payload.requireAttachments === true
  if (requireAttachments && resendAttachments.length === 0) {
    return res.status(502).json({
      error: "Email attachments could not be prepared.",
      hint: "The estimate PDF or file URLs could not be attached. Try again, or download the PDF and attach it manually.",
    })
  }
  if (resendAttachments.length > 0) resendPayload.attachments = resendAttachments

  let resendResponse: Response
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), RESEND_FETCH_MS)
    try {
      resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resendPayload),
        signal: ac.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError"
    return res.status(504).json({
      error: aborted ? "Resend API timed out" : "Resend request failed",
      message: e instanceof Error ? e.message : String(e),
      hint: aborted
        ? `No response from Resend within ${RESEND_FETCH_MS / 1000}s. Check Vercel logs and Resend status.`
        : "Check network and RESEND_API_KEY.",
    })
  }

  const detail = await resendResponse.text()
  if (!resendResponse.ok) {
    return res.status(resendResponse.status).json({
      error: "Resend rejected the send request",
      message: detail.slice(0, 2000),
      hint:
        "Add and verify tradesman-us.com (or your sender domain) in Resend → Domains. From must be an address on that domain. Fix Admin email channel public address or RESEND_FROM_EMAIL if it is not a valid email.",
    })
  }

  try {
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: customerId || null,
      conversation_id: conversationId || null,
      lead_id: leadId || null,
      channel_id: dbChannel?.id ?? null,
      event_type: "email",
      direction: "outbound",
      subject,
      body,
      unread: false,
      metadata: {
        to: toList,
        from: resendFrom,
        provider: dbChannel?.provider ?? "resend",
        reply_to: replyToFinal,
        cc: ccList.length ? ccList : undefined,
        bcc: bccMerged.length ? bccMerged : undefined,
      },
    })
  } catch (logErr) {
    const logMsg = logErr instanceof Error ? logErr.message : String(logErr)
    console.error("[outbound-messages/email] Resend OK but communication_events insert failed:", logMsg)
    return res.status(200).json({
      ok: true,
      provider: "resend",
      to: toList,
      from: resendFrom,
      cc: ccList.length ? ccList : null,
      bcc: bccMerged.length ? bccMerged : null,
      detail,
      attachmentCount: resendAttachments.length,
      logWarning: "Email was sent but the conversation log could not be saved. Check communication_events table and Vercel logs.",
    })
  }

  return res.status(200).json({
    ok: true,
    provider: "resend",
    to: toList,
    from: resendFrom,
    cc: ccList.length ? ccList : null,
    bcc: bccMerged.length ? bccMerged : null,
    attachmentCount: resendAttachments.length,
    detail,
  })
}

async function handleSms(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const payload = parseJsonBody(req)
  const to = toTwilioE164(typeof payload.to === "string" ? payload.to : "")
  const rawBody = typeof payload.body === "string" ? payload.body : ""
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : ""
  const leadIdSms = typeof payload.leadId === "string" ? payload.leadId.trim() : ""
  const mediaUrls = coercePublicUrlList(payload.mediaPublicUrls).slice(0, 10)

  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  const outboundWebhookUrl = firstEnv("SMS_OUTBOUND_WEBHOOK_URL")

  let supabase: ReturnType<typeof createServiceSupabase> | null = null
  let supabaseInitError: string | null = null
  try {
    supabase = createServiceSupabase()
  } catch (e) {
    supabaseInitError = e instanceof Error ? e.message : String(e)
    console.error(
      "[outbound-messages/sms] createServiceSupabase failed (same env as voicemail-greeting / incoming-sms):",
      supabaseInitError,
    )
    // Per-user From needs DB; see fallback below using TWILIO_FROM_NUMBER.
  }

  let customerIdForCompliance = typeof payload.customerId === "string" ? payload.customerId.trim() : ""
  if (!customerIdForCompliance && conversationId && supabase) {
    const { data: convoRow } = await supabase
      .from("conversations")
      .select("customer_id")
      .eq("id", conversationId)
      .maybeSingle()
    const cid = (convoRow?.customer_id as string | null | undefined)?.trim()
    if (cid) customerIdForCompliance = cid
  }

  let complianceVariant: SmsOutboundComplianceVariant = "none"
  let businessDisplayName = ""
  if (supabase && userId) {
    const resolved = await resolveFirstSmsComplianceForOutbound(supabase, userId, customerIdForCompliance || null)
    complianceVariant = resolved.variant
    businessDisplayName = resolved.businessDisplayName
  }

  const body = finalizeOutboundSmsBody({
    rawBody,
    variant: complianceVariant,
    businessDisplayName: businessDisplayName || "Your business",
    smsPolicyUrl: typeof payload.smsPolicyUrl === "string" ? payload.smsPolicyUrl.trim() : undefined,
  })

  if (!to || !body) return res.status(400).json({ error: "to and body are required" })

  if (supabase && userId && (await isPhoneSmsOptedOut(supabase, userId, to))) {
    return res.status(403).json({
      error:
        "This phone number has opted out of SMS (STOP). Do not send until the customer texts START or you remove the opt-out in the database.",
      code: "sms_opt_out",
      to,
    })
  }

  const envFallbackFrom = toTwilioE164(firstEnv("TWILIO_FROM_NUMBER", "SMS_DEFAULT_FROM_NUMBER"))
  const dbChannel = supabase && userId ? await getPrimarySmsChannelForUser(supabase, userId) : null
  const channelProviderSid = (dbChannel?.provider_sid ?? "").trim()
  /** A2P 10DLC: send via Messaging Service (MG…) linked to your verified campaign — avoids error 30034 when the From long code is in that service's sender pool. */
  const messagingServiceSid =
    firstEnv("TWILIO_MESSAGING_SERVICE_SID").trim() ||
    (channelProviderSid.startsWith("MG") ? channelProviderSid : "")
  /** Prefer this user's Communications public number when Supabase is configured. */
  let fromNumber =
    userId && supabase
      ? toTwilioE164(dbChannel?.public_address ?? "")
      : envFallbackFrom

  if (userId && supabase && !fromNumber && !messagingServiceSid) {
    return res.status(400).json({
      error: "No Twilio SMS number on file for this user.",
      hint: "Add an active channel with SMS enabled and set Public number to that Twilio phone (Admin → Communications). Inbound SMS must use the same number.",
    })
  }
  /** No service role on Vercel: cannot read communication_channels; allow send if a default From or Messaging Service is set. */
  if (userId && !supabase && !fromNumber && !messagingServiceSid) {
    const envSeen = describeServerSupabaseEnvForDiagnostics()
    return res.status(503).json({
      error: "Cannot load your Twilio SMS number.",
      message:
        "The server needs Supabase credentials to read Admin → Communications, or a default outbound number.",
      fixEither: [
        "Vercel → Project → Settings → Environment Variables: add SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (service role, not anon). Apply to Production, save, then Redeploy.",
        "Or set TWILIO_FROM_NUMBER (or SMS_DEFAULT_FROM_NUMBER) and/or TWILIO_MESSAGING_SERVICE_SID (MG…) for A2P 10DLC until Supabase is configured (logging to communication_events will be skipped).",
      ],
      /** Booleans only — shows what this serverless invocation actually sees (misnamed vars, wrong environment, etc.). */
      serverSeesSupabaseEnv: envSeen,
      supabaseClientInitError: supabaseInitError,
    })
  }

  if (accountSid && authToken && (fromNumber || messagingServiceSid)) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`
    const params = new URLSearchParams({ To: to, Body: body })
    if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid)
    if (fromNumber) params.set("From", fromNumber)
    for (const u of mediaUrls) {
      params.append("MediaUrl", u)
    }
    const twilioRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    })
    const text = await twilioRes.text()
    const twilioParsed = parseTwilioMessageResponse(text)
    if (!twilioRes.ok) {
      const detail =
        twilioParsed.errorMessage ||
        (text.length < 800 ? text : `${text.slice(0, 800)}…`)
      return res.status(twilioRes.status).json({
        error: "Twilio rejected the SMS request.",
        message: detail,
        twilioErrorCode: twilioParsed.errorCode,
        to,
        from: fromNumber,
      })
    }
    const twilioPayload = {
      twilioSid: twilioParsed.sid,
      twilioStatus: twilioParsed.status,
      deliveryHint:
        "If the phone never receives the text: (1) Twilio error 30034 = your From long code is not in the A2P 10DLC campaign sender pool—Twilio Console → Messaging → Services → add the number to the service linked to campaign CM… (VERIFIED), or set TWILIO_MESSAGING_SERVICE_SID. (2) Trial accounts can only SMS verified numbers. (3) After adding a number, wait up to 24h for REGISTERED status (error 30035 while pending). (4) Check Twilio Monitor → Logs for this Message SID.",
    }
    if (userId && supabase) {
      try {
        await logCommunicationEvent(supabase, {
          user_id: userId,
          customer_id: typeof payload.customerId === "string" ? payload.customerId.trim() || null : null,
          conversation_id: conversationId || null,
          lead_id: leadIdSms || null,
          channel_id: dbChannel?.id ?? null,
          event_type: "sms",
          direction: "outbound",
          body,
          unread: false,
          metadata: {
            to,
            from: fromNumber,
            provider: "twilio",
            twilio_sid: twilioParsed.sid ?? null,
            twilio_status: twilioParsed.status ?? null,
          },
        })
      } catch (logErr) {
        console.error(
          "[outbound-messages/sms] Twilio OK but communication_events insert failed:",
          logErr instanceof Error ? logErr.message : logErr,
        )
        return res.status(200).json({
          ok: true,
          provider: "twilio",
          to,
          from: fromNumber,
          detail: text,
          ...twilioPayload,
          logWarning: "SMS was sent but the conversation log could not be saved.",
        })
      }
    } else if (userId && !supabase) {
      return res.status(200).json({
        ok: true,
        provider: "twilio",
        to,
        from: fromNumber,
        detail: text,
        ...twilioPayload,
        logWarning:
          "SMS sent using TWILIO_FROM_NUMBER (or SMS_DEFAULT_FROM_NUMBER) because Supabase service env is missing. Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on Vercel and redeploy to use Admin → Communications per-user numbers and to log outbound SMS.",
      })
    }
    return res.status(200).json({
      ok: true,
      provider: "twilio",
      to,
      from: fromNumber,
      detail: text,
      ...twilioPayload,
    })
  }

  if (outboundWebhookUrl) {
    const hookRes = await fetch(outboundWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, body, from: fromNumber || null }),
    })
    const text = await hookRes.text()
    if (!hookRes.ok) return res.status(hookRes.status).send(text)
    return res.status(200).json({ ok: true, provider: "custom-webhook", to, from: fromNumber || null, detail: text })
  }

  return res.status(500).json({
    error: "No outbound SMS provider configured.",
    hint: "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN. For portal replies, configure each user's Twilio public number on their SMS channel (Admin → Communications); optional TWILIO_FROM_NUMBER only for non-user requests without userId.",
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const payload = parseJsonBody(req)
    const channel = resolveChannel(req, payload)
    if (channel === "email") return handleEmail(req, res)
    return handleSms(req, res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[outbound-messages]", msg)
    return res.status(500).json({
      error: "outbound-messages failed",
      message: msg,
      hint: "Check Vercel env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, Resend/Twilio as appropriate.",
    })
  }
}
