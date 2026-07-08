/**
 * Scan communication_events + conversation messages for phone, email, address, and name;
 * fill empty customer profile fields (never overwrite existing values unless force).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, normalizePhone, samePhoneDigits } from "./_communications.js"
import { isPromotionalEmailAddress, mergeCustomerHubMetadata } from "./_customerContactKind.js"

/** Server-side Nominatim geocode (self-contained — no ../src imports for Vercel). */
async function geocodeAddressToLatLng(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim()
  if (!q) return null
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("format", "json")
    url.searchParams.set("limit", "1")
    url.searchParams.set("q", q)
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en",
        "User-Agent": "TradesmanApp/1.0 (contact gather; contact: support@tradesman-us.com)",
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>
    const row = data?.[0]
    if (!row?.lat || !row?.lon) return null
    const lat = Number.parseFloat(row.lat)
    const lng = Number.parseFloat(row.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

const CONTACT_GATHER_META_KEY = "contact_gather_v1"
const MAX_COMM_EVENTS = 500
const MAX_MESSAGES = 800
const CORPUS_LIMIT = 48_000

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\((?:\d{3})\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g
const ADDRESS_FULL_RE =
  /\b(\d{1,5}\s+[A-Za-z0-9.'#-]+(?:\s+(?:apt|apartment|unit|ste|suite|#)\s*[A-Za-z0-9-]+)?(?:\s+[A-Za-z0-9.'-]+){0,4},\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/gi
const ADDRESS_LABEL_RE =
  /(?:service address|job (?:site|location)|property (?:address|location)|address(?:\s+is)?|located at|meet (?:me )?at)[:\s]+([^\n]{8,120})/gi

const NOREPLY_RE = /(?:noreply|no-reply|donotreply|mailer-daemon|postmaster)/i
const GENERIC_NAME_RE = /^unknown\s*\(/i

export type GatheredContactSignals = {
  displayName: string | null
  phones: string[]
  emails: string[]
  serviceAddress: string | null
}

export type GatherCustomerContactResult = {
  ok: true
  updatedFields: string[]
  found: GatheredContactSignals
  corpusChars: number
  message: string
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isPlausibleCustomerEmail(email: string, blockDomains: Set<string>): boolean {
  const e = normalizeEmail(email)
  if (!e || e.length > 320 || NOREPLY_RE.test(e)) return false
  if (isPromotionalEmailAddress(e)) return false
  const domain = e.split("@")[1] ?? ""
  if (!domain || blockDomains.has(domain)) return false
  if (domain.endsWith(".tradesman-us.com")) return false
  return true
}

function phoneDigitsKey(phone: string): string {
  const d = phone.replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("1")) return d.slice(1)
  return d
}

function isBlockedPhone(phone: string, blocked: Set<string>): boolean {
  const key = phoneDigitsKey(phone)
  if (key.length < 10) return true
  for (const b of blocked) {
    if (samePhoneDigits(phone, b)) return true
  }
  return false
}

function extractEmailsFromText(text: string, blockDomains: Set<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = normalizeEmail(m[0] ?? "")
    if (!e || seen.has(e) || !isPlausibleCustomerEmail(e, blockDomains)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

function extractPhonesFromText(text: string, blocked: Set<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(PHONE_RE)) {
    const raw = m[0] ?? ""
    const norm = normalizePhone(raw)
    const key = phoneDigitsKey(norm)
    if (!key || key.length < 10 || seen.has(key) || isBlockedPhone(norm, blocked)) continue
    seen.add(key)
    out.push(norm)
  }
  return out
}

function extractAddressesFromText(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(ADDRESS_FULL_RE)) {
    const addr = (m[1] ?? "").trim().replace(/\s+/g, " ")
    const key = addr.toLowerCase()
    if (addr.length < 12 || seen.has(key)) continue
    seen.add(key)
    out.push(addr)
  }
  for (const m of text.matchAll(ADDRESS_LABEL_RE)) {
    let addr = (m[1] ?? "").trim().replace(/\s+/g, " ")
    addr = addr.replace(/[.!?]+$/, "").trim()
    const full = addr.match(ADDRESS_FULL_RE)
    if (full?.[1]) addr = full[1].trim()
    const key = addr.toLowerCase()
    if (addr.length < 12 || seen.has(key)) continue
    if (!/\d{5}/.test(addr) && !/\b[A-Z]{2}\b/.test(addr)) continue
    seen.add(key)
    out.push(addr)
  }
  return out
}

function extractNameFromText(text: string): string | null {
  const patterns = [
    /\b(?:my name is|this is|i'?m|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,3})/,
    /\b(?:call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,2})/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    const name = m?.[1]?.trim()
    if (name && name.length >= 2 && name.length <= 80) return name
  }
  return null
}

function screeningAnswersToText(meta: Record<string, unknown>): string {
  if (!Array.isArray(meta.screening_answers)) return ""
  return (meta.screening_answers as { question?: string; answer?: string }[])
    .map((a) => `${a.question ?? "Question"}: ${a.answer ?? ""}`)
    .join("\n")
}

function eventChunk(row: {
  direction?: string | null
  event_type?: string | null
  subject?: string | null
  body?: string | null
  transcript_text?: string | null
  summary_text?: string | null
  metadata?: unknown
}): string {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  const parts: string[] = []
  if (typeof row.subject === "string" && row.subject.trim()) parts.push(row.subject.trim())
  if (typeof row.transcript_text === "string" && row.transcript_text.trim()) parts.push(row.transcript_text.trim())
  else {
    const qa = screeningAnswersToText(meta)
    if (qa) parts.push(qa)
  }
  if (typeof row.body === "string" && row.body.trim()) parts.push(row.body.trim())
  if (typeof row.summary_text === "string" && row.summary_text.trim()) parts.push(row.summary_text.trim())
  const dir = String(row.direction ?? "").toLowerCase()
  const isInbound = dir === "inbound" || dir === "in"
  if (row.event_type === "email" && isInbound) {
    const from = meta.from ?? meta.from_email ?? meta.sender
    if (typeof from === "string" && from.trim()) parts.push(`From: ${from.trim()}`)
  }
  return parts.join("\n")
}

async function loadBlockedContactValues(supabase: SupabaseClient, userId: string): Promise<{
  phones: Set<string>
  emailDomains: Set<string>
}> {
  const phones = new Set<string>()
  const emailDomains = new Set<string>()
  const { data: channels } = await supabase
    .from("client_communication_channels")
    .select("public_address")
    .eq("user_id", userId)
  for (const ch of channels ?? []) {
    const addr = String((ch as { public_address?: string }).public_address ?? "").trim()
    if (!addr) continue
    if (addr.includes("@")) {
      const dom = addr.split("@")[1]?.toLowerCase()
      if (dom) emailDomains.add(dom)
    } else {
      phones.add(normalizePhone(addr))
    }
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("primary_phone, best_contact_phone, email, website_url")
    .eq("id", userId)
    .maybeSingle()
  if (prof) {
    const p = prof as { primary_phone?: string; best_contact_phone?: string; email?: string; website_url?: string }
    if (p.primary_phone) phones.add(normalizePhone(p.primary_phone))
    if (p.best_contact_phone) phones.add(normalizePhone(p.best_contact_phone))
    if (p.email?.includes("@")) emailDomains.add(p.email.split("@")[1]!.toLowerCase())
    if (p.website_url) {
      try {
        const host = new URL(p.website_url.startsWith("http") ? p.website_url : `https://${p.website_url}`).hostname
        if (host) emailDomains.add(host.replace(/^www\./, ""))
      } catch {
        /* ignore */
      }
    }
  }
  return { phones, emailDomains }
}

async function buildCustomerContactCorpus(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<string> {
  const chunks: string[] = []
  const evSelect =
    "id, direction, event_type, subject, body, transcript_text, summary_text, metadata, conversation_id, created_at"

  const { data: events } = await supabase
    .from("communication_events")
    .select(evSelect)
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true })
    .limit(MAX_COMM_EVENTS)

  const convoIds = new Set<string>()
  for (const ev of events ?? []) {
    const direction = String((ev as { direction?: string | null }).direction ?? "").toLowerCase()
    if (direction === "outbound" || direction === "out") continue
    const text = eventChunk(ev as Parameters<typeof eventChunk>[0])
    if (text.trim()) chunks.push(text)
    const cid = (ev as { conversation_id?: string | null }).conversation_id
    if (cid) convoIds.add(cid)
  }

  const { data: convos } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .limit(50)
  for (const c of convos ?? []) {
    if ((c as { id?: string }).id) convoIds.add((c as { id: string }).id)
  }

  const convoList = [...convoIds]
  if (convoList.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender, content, created_at")
      .in("conversation_id", convoList)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES)
    for (const m of msgs ?? []) {
      const sender = String((m as { sender?: string }).sender ?? "").toLowerCase()
      if (sender && sender !== "customer") continue
      const content = String((m as { content?: string }).content ?? "").trim()
      if (content) chunks.push(content)
    }
  }

  return chunks.join("\n\n---\n\n").slice(0, CORPUS_LIMIT)
}

function pickBestPhone(candidates: string[]): string | null {
  if (!candidates.length) return null
  const counts = new Map<string, number>()
  for (const p of candidates) {
    const k = phoneDigitsKey(p)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...candidates].sort((a, b) => (counts.get(phoneDigitsKey(b)) ?? 0) - (counts.get(phoneDigitsKey(a)) ?? 0))[0] ?? null
}

function pickBestAddress(candidates: string[]): string | null {
  if (!candidates.length) return null
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null
}

function extractContactSignalsFromCorpus(corpus: string, blocked: { phones: Set<string>; emailDomains: Set<string> }): GatheredContactSignals {
  const emails = extractEmailsFromText(corpus, blocked.emailDomains)
  const phones = extractPhonesFromText(corpus, blocked.phones)
  const addresses = extractAddressesFromText(corpus)
  const displayName = extractNameFromText(corpus)
  return {
    displayName,
    phones,
    emails,
    serviceAddress: pickBestAddress(addresses),
  }
}

async function aiExtractContactSignals(corpus: string): Promise<Partial<GatheredContactSignals> | null> {
  const key = firstEnv("OPENAI_API_KEY")
  if (!key || corpus.trim().length < 40) return null
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'Extract customer contact details from contractor conversation history. Reply with one JSON object only: displayName (string or empty), phone (string digits, US if possible, or empty), email (string or empty), serviceAddress (full US mailing address or empty). Only include values clearly stated by the customer. Do not invent data.',
          },
          { role: "user", content: corpus.slice(0, 12_000) },
        ],
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    })
    const raw = await res.text()
    if (!res.ok) return null
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const content = j.choices?.[0]?.message?.content?.trim()
    if (!content) return null
    const parsed = JSON.parse(content) as Record<string, unknown>
    const phone = normalizePhone(String(parsed.phone ?? ""))
    const email = normalizeEmail(String(parsed.email ?? ""))
    const serviceAddress = String(parsed.serviceAddress ?? "").trim()
    const displayName = String(parsed.displayName ?? "").trim()
    return {
      displayName: displayName || null,
      phones: phone && phoneDigitsKey(phone).length >= 10 ? [phone] : [],
      emails: email && email.includes("@") ? [email] : [],
      serviceAddress: serviceAddress.length >= 12 ? serviceAddress : null,
    }
  } catch {
    return null
  }
}

function mergeSignals(base: GatheredContactSignals, extra: Partial<GatheredContactSignals> | null): GatheredContactSignals {
  if (!extra) return base
  return {
    displayName: base.displayName || extra.displayName || null,
    phones: [...new Set([...base.phones, ...(extra.phones ?? [])])],
    emails: [...new Set([...base.emails, ...(extra.emails ?? [])])],
    serviceAddress: base.serviceAddress || extra.serviceAddress || null,
  }
}

async function applyGatheredContactToCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  signals: GatheredContactSignals,
  opts: { force?: boolean; source: string },
): Promise<string[]> {
  const updated: string[] = []
  const { data: cust } = await supabase
    .from("customers")
    .select("display_name, service_address, service_lat, service_lng, metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!cust) return updated

  const { data: idents } = await supabase
    .from("customer_identifiers")
    .select("type, value")
    .eq("user_id", userId)
    .eq("customer_id", customerId)

  const rows = (idents ?? []) as { type: string; value: string }[]
  const hasPrimaryPhone = rows.some((r) => r.type === "phone" && r.value.trim())
  const hasPrimaryEmail = rows.some((r) => r.type === "email" && r.value.trim())
  const existingPhones = new Set(rows.filter((r) => r.type === "phone" || r.type === "additional_phone").map((r) => phoneDigitsKey(r.value)))
  const existingEmails = new Set(
    rows.filter((r) => r.type === "email" || r.type === "additional_email").map((r) => normalizeEmail(r.value)),
  )

  const displayName = String(cust.display_name ?? "").trim()
  const nameMissing = !displayName || GENERIC_NAME_RE.test(displayName)
  if (signals.displayName && (opts.force || nameMissing)) {
    await supabase.from("customers").update({ display_name: signals.displayName }).eq("id", customerId).eq("user_id", userId)
    updated.push("name")
  }

  const addrMissing = !String(cust.service_address ?? "").trim()
  if (signals.serviceAddress && (opts.force || addrMissing)) {
    let lat: number | null = typeof cust.service_lat === "number" ? cust.service_lat : null
    let lng: number | null = typeof cust.service_lng === "number" ? cust.service_lng : null
    try {
      const coords = await geocodeAddressToLatLng(signals.serviceAddress)
      if (coords) {
        lat = coords.lat
        lng = coords.lng
      }
    } catch {
      /* optional */
    }
    await supabase
      .from("customers")
      .update({
        service_address: signals.serviceAddress,
        ...(lat != null && lng != null ? { service_lat: lat, service_lng: lng } : {}),
      })
      .eq("id", customerId)
      .eq("user_id", userId)
    updated.push("service address")
  }

  const bestPhone = pickBestPhone(signals.phones)
  if (bestPhone) {
    const key = phoneDigitsKey(bestPhone)
    if (!existingPhones.has(key)) {
      const type = hasPrimaryPhone ? "additional_phone" : "phone"
      await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: customerId,
        type,
        value: bestPhone,
        is_primary: type === "phone",
        verified: false,
      })
      updated.push(type === "phone" ? "phone" : "additional phone")
      existingPhones.add(key)
    }
  }

  let primaryEmailFilled = hasPrimaryEmail
  for (const email of signals.emails) {
    if (existingEmails.has(email)) continue
    if (!primaryEmailFilled) {
      await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: customerId,
        type: "email",
        value: email,
        is_primary: true,
        verified: false,
      })
      updated.push("email")
      primaryEmailFilled = true
    } else {
      await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: customerId,
        type: "additional_email",
        value: email,
        is_primary: false,
        verified: false,
      })
      updated.push("additional email")
    }
    existingEmails.add(email)
  }

  let meta =
    cust.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
      ? { ...(cust.metadata as Record<string, unknown>) }
      : {}
  meta[CONTACT_GATHER_META_KEY] = {
    at: new Date().toISOString(),
    source: opts.source,
    updated_fields: updated,
  }
  meta = mergeCustomerHubMetadata(meta, { hubKind: "customer" })
  await supabase.from("customers").update({ metadata: meta, last_activity_at: new Date().toISOString() }).eq("id", customerId).eq("user_id", userId)

  return updated
}

/** Scan full conversation history and fill missing customer contact fields. */
export async function gatherAndApplyCustomerContactFromHistory(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  opts?: { force?: boolean; source?: string; supplementalText?: string },
): Promise<GatherCustomerContactResult> {
  const blocked = await loadBlockedContactValues(supabase, userId)
  let corpus = await buildCustomerContactCorpus(supabase, userId, customerId)
  const extra = opts?.supplementalText?.trim()
  if (extra) corpus = `${corpus}\n\n---\n\n${extra}`.slice(0, CORPUS_LIMIT)

  let signals = extractContactSignalsFromCorpus(corpus, blocked)
  const needsAi =
    !signals.serviceAddress ||
    signals.phones.length === 0 ||
    signals.emails.length === 0 ||
    !signals.displayName
  if (needsAi && corpus.trim().length >= 40) {
    const ai = await aiExtractContactSignals(corpus)
    signals = mergeSignals(signals, ai)
    signals.phones = signals.phones.filter((p) => !isBlockedPhone(p, blocked.phones))
    signals.emails = signals.emails.filter((e) => isPlausibleCustomerEmail(e, blocked.emailDomains))
  }

  const updatedFields = await applyGatheredContactToCustomer(supabase, userId, customerId, signals, {
    force: opts?.force === true,
    source: opts?.source ?? "history_scan",
  })

  const message =
    updatedFields.length > 0
      ? `Updated: ${updatedFields.join(", ")}.`
      : "No new contact details found in conversation history."

  return {
    ok: true,
    updatedFields,
    found: signals,
    corpusChars: corpus.length,
    message,
  }
}
