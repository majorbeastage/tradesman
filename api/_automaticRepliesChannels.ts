/** Server-side automatic replies: intake channel → outbound response settings. */

export const AUTO_REPLY_INTAKE_CHANNELS = ["Phone call", "Text message", "Email"] as const
export type AutoReplyIntakeChannel = (typeof AUTO_REPLY_INTAKE_CHANNELS)[number]

export type AutoReplyChannelFlow = Record<string, string>

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : ""
}

function defaultFlowForIntake(intake: AutoReplyIntakeChannel): AutoReplyChannelFlow {
  if (intake === "Phone call") {
    return {
      conv_auto_reply_enabled: "checked",
      conv_auto_reply_outbound: "Text message",
      conv_auto_sms_consent_on_call: "checked",
      conv_auto_reply_message: "Hi — sorry we missed your call! Reply here with how we can help, or call us back when you can.",
      conv_auto_reply_ai: "unchecked",
      conv_auto_reply_ai_require_approval: "unchecked",
    }
  }
  if (intake === "Text message") {
    return {
      conv_auto_reply_enabled: "checked",
      conv_auto_reply_outbound: "Text message",
      conv_auto_reply_message: "Thanks for texting us! We got your message and will follow up shortly.",
      conv_auto_reply_ai: "unchecked",
      conv_auto_reply_ai_require_approval: "unchecked",
    }
  }
  return {
    conv_auto_reply_enabled: "unchecked",
    conv_auto_reply_outbound: "None",
    conv_auto_reply_message: "",
    conv_auto_reply_ai: "unchecked",
  }
}

export function parseAutomaticRepliesSourceFlows(metadata: unknown): Record<AutoReplyIntakeChannel, AutoReplyChannelFlow> {
  const out = {
    "Phone call": defaultFlowForIntake("Phone call"),
    "Text message": defaultFlowForIntake("Text message"),
    Email: defaultFlowForIntake("Email"),
  } satisfies Record<AutoReplyIntakeChannel, AutoReplyChannelFlow>

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return out
  const raw = (metadata as Record<string, unknown>).conversationsAutomaticRepliesSourceFlows
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out

  for (const intake of AUTO_REPLY_INTAKE_CHANNELS) {
    const saved = (raw as Record<string, unknown>)[intake]
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      out[intake] = { ...defaultFlowForIntake(intake), ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, str(v)])) }
    }
  }
  return out
}

export function parseConversationsAutomaticRepliesValues(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const v = (metadata as Record<string, unknown>).conversationsAutomaticRepliesValues
  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val
  }
  return out
}

function outboundForFlow(intake: AutoReplyIntakeChannel, flow: AutoReplyChannelFlow): string {
  const raw = flow.conv_auto_reply_outbound?.trim()
  if (intake === "Phone call") {
    if (raw === "Text message" || raw === "Phone call" || raw === "None") return raw
    return "Text message"
  }
  if (intake === "Text message") {
    if (raw === "Text message" || raw === "None") return raw
    return "Text message"
  }
  if (raw === "Email" || raw === "None") return raw
  return "Email"
}

export function resolveAutoReplyForIntake(
  metadata: unknown,
  intake: AutoReplyIntakeChannel,
): { enabled: boolean; outbound: string; settings: AutoReplyChannelFlow } | null {
  const flows = parseAutomaticRepliesSourceFlows(metadata)
  const legacy = parseConversationsAutomaticRepliesValues(metadata)
  let flow = { ...flows[intake] }

  if (Object.keys(flow).length <= 6 && legacy.conv_auto_reply_method === intake && legacy.conv_auto_reply_enabled === "checked") {
    flow = { ...flow, ...legacy }
  }

  const enabled = flow.conv_auto_reply_enabled === "checked"
  const outbound = outboundForFlow(intake, flow)
  if (!enabled || outbound === "None") return null
  return { enabled, outbound, settings: flow }
}
