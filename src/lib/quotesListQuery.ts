import type { SupabaseClient } from "@supabase/supabase-js"

/** Busy accounts time out when Estimates nests customers → identifiers (and previously messages). */
export const QUOTES_LIST_LIMIT = 500
const QUOTES_LIST_TIMEOUT_LIMIT = 150
const IN_CHUNK = 80
const LIST_IDENTIFIER_TYPES = ["phone", "additional_phone"] as const

export type QuotesListIdentifier = { type: string; value: string }

export type QuotesListCustomer = {
  display_name: string | null
  archived_at?: string | null
  customer_identifiers: QuotesListIdentifier[] | null
}

export type QuotesListRow = {
  id: string
  status: string | null
  created_at?: string
  updated_at?: string
  customer_id: string | null
  conversation_id: string | null
  job_type_id?: string | null
  scheduled_at?: string | null
  removed_at?: string | null
  archived_at?: string | null
  customers: QuotesListCustomer | null
}

export function isQuotesListTimeoutError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase()
  return m.includes("canceling statement") || m.includes("statement timeout") || m.includes("timeout")
}

function missingColumn(message: string | undefined, col: string): boolean {
  const m = (message ?? "").toLowerCase()
  const c = col.toLowerCase()
  return m.includes(c) && (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"))
}

function uniqueIds(values: (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const id = typeof raw === "string" ? raw.trim() : ""
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

type QuoteSelectMode = {
  jobType: boolean
  archive: boolean
  scheduledRemoved: boolean
}

function quotesSelect(mode: QuoteSelectMode): string {
  const cols = ["id", "status", "created_at", "updated_at", "customer_id", "conversation_id"]
  if (mode.jobType) cols.push("job_type_id")
  if (mode.scheduledRemoved) cols.push("scheduled_at", "removed_at")
  if (mode.archive) cols.push("archived_at")
  return cols.join(", ")
}

type QuoteDbRow = {
  id: string
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  customer_id?: string | null
  conversation_id?: string | null
  job_type_id?: string | null
  scheduled_at?: string | null
  removed_at?: string | null
  archived_at?: string | null
}

function normalizeQuoteRows(rows: QuoteDbRow[], mode: QuoteSelectMode): QuotesListRow[] {
  return rows.map((q) => ({
    id: q.id,
    status: q.status ?? null,
    created_at: q.created_at ?? undefined,
    updated_at: q.updated_at ?? undefined,
    customer_id: q.customer_id ?? null,
    conversation_id: q.conversation_id ?? null,
    job_type_id: mode.jobType ? (q.job_type_id ?? null) : null,
    scheduled_at: mode.scheduledRemoved ? (q.scheduled_at ?? null) : null,
    removed_at: mode.scheduledRemoved ? (q.removed_at ?? null) : null,
    archived_at: mode.archive ? (q.archived_at ?? null) : null,
    customers: null,
  }))
}

export function attachQuoteListCustomers(
  quotes: QuotesListRow[],
  customers: { id: string; display_name: string | null; archived_at?: string | null }[],
  identifiers: { customer_id: string; type: string; value: string }[],
): QuotesListRow[] {
  const customerById = new Map(customers.map((c) => [c.id, c]))
  const identsByCustomer = new Map<string, QuotesListIdentifier[]>()
  for (const row of identifiers) {
    const cid = row.customer_id?.trim()
    if (!cid) continue
    const list = identsByCustomer.get(cid) ?? []
    list.push({ type: row.type, value: row.value })
    identsByCustomer.set(cid, list)
  }
  return quotes.map((q) => {
    const cid = q.customer_id?.trim()
    if (!cid) return { ...q, customers: null }
    const c = customerById.get(cid)
    return {
      ...q,
      customers: {
        display_name: c?.display_name ?? null,
        archived_at: c?.archived_at ?? null,
        customer_identifiers: identsByCustomer.get(cid) ?? [],
      },
    }
  })
}

async function fetchInIdChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    const { data, error } = await run(chunk)
    if (error) return { rows, error: error.message }
    if (data?.length) rows.push(...data)
  }
  return { rows, error: null }
}

async function fetchQuoteRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: QuotesListRow[]; error: string | null }> {
  let mode: QuoteSelectMode = { jobType: true, archive: true, scheduledRemoved: true }
  let limit = QUOTES_LIST_LIMIT

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let q = supabase
      .from("quotes")
      .select(quotesSelect(mode))
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit)
    if (mode.scheduledRemoved) {
      q = q.is("scheduled_at", null).is("removed_at", null)
    }
    const { data, error } = await q
    if (!error) {
      const raw = (data ?? []) as unknown as QuoteDbRow[]
      return { rows: normalizeQuoteRows(raw, mode), error: null }
    }

    const msg = error.message ?? ""
    if (mode.jobType && missingColumn(msg, "job_type_id")) {
      mode = { ...mode, jobType: false }
      continue
    }
    if (mode.archive && missingColumn(msg, "archived_at")) {
      mode = { ...mode, archive: false }
      continue
    }
    if (mode.scheduledRemoved && (missingColumn(msg, "scheduled_at") || missingColumn(msg, "removed_at") || msg.includes("scheduled_at") || msg.includes("removed_at"))) {
      mode = { ...mode, scheduledRemoved: false }
      continue
    }
    if (isQuotesListTimeoutError(msg) && limit > QUOTES_LIST_TIMEOUT_LIMIT) {
      limit = QUOTES_LIST_TIMEOUT_LIMIT
      continue
    }
    return { rows: [], error: msg }
  }

  return { rows: [], error: "Could not load estimates." }
}

async function fetchCustomersForQuotes(
  supabase: SupabaseClient,
  userId: string,
  customerIds: string[],
): Promise<{ rows: { id: string; display_name: string | null; archived_at?: string | null }[]; error: string | null }> {
  if (customerIds.length === 0) return { rows: [], error: null }

  const withArchive = await fetchInIdChunks<{ id: string; display_name: string | null; archived_at?: string | null }>(
    customerIds,
    (chunk) =>
      supabase
        .from("customers")
        .select("id, display_name, archived_at")
        .eq("user_id", userId)
        .in("id", chunk),
  )
  if (!withArchive.error) return withArchive
  if (!missingColumn(withArchive.error, "archived_at") && !isQuotesListTimeoutError(withArchive.error)) {
    return withArchive
  }

  return fetchInIdChunks<{ id: string; display_name: string | null; archived_at?: string | null }>(
    customerIds,
    (chunk) =>
      supabase
        .from("customers")
        .select("id, display_name")
        .eq("user_id", userId)
        .in("id", chunk),
  )
}

async function fetchPhonesForQuotes(
  supabase: SupabaseClient,
  userId: string,
  customerIds: string[],
): Promise<{ rows: { customer_id: string; type: string; value: string }[]; error: string | null }> {
  if (customerIds.length === 0) return { rows: [], error: null }
  return fetchInIdChunks<{ customer_id: string; type: string; value: string }>(customerIds, (chunk) =>
    supabase
      .from("customer_identifiers")
      .select("customer_id, type, value")
      .eq("user_id", userId)
      .in("customer_id", chunk)
      .in("type", [...LIST_IDENTIFIER_TYPES]),
  )
}

/**
 * Estimates workspace list: quote rows only, then batch-hydrate customer names and phones.
 * Nested PostgREST embeds (customers → identifiers, conversations → messages) time out on busy accounts.
 */
export async function loadQuotesList(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ quotes: QuotesListRow[]; error: string | null }> {
  const quoteRes = await fetchQuoteRows(supabase, userId)
  if (quoteRes.error) return { quotes: [], error: quoteRes.error }

  const customerIds = uniqueIds(quoteRes.rows.map((q) => q.customer_id))
  const [customerRes, phoneRes] = await Promise.all([
    fetchCustomersForQuotes(supabase, userId, customerIds),
    fetchPhonesForQuotes(supabase, userId, customerIds),
  ])

  const quotes = attachQuoteListCustomers(
    quoteRes.rows,
    customerRes.error ? [] : customerRes.rows,
    phoneRes.error ? [] : phoneRes.rows,
  )
  return { quotes, error: null }
}
