/** Per-channel automatic replies: intake (how customer reached you) → outbound (how you respond). */

export const AUTO_REPLY_INTAKE_CHANNELS = ["Phone call", "Text message", "Email"] as const
export type AutoReplyIntakeChannel = (typeof AUTO_REPLY_INTAKE_CHANNELS)[number]

export const AUTO_REPLY_OUTBOUND_CHANNELS = ["Text message", "Email", "Phone call", "None"] as const
export type AutoReplyOutboundChannel = (typeof AUTO_REPLY_OUTBOUND_CHANNELS)[number]

export const INTAKE_CHANNEL_DESCRIPTIONS: Record<AutoReplyIntakeChannel, string> = {
  "Phone call": "Customer calls your business line — especially missed calls (no answer, busy, or declined).",
  "Text message": "Customer texts your business number.",
  Email: "Customer emails your business inbox.",
}

export const OUTBOUND_OPTIONS_FOR_INTAKE: Record<AutoReplyIntakeChannel, AutoReplyOutboundChannel[]> = {
  "Phone call": ["Text message", "Phone call", "None"],
  "Text message": ["Text message", "None"],
  Email: ["Email", "None"],
}

export const DEFAULT_MISSED_CALL_SMS_TEMPLATE =
  "Hi — sorry we missed your call! Reply here with how we can help, or call us back when you can."

export const DEFAULT_INBOUND_SMS_TEMPLATE =
  "Thanks for texting us! We got your message and will follow up shortly."

export const DEFAULT_INBOUND_EMAIL_TEMPLATE =
  "Thanks for reaching out — we received your email and will reply soon."

export type AutoReplyChannelFlow = Record<string, string>

export type AutoReplySummaryRow = {
  intake: AutoReplyIntakeChannel
  enabled: boolean
  outbound: AutoReplyOutboundChannel
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : ""
}

export function defaultFlowForIntake(intake: AutoReplyIntakeChannel): AutoReplyChannelFlow {
  if (intake === "Phone call") {
    return {
      conv_auto_reply_enabled: "checked",
      conv_auto_reply_outbound: "Text message",
      conv_auto_sms_consent_on_call: "checked",
      conv_auto_reply_message: DEFAULT_MISSED_CALL_SMS_TEMPLATE,
      conv_auto_reply_ai: "unchecked",
      conv_auto_reply_ai_require_approval: "unchecked",
      conv_auto_reply_ai_brief: "",
      conv_auto_phone_allow_automation: "unchecked",
    }
  }
  if (intake === "Text message") {
    return {
      conv_auto_reply_enabled: "checked",
      conv_auto_reply_outbound: "Text message",
      conv_auto_reply_message: DEFAULT_INBOUND_SMS_TEMPLATE,
      conv_auto_reply_ai: "unchecked",
      conv_auto_reply_ai_require_approval: "unchecked",
      conv_auto_reply_ai_brief: "",
    }
  }
  return {
    conv_auto_reply_enabled: "unchecked",
    conv_auto_reply_outbound: "None",
    conv_auto_reply_message: DEFAULT_INBOUND_EMAIL_TEMPLATE,
    conv_auto_reply_ai: "unchecked",
    conv_auto_reply_ai_require_approval: "unchecked",
    conv_auto_reply_ai_brief: "",
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

/** Merge legacy flat values (single active method) into channel flows when flows were never saved. */
export function hydrateFlowsFromLegacyFlat(
  flows: Record<AutoReplyIntakeChannel, AutoReplyChannelFlow>,
  legacy: Record<string, string>,
): Record<AutoReplyIntakeChannel, AutoReplyChannelFlow> {
  const method = legacy.conv_auto_reply_method?.trim()
  if (!method || !AUTO_REPLY_INTAKE_CHANNELS.includes(method as AutoReplyIntakeChannel)) return flows

  const next = { ...flows, [method]: { ...flows[method as AutoReplyIntakeChannel] } } as Record<
    AutoReplyIntakeChannel,
    AutoReplyChannelFlow
  >
  for (const [k, v] of Object.entries(legacy)) {
    if (k === "conv_auto_reply_method") continue
    next[method as AutoReplyIntakeChannel][k] = v
  }
  if (legacy.conv_auto_reply_enabled === "checked") {
    next[method as AutoReplyIntakeChannel].conv_auto_reply_enabled = "checked"
  }
  if (!next[method as AutoReplyIntakeChannel].conv_auto_reply_outbound?.trim()) {
    next[method as AutoReplyIntakeChannel].conv_auto_reply_outbound =
      method === "Phone call" ? "Text message" : method === "Email" ? "Email" : "Text message"
  }
  return next
}

export function outboundForFlow(intake: AutoReplyIntakeChannel, flow: AutoReplyChannelFlow): AutoReplyOutboundChannel {
  const raw = flow.conv_auto_reply_outbound?.trim()
  const allowed = OUTBOUND_OPTIONS_FOR_INTAKE[intake]
  if (raw && (allowed as readonly string[]).includes(raw)) return raw as AutoReplyOutboundChannel
  if (intake === "Phone call") return "Text message"
  if (intake === "Text message") return "Text message"
  return "Email"
}

export function buildAutoReplySummary(
  flows: Record<AutoReplyIntakeChannel, AutoReplyChannelFlow>,
): AutoReplySummaryRow[] {
  return AUTO_REPLY_INTAKE_CHANNELS.map((intake) => ({
    intake,
    enabled: flows[intake].conv_auto_reply_enabled === "checked",
    outbound: flows[intake].conv_auto_reply_enabled === "checked" ? outboundForFlow(intake, flows[intake]) : "None",
  }))
}

/** Legacy flat blob for older server paths — prefers Text message flow, then first enabled channel. */
export function flattenPrimaryFlowForLegacy(
  flows: Record<AutoReplyIntakeChannel, AutoReplyChannelFlow>,
): Record<string, string> {
  const primary =
    flows["Text message"].conv_auto_reply_enabled === "checked"
      ? "Text message"
      : AUTO_REPLY_INTAKE_CHANNELS.find((ch) => flows[ch].conv_auto_reply_enabled === "checked") ?? "Text message"
  return {
    ...flows[primary],
    conv_auto_reply_method: primary,
  }
}

export function formatSummaryLabel(row: AutoReplySummaryRow): string {
  if (!row.enabled || row.outbound === "None") return "No automatic reply"
  if (row.intake === "Phone call" && row.outbound === "Text message") return "Auto text-back"
  if (row.intake === row.outbound) return `Auto ${row.outbound.toLowerCase()} reply`
  return `Reply via ${row.outbound.toLowerCase()}`
}
