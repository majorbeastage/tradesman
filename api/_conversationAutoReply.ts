import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv } from "./_communications.js"
import { resolveAutoReplyForIntake, type AutoReplyIntakeChannel } from "./_automaticRepliesChannels.js"
import { openAiText } from "./_leadAutomation.js"
import { SMS_OUTBOUND_BODY_HARD_MAX_CHARS } from "./_smsComplianceLimits.js"

export { parseConversationsAutomaticRepliesValues } from "./_automaticRepliesChannels.js"

const PENDING_AI_KEY = "pending_ai_consumer_reply"
const SMS_CONSENT_META_KEY = "sms_consent"

function publicAppBaseUrl(): string {
  const u = firstEnv("NEXT_PUBLIC_APP_URL", "PUBLIC_APP_URL", "VITE_APP_URL")
  if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, "")
  const v = firstEnv("VERCEL_URL")
  if (v) return `https://${v.replace(/^https?:\/\//, "")}`
  return ""
}

function smsDisclosureSnapshot(businessName: string): string {
  const biz = businessName.trim() || "Your business"
  return `The customer agrees to receive text messages from ${biz} regarding quotes, appointments, scheduling, job updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.`
}

async function mergeConversationMetadataJson(
  supabase: SupabaseClient,
  conversationId: string,
  mutator: (prev: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const { data } = await supabase.from("conversations").select("metadata").eq("id", conversationId).maybeSingle()
  const row = data as { metadata?: unknown } | null
  const prev =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}
  const next = mutator(prev)
  await supabase.from("conversations").update({ metadata: next }).eq("id", conversationId)
}

async function mergeLeadMetadataJson(
  supabase: SupabaseClient,
  leadId: string,
  mutator: (prev: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const { data } = await supabase.from("leads").select("metadata").eq("id", leadId).maybeSingle()
  const row = data as { metadata?: unknown } | null
  const prev =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}
  const next = mutator(prev)
  await supabase.from("leads").update({ metadata: next }).eq("id", leadId)
}

/** Record SMS opt-in when customer initiates an inbound call (for compliant text-back). */
export async function recordSmsConsentFromInboundCall(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<void> {
  const { data: cust } = await supabase
    .from("customers")
    .select("metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  const meta =
    cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
      ? { ...(cust.metadata as Record<string, unknown>) }
      : {}
  if (meta[SMS_CONSENT_META_KEY] && typeof meta[SMS_CONSENT_META_KEY] === "object") return

  const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle()
  const businessName = (prof as { display_name?: string | null } | null)?.display_name?.trim() || "Your business"

  meta[SMS_CONSENT_META_KEY] = {
    at: new Date().toISOString(),
    source: "phone_call",
    consent_method: "phone_call",
    consent_note: "Customer initiated inbound call to business line; consent recorded for follow-up text messages.",
    disclosure_snapshot: smsDisclosureSnapshot(businessName),
  }
  await supabase.from("customers").update({ metadata: meta }).eq("id", customerId).eq("user_id", userId)
}

async function buildAutoReplyText(
  supabase: SupabaseClient,
  settings: Record<string, string>,
  aiAutomationsOn: boolean,
  context: { inboundBody?: string; conversationId?: string; fallbackName?: string },
): Promise<string> {
  let replyText = (settings.conv_auto_reply_message ?? "").trim()
  const useAi = settings.conv_auto_reply_ai === "checked" && aiAutomationsOn

  if (useAi) {
    const brief = (settings.conv_auto_reply_ai_brief ?? "").trim()
    let thread = ""
    if (context.conversationId) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, sender, created_at")
        .eq("conversation_id", context.conversationId)
        .order("created_at", { ascending: true })
        .limit(60)
      thread = (msgs || [])
        .map((m: { sender?: string | null; content?: string | null }) => `${(m.sender ?? "thread").trim()}: ${(m.content ?? "").trim()}`)
        .filter((t: string) => t.length > 2)
        .join("\n")
        .slice(0, 8000)
    }
    const userPrompt = `Business owner brief:\n${brief || "(none)"}\n\nTemplate:\n${replyText || "(none)"}\n\nThread:\n${thread || "(none)"}\n\nLatest inbound:\n${(context.inboundBody ?? context.fallbackName ?? "").slice(0, 2000)}`
    const aiReply = await openAiText(
      "You write short, professional SMS replies for a home-services contractor. Under 400 words. No markdown.",
      userPrompt,
    )
    if (aiReply?.trim()) replyText = aiReply.trim()
  }
  return replyText.trim()
}

async function sendAutoSmsReply(opts: {
  supabase: SupabaseClient
  userId: string
  to: string
  replyText: string
  customerId: string
  conversationId?: string | null
  leadId?: string | null
  settings: Record<string, string>
  aiAutomationsOn: boolean
  pendingSource: string
}): Promise<void> {
  const { supabase, userId, to, replyText, customerId, conversationId, leadId, settings, aiAutomationsOn, pendingSource } =
    opts
  if (!replyText) return

  const useAi = settings.conv_auto_reply_ai === "checked" && aiAutomationsOn
  const requireApproval = settings.conv_auto_reply_ai_require_approval === "checked"
  const created_at = new Date().toISOString()

  if (useAi && requireApproval) {
    const pending = {
      v: 1,
      body: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
      channel: "sms",
      to,
      created_at,
      source: pendingSource,
    }
    if (conversationId) {
      await mergeConversationMetadataJson(supabase, conversationId, (prev) => ({ ...prev, [PENDING_AI_KEY]: pending }))
    } else if (leadId) {
      await mergeLeadMetadataJson(supabase, leadId, (prev) => ({ ...prev, [PENDING_AI_KEY]: pending }))
    }
    return
  }

  const base = publicAppBaseUrl()
  if (!base) return

  await fetch(`${base}/api/send-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      to,
      body: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
      conversationId: conversationId ?? undefined,
      leadId: leadId ?? undefined,
      customerId,
    }),
  }).catch((e) => console.warn("[conversationAutoReply] auto SMS", e))

  if (conversationId) {
    const { error: insErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "user",
      content: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
    })
    if (insErr) console.warn("[conversationAutoReply] log outbound message", insErr.message)
  }
}

/**
 * After an inbound SMS: auto-reply when Text message intake channel is enabled.
 */
export async function runConversationInboundSmsAutoReply(
  supabase: SupabaseClient,
  opts: {
    userId: string
    conversationId: string
    customerId: string
    customerPhone: string
    inboundBody: string
  },
): Promise<void> {
  const { userId, conversationId, customerId, customerPhone, inboundBody } = opts
  const to = customerPhone.trim()
  if (!to) return

  const { data: prof } = await supabase
    .from("profiles")
    .select("metadata, ai_assistant_visible")
    .eq("id", userId)
    .maybeSingle()

  const resolved = resolveAutoReplyForIntake(prof?.metadata, "Text message")
  if (!resolved || resolved.outbound !== "Text message") return

  const aiAutomationsOn = (prof as { ai_assistant_visible?: boolean } | null)?.ai_assistant_visible !== false
  const replyText = await buildAutoReplyText(supabase, resolved.settings, aiAutomationsOn, {
    inboundBody,
    conversationId,
  })
  await sendAutoSmsReply({
    supabase,
    userId,
    to,
    replyText,
    customerId,
    conversationId,
    settings: resolved.settings,
    aiAutomationsOn,
    pendingSource: "conversation_auto",
  })
}

/**
 * After a missed inbound call: text-back when Phone call intake → Text message outbound is enabled.
 */
export async function runMissedCallAutoTextBack(
  supabase: SupabaseClient,
  opts: {
    userId: string
    customerId: string
    customerPhone: string
    conversationId?: string | null
    leadId?: string | null
    dialCallStatus?: string
  },
): Promise<void> {
  const { userId, customerId, customerPhone, conversationId, leadId, dialCallStatus } = opts
  const to = customerPhone.trim()
  if (!to) return

  const { data: prof } = await supabase
    .from("profiles")
    .select("metadata, ai_assistant_visible, display_name")
    .eq("id", userId)
    .maybeSingle()

  const resolved = resolveAutoReplyForIntake(prof?.metadata, "Phone call")
  if (!resolved || resolved.outbound !== "Text message") return

  if (resolved.settings.conv_auto_sms_consent_on_call !== "unchecked") {
    await recordSmsConsentFromInboundCall(supabase, userId, customerId)
  }

  const aiAutomationsOn = (prof as { ai_assistant_visible?: boolean } | null)?.ai_assistant_visible !== false
  let replyText = await buildAutoReplyText(supabase, resolved.settings, aiAutomationsOn, {
    fallbackName: dialCallStatus ? `Missed call (${dialCallStatus})` : "Missed call",
    conversationId: conversationId ?? undefined,
  })
  if (!replyText) {
    const biz = (prof as { display_name?: string | null } | null)?.display_name?.trim() || "us"
    replyText = `Hi — sorry we missed your call! This is ${biz}. Reply here with how we can help, or call us back when you can.`
  }

  await sendAutoSmsReply({
    supabase,
    userId,
    to,
    replyText,
    customerId,
    conversationId,
    leadId,
    settings: resolved.settings,
    aiAutomationsOn,
    pendingSource: "missed_call_auto_text",
  })
}

/** Optional hook for inbound email auto-reply (Email intake channel). */
export async function runConversationInboundEmailAutoReply(
  supabase: SupabaseClient,
  opts: {
    userId: string
    customerId: string
    customerEmail: string
    conversationId?: string | null
    leadId?: string | null
    inboundBody: string
    subject?: string
  },
): Promise<void> {
  const { userId, customerId, customerEmail, conversationId, leadId, inboundBody, subject } = opts
  const to = customerEmail.trim()
  if (!to) return

  const { data: prof } = await supabase
    .from("profiles")
    .select("metadata, ai_assistant_visible")
    .eq("id", userId)
    .maybeSingle()

  const resolved = resolveAutoReplyForIntake(prof?.metadata, "Email")
  if (!resolved || resolved.outbound !== "Email") return

  const aiAutomationsOn = (prof as { ai_assistant_visible?: boolean } | null)?.ai_assistant_visible !== false
  const replyText = await buildAutoReplyText(supabase, resolved.settings, aiAutomationsOn, { inboundBody, conversationId: conversationId ?? undefined })
  if (!replyText) return

  const useAi = resolved.settings.conv_auto_reply_ai === "checked" && aiAutomationsOn
  const requireApproval = resolved.settings.conv_auto_reply_ai_require_approval === "checked"
  const base = publicAppBaseUrl()
  if (!base) return

  if (useAi && requireApproval) {
    const pending = {
      v: 1,
      body: replyText.slice(0, 12000),
      channel: "email",
      to,
      subject: subject?.trim() || "Thanks for contacting us",
      created_at: new Date().toISOString(),
      source: "conversation_auto_email",
    }
    if (conversationId) {
      await mergeConversationMetadataJson(supabase, conversationId, (prev) => ({ ...prev, [PENDING_AI_KEY]: pending }))
    } else if (leadId) {
      await mergeLeadMetadataJson(supabase, leadId, (prev) => ({ ...prev, [PENDING_AI_KEY]: pending }))
    }
    return
  }

  await fetch(`${base}/api/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      to,
      subject: subject?.trim() || "Thanks for contacting us",
      body: replyText.slice(0, 12000),
      conversationId: conversationId ?? undefined,
      leadId: leadId ?? undefined,
      customerId,
    }),
  }).catch((e) => console.warn("[conversationAutoReply] auto email", e))
}

export type { AutoReplyIntakeChannel }
