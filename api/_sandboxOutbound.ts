import type { SupabaseClient } from "@supabase/supabase-js"
import { insertCommunicationEventReturningId, logCommunicationEvent } from "./_communications.js"
import { buildSandboxCustomerSmsReply, enrichSandboxFromSimulatedInbound } from "./_sandboxCustomerSimulation.js"

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
    const { data: cust } = await supabase
      .from("customers")
      .select("display_name, service_address, metadata")
      .eq("id", params.customerId)
      .maybeSingle()
    let leadTitle = ""
    let leadDescription = ""
    if (params.leadId) {
      const { data: lead } = await supabase.from("leads").select("title, description").eq("id", params.leadId).maybeSingle()
      leadTitle = (lead?.title as string | null) ?? ""
      leadDescription = (lead?.description as string | null) ?? ""
    }
    const meta =
      cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
        ? (cust.metadata as Record<string, unknown>)
        : {}
    const reply = buildSandboxCustomerSmsReply({
      outboundBody: params.body,
      customerName: cust?.display_name,
      leadDescription,
      leadTitle,
      serviceAddress:
        (cust?.service_address as string | null) ??
        (typeof meta.service_address === "string" ? meta.service_address : null),
    }).replace(/\n/g, " ")
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
    await enrichSandboxFromSimulatedInbound(supabase, {
      userId: params.userId,
      customerId: params.customerId,
      leadId: params.leadId,
      inboundBody: reply,
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
    const { data: cust } = await supabase
      .from("customers")
      .select("display_name, service_address, metadata")
      .eq("id", params.customerId)
      .maybeSingle()
    let leadTitle = ""
    let leadDescription = ""
    if (params.leadId) {
      const { data: lead } = await supabase.from("leads").select("title, description, metadata").eq("id", params.leadId).maybeSingle()
      leadTitle = (lead?.title as string | null) ?? ""
      leadDescription = (lead?.description as string | null) ?? ""
      const leadMeta =
        lead?.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
          ? (lead.metadata as Record<string, unknown>)
          : {}
      if (typeof leadMeta.capture_channel === "string") {
        leadDescription = leadDescription || leadTitle
      }
    }
    const meta =
      cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
        ? (cust.metadata as Record<string, unknown>)
        : {}
    const reply = buildSandboxCustomerSmsReply({
      outboundBody: params.body,
      customerName: cust?.display_name,
      leadDescription,
      leadTitle,
      serviceAddress:
        (cust?.service_address as string | null) ??
        (typeof meta.service_address === "string" ? meta.service_address : null),
    })
    await logCommunicationEvent(supabase, {
      user_id: params.userId,
      customer_id: params.customerId,
      conversation_id: params.conversationId ?? null,
      lead_id: params.leadId ?? null,
      event_type: "sms",
      direction: "inbound",
      body: reply,
      unread: true,
      metadata: { sandbox_simulated: true, in_reply_to: eventId, customer_simulated: true },
    })
    await enrichSandboxFromSimulatedInbound(supabase, {
      userId: params.userId,
      customerId: params.customerId,
      leadId: params.leadId,
      inboundBody: reply,
    })
  }

  return { ok: true, simulated: true, eventId }
}
