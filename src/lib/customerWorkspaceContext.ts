/**
 * Cross-module customer context for Estimates, Scheduling, etc.
 * Scoped to one user_id — never mixes data across tenants.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { customerEmailFromIdentifiers, customerPhoneFromIdentifiers } from "./customerIdentifiers"
import { formatCustomerNotesForAiPack } from "./customerNotesForAi"

export type CustomerWorkspaceContext = {
  customerId: string
  displayName: string
  phone: string
  email: string
  serviceAddress: string
  serviceLat: number | null
  serviceLng: number | null
  jobDetailsText: string
  conversationPack: string
  suggestedTitle: string
  primaryConversationId: string | null
}

function quoteJobDetails(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return ""
  const jd = (meta as Record<string, unknown>).job_details
  return typeof jd === "string" ? jd.trim() : ""
}

function buildConversationPack(
  messages: Array<{ sender?: string | null; content?: string | null; created_at?: string | null }>,
  events: Array<{
    event_type?: string | null
    direction?: string | null
    subject?: string | null
    body?: string | null
    created_at?: string | null
  }>,
): string {
  const lines: string[] = []
  for (const m of messages.slice(-40)) {
    const who = String(m.sender ?? "message").trim()
    const body = String(m.content ?? "").trim()
    if (body) lines.push(`${who}: ${body}`)
  }
  for (const ev of events.slice(-25)) {
    const subject = ev.subject?.trim() ? `Subject: ${ev.subject.trim()}` : ""
    const body = String(ev.body ?? "").trim().slice(0, 2000)
    const head = `${String(ev.event_type ?? "event")} (${String(ev.direction ?? "")})`
    lines.push(`${head}: ${subject}${subject && body ? " — " : ""}${body}`)
  }
  return lines.join("\n").trim().slice(0, 12000)
}

/** Load customer + recent activity for intelligent estimate/scheduling prefill. */
export async function fetchCustomerWorkspaceContext(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<CustomerWorkspaceContext | null> {
  const cid = customerId.trim()
  if (!cid || !userId.trim()) return null

  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .select(
      `
      id,
      display_name,
      service_address,
      service_lat,
      service_lng,
      notes,
      notes_past,
      customer_identifiers ( type, value )
    `,
    )
    .eq("user_id", userId)
    .eq("id", cid)
    .maybeSingle()

  if (custErr || !cust) return null

  const idents = (cust as { customer_identifiers?: { type: string; value: string }[] | null }).customer_identifiers
  const displayName = String((cust as { display_name?: string | null }).display_name ?? "").trim()
  const phone = customerPhoneFromIdentifiers(idents)
  const email = customerEmailFromIdentifiers(idents)
  const serviceAddress = String((cust as { service_address?: string | null }).service_address ?? "").trim()
  const latRaw = (cust as { service_lat?: number | null }).service_lat
  const lngRaw = (cust as { service_lng?: number | null }).service_lng
  const serviceLat = latRaw != null && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null
  const serviceLng = lngRaw != null && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null
  const customerNotesPack = formatCustomerNotesForAiPack({
    notes: (cust as { notes?: string | null }).notes,
    notes_past: (cust as { notes_past?: unknown }).notes_past,
  })

  const [{ data: leads }, { data: quotes }, { data: convos }] = await Promise.all([
    supabase
      .from("leads")
      .select("title, description, updated_at")
      .eq("user_id", userId)
      .eq("customer_id", cid)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("quotes")
      .select("metadata, updated_at")
      .eq("user_id", userId)
      .eq("customer_id", cid)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("conversations")
      .select("id, updated_at")
      .eq("user_id", userId)
      .eq("customer_id", cid)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(3),
  ])

  let jobDetailsText = ""
  for (const q of quotes ?? []) {
    const jd = quoteJobDetails((q as { metadata?: unknown }).metadata)
    if (jd) {
      jobDetailsText = jd
      break
    }
  }
  if (!jobDetailsText) {
    const lead = (leads ?? []).find((l) => {
      const d = String((l as { description?: string | null }).description ?? "").trim()
      const t = String((l as { title?: string | null }).title ?? "").trim()
      return Boolean(d || t)
    }) as { title?: string | null; description?: string | null } | undefined
    if (lead) {
      const t = String(lead.title ?? "").trim()
      const d = String(lead.description ?? "").trim()
      jobDetailsText = [t, d].filter(Boolean).join("\n\n")
    }
  }

  const primaryConversationId =
    (convos?.[0] as { id?: string } | undefined)?.id?.trim() || null

  let messages: Array<{ sender?: string | null; content?: string | null; created_at?: string | null }> = []
  const convoIds = (convos ?? []).map((c) => (c as { id: string }).id).filter(Boolean)
  if (convoIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender, content, created_at")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: true })
      .limit(80)
    messages = msgs ?? []
  }

  const { data: events } = await supabase
    .from("communication_events")
    .select("event_type, direction, subject, body, created_at")
    .eq("user_id", userId)
    .eq("customer_id", cid)
    .order("created_at", { ascending: true })
    .limit(60)

  const conversationPack = [
    customerNotesPack ? `Customer notes:\n${customerNotesPack}` : "",
    buildConversationPack(messages, events ?? []),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim()
    .slice(0, 12000)
  const leadTitle = String((leads?.[0] as { title?: string | null } | undefined)?.title ?? "").trim()
  const suggestedTitle = leadTitle || (displayName ? `Estimate — ${displayName}` : "Estimate")

  return {
    customerId: cid,
    displayName,
    phone,
    email,
    serviceAddress,
    serviceLat,
    serviceLng,
    jobDetailsText,
    conversationPack,
    suggestedTitle,
    primaryConversationId,
  }
}
