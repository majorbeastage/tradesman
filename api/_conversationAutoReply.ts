import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv } from "./_communications.js"
import { openAiText } from "./_leadAutomation.js"
import { SMS_OUTBOUND_BODY_HARD_MAX_CHARS } from "./_smsComplianceLimits.js"

const PENDING_AI_KEY = "pending_ai_consumer_reply"

function publicAppBaseUrl(): string {
  const u = firstEnv("NEXT_PUBLIC_APP_URL", "PUBLIC_APP_URL", "VITE_APP_URL")
  if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, "")
  const v = firstEnv("VERCEL_URL")
  if (v) return `https://${v.replace(/^https?:\/\//, "")}`
  return ""
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

/**
 * After an inbound SMS is stored on an open conversation: optional auto-reply (template / AI).
 * If AI + “require approval”, writes conversations.metadata.pending_ai_consumer_reply instead of sending.
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

  const auto = parseConversationsAutomaticRepliesValues(prof?.metadata)
  const aiAutomationsOn = (prof as { ai_assistant_visible?: boolean } | null)?.ai_assistant_visible !== false

  if (auto.conv_auto_reply_enabled !== "checked") return
  if (auto.conv_auto_reply_method !== "Text message") return

  let replyText = (auto.conv_auto_reply_message ?? "").trim()
  const useAi = auto.conv_auto_reply_ai === "checked" && aiAutomationsOn
  const requireApproval = auto.conv_auto_reply_ai_require_approval === "checked"

  if (useAi) {
    const brief = (auto.conv_auto_reply_ai_brief ?? "").trim()
    const { data: msgs } = await supabase
      .from("messages")
      .select("content, sender, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(60)

    const lines = (msgs || [])
      .map((m: { sender?: string | null; content?: string | null }) => {
        const s = (m.sender ?? "thread").trim()
        const c = (m.content ?? "").trim()
        return `${s}: ${c}`
      })
      .filter((t: string) => t.length > 2)
    const thread = lines.join("\n").slice(0, 8000)
    const userPrompt = `Business owner brief (what to communicate):\n${brief || "(none)"}\n\nTemplate or tone to respect:\n${replyText || "(none)"}\n\nConversation thread:\n${thread || "(no messages yet)"}\n\nLatest inbound SMS:\n${inboundBody.slice(0, 2000)}`

    const aiReply = await openAiText(
      "You write short, professional SMS replies for a home-services contractor. Match the thread. Under 400 words. No markdown.",
      userPrompt,
    )
    if (aiReply?.trim()) replyText = aiReply.trim()
  }

  replyText = replyText.trim()
  if (!replyText) return

  const created_at = new Date().toISOString()

  if (useAi && requireApproval) {
    await mergeConversationMetadataJson(supabase, conversationId, (prev) => ({
      ...prev,
      [PENDING_AI_KEY]: {
        v: 1,
        body: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
        channel: "sms",
        to,
        created_at,
        source: "conversation_auto",
      },
    }))
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
      conversationId,
      customerId,
    }),
  }).catch((e) => console.warn("[conversationAutoReply] auto SMS", e))

  const { error: insErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "user",
    content: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
  })
  if (insErr) console.warn("[conversationAutoReply] log outbound message", insErr.message)
}
