import type { VercelRequest, VercelResponse } from "@vercel/node"
import { classifyCallScreeningAnswers, loadCallScreeningBusinessContext } from "./_callScreeningClassify.js"
import type { CommunicationChannel } from "./_communications.js"
import {
  buildVoicemailTwiml,
  createServiceSupabase,
  ensureOpenLeadForInbound,
  getUserRoutingProfile,
  isWithinBusinessHours,
  logCommunicationEvent,
  lookupChannelByPublicAddress,
  lookupCustomerDisplayNameByPhone,
  normalizePhone,
  pickFirstString,
  toTwilioE164,
} from "./_communications.js"
import {
  activeScreeningSteps,
  decodeScreeningAnswers,
  encodeScreeningAnswers,
  loadVoiceAutoAttendantForUser,
  priorAnswersMap,
  resolveScreeningPrompt,
  type ScreeningAnswer,
  type VoiceAutoAttendantSettings,
} from "./_voiceAutoAttendant.js"

const SAY = `voice="Polly.Matthew" language="en-US"`

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

function twimlResponse(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`
}

function requestPublicOrigin(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers["x-forwarded-host"], req.headers.host)
  if (!host) return "https://tradesman.vercel.app"
  return `${proto}://${host.split(",")[0].trim()}`
}

function screeningBaseQuery(req: VercelRequest, channel: CommunicationChannel | null, from: string, to: string): URLSearchParams {
  const q = new URLSearchParams()
  if (channel?.id) q.set("channelId", channel.id)
  if (channel?.user_id) q.set("userId", channel.user_id)
  if (from) q.set("from", from)
  if (to) q.set("to", to)
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  if (callSid) q.set("callSid", callSid)
  return q
}

function promptVerb(settings: VoiceAutoAttendantSettings, step: { prompt: string; recordingUrl?: string }): string {
  const useRecording = settings.mode === "recorded_menu" && step.recordingUrl?.trim()
  if (useRecording) return `<Play>${xmlEscape(step.recordingUrl!.trim())}</Play>`
  return `<Say ${SAY}>${xmlEscape(step.prompt)}</Say>`
}

function buildGatherStepTwiml(params: {
  actionUrl: string
  settings: VoiceAutoAttendantSettings
  promptText: string
  recordingUrl?: string
  intro?: string
  speechHints?: string
}): string {
  const intro = params.intro ? `<Say ${SAY}>${xmlEscape(params.intro)}</Say>` : ""
  const prompt = promptVerb(params.settings, { prompt: params.promptText, recordingUrl: params.recordingUrl })
  const hintsAttr = params.speechHints?.trim() ? ` hints="${xmlEscape(params.speechHints.trim())}"` : ""
  return (
    intro +
    `<Gather input="speech" speechTimeout="auto" timeout="12" action="${xmlEscape(params.actionUrl)}" method="POST" language="en-US"${hintsAttr}>` +
    prompt +
    `</Gather>` +
    `<Say ${SAY}>We did not hear a response. Goodbye.</Say><Hangup/>`
  )
}

async function applyCustomerUpdates(
  supabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
  customerId: string | null,
  classification: Awaited<ReturnType<typeof classifyCallScreeningAnswers>>,
): Promise<void> {
  if (!customerId) return
  const updates: Record<string, unknown> = {}
  if (classification.callerName && classification.callerName.length >= 2) {
    updates.display_name = classification.callerName.slice(0, 120)
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from("customers").update(updates).eq("id", customerId).eq("user_id", userId)
  }
}

async function logScreeningEvent(params: {
  supabase: ReturnType<typeof createServiceSupabase>
  userId: string
  customerId: string | null
  leadId?: string | null
  channelId: string | null
  callSid: string | null
  from: string
  to: string
  answers: ScreeningAnswer[]
  classification: Awaited<ReturnType<typeof classifyCallScreeningAnswers>>
  action: "forwarded" | "voicemail" | "uncertain_voicemail"
}): Promise<void> {
  const transcript = params.answers.map((a) => `${a.question}\n→ ${a.answer || "(no response)"}`).join("\n\n")
  const verdictLabel =
    params.classification.verdict === "good_lead"
      ? "Qualified lead"
      : params.classification.verdict === "spam"
        ? "Spam screened"
        : params.classification.verdict === "cold_call"
          ? "Cold call screened"
          : "Call screened"

  await logCommunicationEvent(params.supabase, {
    user_id: params.userId,
    customer_id: params.customerId,
    lead_id: params.leadId ?? null,
    channel_id: params.channelId,
    event_type: "call",
    direction: "inbound",
    external_id: params.callSid,
    subject: `${verdictLabel}: ${params.classification.intentSummary.slice(0, 120)}`,
    body: transcript,
    transcript_text: transcript,
    summary_text: params.classification.intentSummary,
    unread: true,
    metadata: {
      call_screening: true,
      screening_verdict: params.classification.verdict,
      screening_confidence: params.classification.confidence,
      screening_spam_signals: params.classification.spamSignals,
      screening_answers: params.answers,
      screening_action: params.action,
      enrich_source: "auto_attendant_live",
      from: params.from,
      to: params.to,
    },
  })
}

async function ensureLeadForScreeningCall(
  supabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
  customerId: string | null,
  callerName: string | null,
  transcript: string,
  intentSummary: string,
): Promise<string | null> {
  if (!customerId) return null
  const title = callerName?.trim()
    ? `Phone inquiry: ${callerName.trim().slice(0, 80)}`
    : "Phone inquiry (auto-attendant)"
  try {
    return await ensureOpenLeadForInbound(supabase, userId, customerId, title, `${intentSummary}\n\n${transcript}`.slice(0, 4000))
  } catch (e) {
    console.warn("[call-screening] ensure lead", e instanceof Error ? e.message : e)
    return null
  }
}

async function buildForwardDialTwiml(params: {
  req: VercelRequest
  channel: CommunicationChannel
  from: string
  to: string
  forwardTo: string
  settings: VoiceAutoAttendantSettings
}): Promise<string> {
  const { req, channel, from, to, forwardTo, settings } = params
  const origin = requestPublicOrigin(req)
  const supabase = createServiceSupabase()
  const routingProfile = channel.user_id ? await getUserRoutingProfile(supabase, channel.user_id) : null

  const query = new URLSearchParams()
  if (channel.id) query.set("channelId", channel.id)
  if (to) query.set("to", to)
  if (from) query.set("from", from)
  const q = query.size ? `?${query.toString()}` : ""
  const dialActionUrl = `${origin}/api/dial-result${q}`

  const twilioDid = to || normalizePhone(channel.public_address ?? "") || ""
  const inboundFrom = from && !/^anonymous$/i.test(from) ? from : twilioDid
  let callerIdForDial =
    routingProfile?.forward_dial_caller_id_mode === "twilio_number" && twilioDid ? twilioDid : inboundFrom || twilioDid

  if (settings.unknownCallerShowTradesmanId && twilioDid) {
    const knownName = channel.user_id && from ? await lookupCustomerDisplayNameByPhone(supabase, channel.user_id, from) : null
    if (!knownName) callerIdForDial = twilioDid
  }

  const whisperParams = new URLSearchParams()
  if (channel.user_id) whisperParams.set("userId", channel.user_id)
  if (from) whisperParams.set("from", from)
  if (channel.user_id && from) {
    try {
      const whisperName = await lookupCustomerDisplayNameByPhone(supabase, channel.user_id, from)
      if (whisperName) whisperParams.set("name", whisperName)
    } catch {
      /* whisper without CRM name */
    }
  }
  const whisperUrl = `${origin}/api/forward-whisper${whisperParams.size ? `?${whisperParams.toString()}` : ""}`

  const withinBusinessHours = isWithinBusinessHours(routingProfile)
  const whisperEnabled = routingProfile?.forward_whisper_on_answer === true
  const whisperOnlyOutsideHours = routingProfile?.forward_whisper_only_outside_business_hours === true
  const useWhisper =
    whisperEnabled && channel.user_id && (!whisperOnlyOutsideHours || !withinBusinessHours)
  const dialInner = useWhisper
    ? `<Number url="${xmlEscape(whisperUrl)}">${xmlEscape(forwardTo)}</Number>`
    : `<Number>${xmlEscape(forwardTo)}</Number>`

  const answerOnBridge = useWhisper ? "true" : "false"
  const dialTimeoutSec = useWhisper ? 25 : 32

  return (
    `<Say ${SAY}>Thank you. Connecting you now.</Say>` +
    `<Dial answerOnBridge="${answerOnBridge}" timeout="${dialTimeoutSec}" action="${xmlEscape(dialActionUrl)}" method="POST" callerId="${xmlEscape(callerIdForDial)}">` +
    dialInner +
    `</Dial>`
  )
}

export async function callScreeningHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).send("Method not allowed")
    return
  }

  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const to = normalizePhone(pickFirstString(req.body?.To, req.query?.To))
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const channelId = pickFirstString(req.query?.channelId)
  const stepRaw = pickFirstString(req.query?.step)
  const stepIndex = stepRaw ? Math.max(0, parseInt(stepRaw, 10) || 0) : 0
  const answers = decodeScreeningAnswers(pickFirstString(req.query?.answers))

  const supabase = createServiceSupabase()
  let channel: CommunicationChannel | null = null
  if (channelId) {
    const { data } = await supabase.from("client_communication_channels").select("*").eq("id", channelId).maybeSingle()
    channel = (data as CommunicationChannel | null) ?? null
  } else if (to) {
    channel = await lookupChannelByPublicAddress(supabase, to)
  }

  if (!channel?.user_id) {
    sendTwiml(res, twimlResponse(`<Say ${SAY}>We could not route your call. Goodbye.</Say><Hangup/>`))
    return
  }

  const settings = await loadVoiceAutoAttendantForUser(supabase, channel.user_id)
  const steps = activeScreeningSteps(settings)
  const origin = requestPublicOrigin(req)

  let speechHints = ""
  try {
    const { loadBusinessAiVocabulary, twilioSpeechHintsCsv } = await import("../src/lib/businessAiVocabulary.js")
    const vocab = await loadBusinessAiVocabulary(supabase, channel.user_id)
    speechHints = twilioSpeechHintsCsv(vocab)
  } catch {
    speechHints = ""
  }

  const routingProfile = await getUserRoutingProfile(supabase, channel.user_id)
  const forwardingAllowed = isWithinBusinessHours(routingProfile)
  const forwardRaw = channel.voice_enabled && forwardingAllowed ? channel.forward_to_phone : null
  const forwardTo =
    forwardRaw && typeof forwardRaw === "string" && forwardRaw.trim()
      ? toTwilioE164(forwardRaw.trim()) || normalizePhone(forwardRaw.trim()) || forwardRaw.trim()
      : null

  const query = screeningBaseQuery(req, channel, from, to)
  const voicemailQuery = new URLSearchParams(query)
  const voicemailActionUrl = `${origin}/api/voicemail-result?${voicemailQuery.toString()}`
  const transcribeUrl = `${voicemailActionUrl}&phase=transcribe`

  const gatherSpeech = pickFirstString(req.body?.SpeechResult, req.query?.SpeechResult)
  const isGatherCallback = req.body?.SpeechResult !== undefined || req.query?.SpeechResult !== undefined

  // Gather callback — store answer and advance or finish screening
  if (isGatherCallback && steps[stepIndex]) {
    const currentStep = steps[stepIndex]
    const prior = priorAnswersMap(answers)
    const question = resolveScreeningPrompt(currentStep, prior)
    const nextAnswers: ScreeningAnswer[] = [
      ...answers,
      {
        stepId: currentStep.id,
        kind: currentStep.kind,
        question,
        answer: gatherSpeech.trim(),
      },
    ]
    const nextStepIndex = stepIndex + 1
    if (nextStepIndex < steps.length) {
      const nextStep = steps[nextStepIndex]
      const nextPrior = priorAnswersMap(nextAnswers)
      const nextPrompt = resolveScreeningPrompt(nextStep, nextPrior)
      const actionQ = screeningBaseQuery(req, channel, from, to)
      actionQ.set("step", String(nextStepIndex))
      actionQ.set("answers", encodeScreeningAnswers(nextAnswers))
      const actionUrl = `${origin}/api/call-screening?${actionQ.toString()}`
      sendTwiml(
        res,
        twimlResponse(
          buildGatherStepTwiml({
            actionUrl,
            settings,
            promptText: nextPrompt,
            recordingUrl: nextStep.recordingUrl,
            speechHints,
          }),
        ),
      )
      return
    }

    // Final step — classify and route
    const businessContext = await loadCallScreeningBusinessContext(supabase, channel.user_id)
    const classification = await classifyCallScreeningAnswers(nextAnswers, settings.spamScreenEnabled, businessContext)
    const transcript = nextAnswers.map((a) => `${a.question}\n→ ${a.answer || "(no response)"}`).join("\n\n")
    let customerId: string | null = null
    if (from) {
      const { getOrCreateCustomerByPhone } = await import("./_communications.js")
      const customer = await getOrCreateCustomerByPhone(supabase, channel.user_id, from)
      customerId = customer?.customerId ?? null
      await applyCustomerUpdates(supabase, channel.user_id, customerId, classification)
    }
    const leadId =
      classification.verdict === "good_lead" || classification.verdict === "uncertain"
        ? await ensureLeadForScreeningCall(
            supabase,
            channel.user_id,
            customerId,
            classification.callerName,
            transcript,
            classification.intentSummary,
          )
        : null

    const screeningBase = {
      supabase,
      userId: channel.user_id,
      customerId,
      leadId,
      channelId: channel.id,
      callSid,
      from,
      to,
      answers: nextAnswers,
      classification,
    }

    const isBad =
      settings.spamScreenEnabled &&
      settings.spamToVoicemail &&
      (classification.verdict === "spam" || classification.verdict === "cold_call")
    const isGood = classification.verdict === "good_lead" || classification.verdict === "uncertain"

    if (isBad) {
      await logScreeningEvent({ ...screeningBase, action: "voicemail" })
      sendTwiml(
        res,
        buildVoicemailTwiml({
          recordAction: voicemailActionUrl,
          transcribeCallback: transcribeUrl,
          routingProfile,
          preambleSay: "Thank you. We are not able to connect this call.",
        }),
      )
      return
    }

    if (isGood && settings.forwardGoodLeads && forwardTo) {
      await logScreeningEvent({ ...screeningBase, action: "forwarded" })
      const dialInner = await buildForwardDialTwiml({ req, channel, from, to, forwardTo, settings })
      sendTwiml(res, twimlResponse(dialInner))
      return
    }

    await logScreeningEvent({ ...screeningBase, action: "uncertain_voicemail" })
    sendTwiml(
      res,
      buildVoicemailTwiml({
        recordAction: voicemailActionUrl,
        transcribeCallback: transcribeUrl,
        routingProfile,
      }),
    )
    return
  }

  // First prompt (step 0)
  if (steps.length === 0) {
    sendTwiml(res, twimlResponse(`<Say ${SAY}>Please hold while we connect you.</Say><Hangup/>`))
    return
  }

  const first = steps[0]
  const firstPrompt = resolveScreeningPrompt(first, priorAnswersMap(answers))
  const actionQ = screeningBaseQuery(req, channel, from, to)
  actionQ.set("step", "0")
  actionQ.set("answers", encodeScreeningAnswers(answers))
  const actionUrl = `${origin}/api/call-screening?${actionQ.toString()}`
  const intro = "Thanks for calling. To help us route your call, please answer a few quick questions."
  sendTwiml(
    res,
    twimlResponse(
      buildGatherStepTwiml({
        actionUrl,
        settings,
        promptText: firstPrompt,
        recordingUrl: first.recordingUrl,
        intro,
        speechHints,
      }),
    ),
  )
}

/** True when tenant has screening enabled with at least one active step. */
export async function shouldUseCallScreening(userId: string): Promise<boolean> {
  const supabase = createServiceSupabase()
  const settings = await loadVoiceAutoAttendantForUser(supabase, userId)
  return settings.enabled && settings.mode !== "off" && activeScreeningSteps(settings).length > 0
}

export function buildCallScreeningRedirectUrl(origin: string, query: URLSearchParams): string {
  const q = new URLSearchParams(query)
  q.set("step", "0")
  return `${origin}/api/call-screening?${q.toString()}`
}
