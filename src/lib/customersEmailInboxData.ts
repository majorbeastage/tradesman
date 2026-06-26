import { supabase } from "./supabase"
import { extractCommEventEmailAddresses } from "./communicationEmailAddresses"

export type EmailInboxEventRow = {
  id: string
  customer_id: string | null
  conversation_id: string | null
  subject: string | null
  body: string | null
  direction: string | null
  created_at: string | null
  metadata: Record<string, unknown> | null
  customers?: {
    display_name: string | null
    customer_identifiers?: { type: string; value: string }[] | null
  } | null
}

export type EmailInboxFolder = "inbox" | "sent" | "all"

export type EmailInboxThread = {
  threadKey: string
  customerId: string | null
  conversationId: string | null
  customerName: string
  customerEmail: string | null
  subject: string
  preview: string
  latestAt: string
  latestDirection: string | null
  messageCount: number
  events: EmailInboxEventRow[]
}

const EVENT_SELECT = `
  id,
  customer_id,
  conversation_id,
  subject,
  body,
  direction,
  created_at,
  metadata,
  customers (
    display_name,
    customer_identifiers ( type, value )
  )
`

export function normalizeEmailSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/^(re|fwd|fw):\s*/gi, "")
    .trim()
    .toLowerCase()
}

export function threadKeyForEmailEvent(ev: EmailInboxEventRow): string {
  if (ev.conversation_id) return `convo:${ev.conversation_id}`
  const subj = normalizeEmailSubject(ev.subject)
  if (ev.customer_id && subj) return `cust:${ev.customer_id}:${subj}`
  if (ev.customer_id) return `cust:${ev.customer_id}`
  return `solo:${ev.id}`
}

export function customerEmailFromRow(ev: EmailInboxEventRow): string | null {
  const fromIds =
    ev.customers?.customer_identifiers?.find((i) => i.type === "email" && i.value?.trim())?.value?.trim() ?? null
  if (fromIds) return fromIds
  const meta = extractCommEventEmailAddresses(ev.metadata)
  if (ev.direction === "inbound") return meta.from
  if (meta.to.length) return meta.to[0] ?? null
  return meta.from
}

export function customerDisplayNameFromRow(ev: EmailInboxEventRow): string {
  const name = ev.customers?.display_name?.trim()
  if (name) return name
  const email = customerEmailFromRow(ev)
  if (email) return email
  return "Unknown contact"
}

export function emailBodyPreview(body: string | null | undefined, max = 120): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim()
  if (!text) return "(No message body)"
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function groupEmailEventsIntoThreads(events: EmailInboxEventRow[]): EmailInboxThread[] {
  const map = new Map<string, EmailInboxEventRow[]>()
  for (const ev of events) {
    const key = threadKeyForEmailEvent(ev)
    const list = map.get(key) ?? []
    list.push(ev)
    map.set(key, list)
  }

  const threads: EmailInboxThread[] = []
  for (const [threadKey, list] of map) {
    const sorted = [...list].sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))
    const latest = sorted[0]
    const oldestSubject =
      sorted.find((e) => e.subject?.trim())?.subject?.trim() ||
      latest.subject?.trim() ||
      "(No subject)"
    threads.push({
      threadKey,
      customerId: latest.customer_id,
      conversationId: latest.conversation_id,
      customerName: customerDisplayNameFromRow(latest),
      customerEmail: customerEmailFromRow(latest),
      subject: oldestSubject.replace(/^(re|fwd|fw):\s*/gi, "").trim() || "(No subject)",
      preview: emailBodyPreview(latest.body),
      latestAt: latest.created_at || new Date(0).toISOString(),
      latestDirection: latest.direction,
      messageCount: sorted.length,
      events: [...list].sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || "")),
    })
  }

  threads.sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt))
  return threads
}

export function filterThreadsByFolder(threads: EmailInboxThread[], folder: EmailInboxFolder): EmailInboxThread[] {
  if (folder === "all") return threads
  if (folder === "sent") {
    return threads.filter((t) => t.latestDirection === "outbound")
  }
  return threads.filter((t) => t.events.some((e) => e.direction === "inbound"))
}

export function filterThreadsBySearch(threads: EmailInboxThread[], query: string): EmailInboxThread[] {
  const q = query.trim().toLowerCase()
  if (!q) return threads
  return threads.filter((t) => {
    if (t.customerName.toLowerCase().includes(q)) return true
    if (t.customerEmail?.toLowerCase().includes(q)) return true
    if (t.subject.toLowerCase().includes(q)) return true
    if (t.preview.toLowerCase().includes(q)) return true
    return t.events.some((e) => (e.body ?? "").toLowerCase().includes(q) || (e.subject ?? "").toLowerCase().includes(q))
  })
}

export async function loadEmailInboxEvents(userId: string): Promise<EmailInboxEventRow[]> {
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from("communication_events")
    .select(EVENT_SELECT)
    .eq("user_id", userId)
    .eq("event_type", "email")
    .order("created_at", { ascending: false })
    .limit(600)

  if (error) {
    console.error("[customersEmailInbox]", error.message)
    return []
  }
  return (data ?? []).map((row) => {
    const raw = row as Record<string, unknown>
    let customers = raw.customers as EmailInboxEventRow["customers"]
    if (Array.isArray(customers)) customers = customers[0] ?? null
    return { ...raw, customers } as EmailInboxEventRow
  })
}

export async function resolveConversationIdForCustomer(userId: string, customerId: string): Promise<string | null> {
  if (!supabase || !userId || !customerId) return null
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
