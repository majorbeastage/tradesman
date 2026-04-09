import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, getPrimaryEmailChannelForUser, getPrimarySmsChannelForUser } from "./_communications.js"

export type LeadsSettingsValues = Record<string, string>

export function parseLeadsSettingsFromMetadata(metadata: unknown): LeadsSettingsValues {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const m = metadata as Record<string, unknown>
  const v = m.leadsSettingsValues
  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  const out: LeadsSettingsValues = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val
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

async function openAiText(system: string, user: string): Promise<string | null> {
  const key = firstEnv("OPENAI_API_KEY")
  if (!key) return null
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 500,
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
  }
}

/** After embed/campaign lead is stored: notify business user and optional auto-reply to consumer. */
export async function runLeadCaptureSideEffects(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
  customerId: string,
  snapshot: { title: string; description: string; phone: string; email: string; name: string },
): Promise<void> {
  const { data: prof } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const settings = parseLeadsSettingsFromMetadata(prof?.metadata)

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
  if (wantAiSummary) {
    const ai = await openAiText(
      "Summarize this new sales lead in 2–4 short sentences for the business owner. No markdown.",
      summaryBody.slice(0, 6000),
    )
    if (ai) summaryBody = `${ai}\n\n---\n${summaryBody}`
  }

  const notifyOn = settings.notify_new_lead === "checked" || settings.email_new_lead === "checked"
  if (notifyOn) {
    const channel = settings.notify_new_lead_channel || (settings.email_new_lead === "checked" ? "Email" : "Email")
    const base = publicAppBaseUrl()
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
            body: `New lead (campaign/embed). ${snapshot.title.slice(0, 120)}`.slice(0, 1500),
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
  let replyText = (settings.auto_response_message ?? "").trim()
  if (settings.auto_response_use_ai === "checked") {
    const inbound = [snapshot.description, snapshot.name && `From: ${snapshot.name}`].filter(Boolean).join("\n")
    const aiReply = await openAiText(
      "You write short, professional SMS/email replies for a home-services contractor. Match the consumer's stated need (e.g. roof repair vs replacement). Under 300 characters if possible. No markdown, no signature line.",
      `Template or tone to respect (may be empty): ${replyText}\n\nConsumer message / lead details:\n${inbound.slice(0, 4000)}`,
    )
    if (aiReply) replyText = aiReply
  }
  if (!replyText || !base) return

  if (snapshot.phone) {
    await fetch(`${base}/api/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        to: snapshot.phone,
        body: replyText.slice(0, 1500),
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
}
