import type { SupabaseClient } from "@supabase/supabase-js"
import { insertCommunicationEventReturningId, logCommunicationEvent } from "./_communications.js"

export async function simulateSandboxOutboundEmail(
  supabase: SupabaseClient,
  params: {
    userId: string
    customerId?: string | null
    conversationId?: string | null
    leadId?: string | null
    to: string[]
    subject: string
    body: string
    bodyHtml?: string
    attachmentCount?: number
    attachmentNames?: string[]
  },
): Promise<{ ok: true; simulated: true; eventId: string | null; inboundReplyAt?: string }> {
  const eventId = await insertCommunicationEventReturningId(supabase, {
    user_id: params.userId,
    customer_id: params.customerId ?? null,
    conversation_id: params.conversationId ?? null,
    lead_id: params.leadId ?? null,
    event_type: "email",
    direction: "outbound",
    subject: params.subject,
    body: params.body,
    unread: false,
    metadata: {
      sandbox_simulated: true,
      to: params.to,
      body_html: params.bodyHtml ?? undefined,
      provider: "sandbox",
      attachment_count: params.attachmentCount ?? 0,
      attachment_names: params.attachmentNames ?? [],
    },
  })

  let inboundReplyAt: string | undefined
  if (params.customerId) {
    const replies = [
      "Thanks for reaching out! What times work for an estimate this week?",
      "Got it — we'll be home after 3pm most days.",
      "Sounds good. Can you send the estimate when ready?",
      "Yes, please schedule us for the first opening you have.",
    ]
    const reply = replies[Math.floor(Math.random() * replies.length)]!
    inboundReplyAt = new Date(Date.now() + 4000).toISOString()
    await logCommunicationEvent(supabase, {
      user_id: params.userId,
      customer_id: params.customerId,
      conversation_id: params.conversationId ?? null,
      lead_id: params.leadId ?? null,
      event_type: "email",
      direction: "inbound",
      subject: `Re: ${params.subject}`,
      body: reply,
      unread: true,
      metadata: {
        sandbox_simulated: true,
        simulated_delay_ms: 4000,
        in_reply_to: eventId,
      },
    })
  }

  return { ok: true, simulated: true, eventId, inboundReplyAt }
}

export async function simulateSandboxOutboundSms(
  supabase: SupabaseClient,
  params: {
    userId: string
    customerId?: string | null
    conversationId?: string | null
    leadId?: string | null
    to: string
    body: string
  },
): Promise<{ ok: true; simulated: true; eventId: string | null }> {
  const eventId = await insertCommunicationEventReturningId(supabase, {
    user_id: params.userId,
    customer_id: params.customerId ?? null,
    conversation_id: params.conversationId ?? null,
    lead_id: params.leadId ?? null,
    event_type: "sms",
    direction: "outbound",
    body: params.body,
    unread: false,
    metadata: { sandbox_simulated: true, to: params.to, provider: "sandbox", auto_reply: true },
  })

  if (params.customerId) {
    const replies = ["Thanks!", "Ok sounds good", "👍", "Can you call me in 10 min?"]
    await logCommunicationEvent(supabase, {
      user_id: params.userId,
      customer_id: params.customerId,
      conversation_id: params.conversationId ?? null,
      lead_id: params.leadId ?? null,
      event_type: "sms",
      direction: "inbound",
      body: replies[Math.floor(Math.random() * replies.length)]!,
      unread: true,
      metadata: { sandbox_simulated: true, in_reply_to: eventId },
    })
  }

  return { ok: true, simulated: true, eventId }
}
