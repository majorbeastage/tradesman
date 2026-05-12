import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, getPrimaryEmailChannelForUser, getPrimarySmsChannelForUser } from "./_communications.js"
import { evaluateAndPersistLeadFit } from "./_leadFitClassification.js"
import { SMS_OUTBOUND_BODY_HARD_MAX_CHARS } from "./_smsComplianceLimits.js"

export type LeadsSettingsValues = Record<string, string>

export function parseLeadsSettingsFromMetadata(metadata: unknown): LeadsSettingsValues {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const m = metadata as Record<string, unknown>
  const v = m.leadsSettingsValues
  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  const out: LeadsSettingsValues = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val
    else if (typeof val === "boolean") out[k] = val ? "checked" : "unchecked"
  }
  return out
}

function publicAppBaseUrl(): string {
  const u = firstEnv("NEXT_PUBLIC_APP_URL", "PUBLIC_APP_URL", "VITE_APP_URL")
  if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, "")
  const v = firstEnv("VERCEL_URL")
  if (v) return `https://${v.replace(/^https?:\/\//, "")}`
  return ""
}

export type OpenAiTextOptions = {
  /** Default 500; use ~2000+ when the model must return a larger JSON object (estimate wizard, scope lines). */
  maxTokens?: number
  /** Abort the OpenAI HTTP request after this many ms (default 48s; stay under typical serverless limits). */
  timeoutMs?: number
}

export async function openAiText(system: string, user: string, opts?: OpenAiTextOptions): Promise<string | null> {
  const key = firstEnv("OPENAI_API_KEY")
  if (!key) return null
  const max_tokens = typeof opts?.maxTokens === "number" && opts.maxTokens > 0 ? Math.min(opts.maxTokens, 8000) : 500
  const timeoutMs = typeof opts?.timeoutMs === "number" && opts.timeoutMs > 0 ? Math.min(opts.timeoutMs, 120_000) : 48_000
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens,
        temperature: 0.4,
      }),
    })
    const raw = await res.text()
    if (!res.ok) return null
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const t = j.choices?.[0]?.message?.content?.trim()
    return t || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const PENDING_AI_KEY = "pending_ai_consumer_reply"

/** Build consumer-facing auto-reply text (template ± AI). */
export async function buildLeadConsumerAutoReplyText(
  settings: LeadsSettingsValues,
  aiAutomationsOn: boolean,
  snapshot: { description: string; name: string },
): Promise<string> {
  let replyText = (settings.auto_response_message ?? "").trim()
  const useAi = settings.auto_response_use_ai === "checked" && aiAutomationsOn
  if (useAi) {
    const inbound = [snapshot.description, snapshot.name && `From: ${snapshot.name}`].filter(Boolean).join("\n")
    const aiReply = await openAiText(
      "You write short, professional SMS/email replies for a home-services contractor. Match the consumer's stated need (e.g. roof repair vs replacement). Under 300 characters if possible. No markdown, no signature line.",
      `Template or tone to respect (may be empty): ${replyText}\n\nConsumer message / lead details:\n${inbound.slice(0, 4000)}`,
    )
    if (aiReply) replyText = aiReply
  }
  return replyText.trim()
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

/** After embed/campaign lead is stored: notify business user and optional auto-reply to consumer. */
export async function runLeadCaptureSideEffects(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
  customerId: string,
  snapshot: { title: string; description: string; phone: string; email: string; name: string },
): Promise<void> {
  const { data: prof } = await supabase.from("profiles").select("metadata, ai_assistant_visible").eq("id", userId).maybeSingle()
  const settings = parseLeadsSettingsFromMetadata(prof?.metadata)
  const aiAutomationsOn = (prof as { ai_assistant_visible?: boolean } | null)?.ai_assistant_visible !== false
  const base = publicAppBaseUrl()

  const lines = [
    `Lead: ${snapshot.title}`,
    snapshot.description?.trim() ? snapshot.description.trim() : null,
    snapshot.name ? `Name: ${snapshot.name}` : null,
    snapshot.phone ? `Phone: ${snapshot.phone}` : null,
    snapshot.email ? `Email: ${snapshot.email}` : null,
  ].filter(Boolean) as string[]

  let summaryBody = lines.join("\n\n")
  const wantAiSummary =
    settings.notify_new_lead === "checked" || settings.email_new_lead === "checked"
  if (wantAiSummary && aiAutomationsOn) {
    const ai = await openAiText(
      "Summarize this new sales lead in 2–4 short sentences for the business owner. No markdown.",
      summaryBody.slice(0, 6000),
    )
    if (ai) summaryBody = `${ai}\n\n---\n${summaryBody}`
  }

  const notifyOn = settings.notify_new_lead === "checked" || settings.email_new_lead === "checked"
  if (notifyOn) {
    const channel = settings.notify_new_lead_channel || (settings.email_new_lead === "checked" ? "Email" : "Email")
    if (channel === "Text Message" && base) {
      const ch = await getPrimarySmsChannelForUser(supabase, userId)
      const rawTo = (ch?.forward_to_phone ?? "").trim()
      if (rawTo) {
        await fetch(`${base}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            to: rawTo,
            body: `New lead (campaign/embed). ${snapshot.title.slice(0, 120)}`.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
            leadId,
            customerId,
          }),
        }).catch((e) => console.warn("[leadAutomation] notify SMS", e))
      }
    } else if (channel === "App notification if registered") {
      /* Future: push / in-app */
    } else if (base) {
      const ch = await getPrimaryEmailChannelForUser(supabase, userId)
      const to = (ch?.forward_to_email ?? "").trim()
      if (to) {
        await fetch(`${base}/api/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            to,
            subject: `New lead: ${snapshot.title.slice(0, 80)}`,
            body: summaryBody.slice(0, 12000),
            leadId,
            customerId,
          }),
        }).catch((e) => console.warn("[leadAutomation] notify email", e))
      }
    }
  }

  if (settings.send_auto_response !== "checked") return

  const replyText = await buildLeadConsumerAutoReplyText(settings, aiAutomationsOn, {
    description: snapshot.description,
    name: snapshot.name,
  })
  if (!replyText || !base) return

  const useAi = settings.auto_response_use_ai === "checked" && aiAutomationsOn
  const requireApproval = settings.auto_response_use_ai_require_approval === "checked"
  if (useAi && requireApproval) {
    const created_at = new Date().toISOString()
    if (snapshot.phone) {
      await mergeLeadMetadataJson(supabase, leadId, (prev) => ({
        ...prev,
        [PENDING_AI_KEY]: {
          v: 1,
          body: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
          channel: "sms",
          to: snapshot.phone,
          created_at,
          source: "lead_auto_response",
        },
      }))
    } else if (snapshot.email) {
      await mergeLeadMetadataJson(supabase, leadId, (prev) => ({
        ...prev,
        [PENDING_AI_KEY]: {
          v: 1,
          body: replyText.slice(0, 12000),
          channel: "email",
          to: snapshot.email,
          subject: "Thanks for contacting us",
          created_at,
          source: "lead_auto_response",
        },
      }))
    }
    return
  }

  if (snapshot.phone) {
    await fetch(`${base}/api/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        to: snapshot.phone,
        body: replyText.slice(0, SMS_OUTBOUND_BODY_HARD_MAX_CHARS),
        leadId,
        customerId,
      }),
    }).catch((e) => console.warn("[leadAutomation] auto SMS", e))
  } else if (snapshot.email) {
    await fetch(`${base}/api/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        to: snapshot.email,
        subject: "Thanks for contacting us",
        body: replyText.slice(0, 12000),
        leadId,
        customerId,
      }),
    }).catch((e) => console.warn("[leadAutomation] auto email", e))
  }

  void evaluateAndPersistLeadFit(supabase, leadId, {}).catch((e) =>
    console.warn("[leadAutomation] lead fit", e instanceof Error ? e.message : e),
  )
}
