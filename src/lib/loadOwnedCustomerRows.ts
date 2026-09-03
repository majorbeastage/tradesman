import type { SupabaseClient } from "@supabase/supabase-js"
import { forceRefreshAccessToken } from "./authPlatformApi"
import { formatAppError, isAuthSessionError, isStatementTimeoutError, sessionExpiredError } from "./formatAppError"

const PAGE = 50
const IDENT_PAGE = 200
const RELATED_PAGE = 400
const MAX_ROWS = 20_000

export const CUSTOMER_HUB_SELECT_FULL = `
        id,
        display_name,
        created_at,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        communication_urgency,
        last_activity_at,
        fit_classification,
        fit_confidence,
        fit_reason,
        fit_source,
        fit_manually_overridden,
        fit_evaluated_at,
        metadata
      `

export const CUSTOMER_HUB_SELECT_NO_FIT = `
        id,
        display_name,
        created_at,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        communication_urgency,
        last_activity_at,
        metadata
      `

export const CUSTOMER_HUB_SELECT_NO_URGENCY = `
        id,
        display_name,
        created_at,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        last_activity_at,
        metadata
      `

export const CUSTOMER_HUB_SELECT_LEGACY = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng
      `

export const CUSTOMER_HUB_SELECT_PLAIN = `
        id,
        display_name,
        updated_at,
        service_address
      `

const SELECTS = [
  CUSTOMER_HUB_SELECT_FULL,
  CUSTOMER_HUB_SELECT_NO_FIT,
  CUSTOMER_HUB_SELECT_NO_URGENCY,
  CUSTOMER_HUB_SELECT_LEGACY,
  CUSTOMER_HUB_SELECT_PLAIN,
]

export type OwnedCustomerLoadResult = {
  rows: Record<string, unknown>[]
  hint: string
}

function errorText(err: unknown): string {
  return formatAppError(err).toLowerCase()
}

function pickNextSelect(current: string, err: unknown): string | null {
  const msg = errorText(err)
  const idx = SELECTS.indexOf(current)
  if (isStatementTimeoutError(err)) return null
  if (msg.includes("fit_")) return CUSTOMER_HUB_SELECT_NO_FIT
  if (msg.includes("communication_urgency")) return CUSTOMER_HUB_SELECT_NO_URGENCY
  if (msg.includes("metadata")) return SELECTS[Math.min(idx + 1, SELECTS.length - 1)] ?? CUSTOMER_HUB_SELECT_PLAIN
  if (msg.includes("best_contact") || msg.includes("job_pipeline") || msg.includes("last_activity") || msg.includes("customer_identifiers")) {
    return CUSTOMER_HUB_SELECT_PLAIN
  }
  if (idx >= 0 && idx < SELECTS.length - 1) return SELECTS[idx + 1]
  return null
}

function hintForSelect(select: string): string {
  if (select === CUSTOMER_HUB_SELECT_NO_FIT) return "Run supabase/customers-lead-fit.sql to enable Lead score on customers."
  if (select === CUSTOMER_HUB_SELECT_NO_URGENCY) return "Run supabase/customers-communication-urgency.sql to enable the Urgency column."
  if (select === CUSTOMER_HUB_SELECT_LEGACY) return "Run supabase/customers-pipeline-columns.sql to enable Best contact, Job status, and Last update columns."
  if (select === CUSTOMER_HUB_SELECT_PLAIN) return "Customer contact details may be limited until identifier access is restored."
  return ""
}

function asRows(data: unknown): Record<string, unknown>[] | null {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : null
}

async function pageCustomers(
  client: SupabaseClient,
  ownerUserId: string,
  select: string,
  from: number,
): Promise<{ data: Record<string, unknown>[] | null; error: unknown | null }> {
  const to = from + PAGE - 1
  const byUpdated = await client
    .from("customers")
    .select(select)
    .eq("user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .range(from, to)
  if (!byUpdated.error) {
    return { data: asRows(byUpdated.data), error: null }
  }
  const msg = errorText(byUpdated.error)
  if (!msg.includes("updated_at")) {
    return { data: asRows(byUpdated.data), error: byUpdated.error }
  }
  const byName = await client
    .from("customers")
    .select(select)
    .eq("user_id", ownerUserId)
    .order("display_name", { ascending: true })
    .range(from, to)
  return { data: asRows(byName.data), error: byName.error ?? null }
}

async function loadIdentifiersByOwner(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<Map<string, Array<{ type: string; value: string }>>> {
  const map = new Map<string, Array<{ type: string; value: string }>>()
  let from = 0
  while (from < MAX_ROWS) {
    const { data, error } = await client
      .from("customer_identifiers")
      .select("customer_id, type, value")
      .eq("user_id", ownerUserId)
      .range(from, from + IDENT_PAGE - 1)
    if (error) break
    const chunk = asRows(data) ?? []
    for (const row of chunk) {
      const customerId = typeof row.customer_id === "string" ? row.customer_id : ""
      const type = typeof row.type === "string" ? row.type : ""
      const value = typeof row.value === "string" ? row.value : ""
      if (!customerId || !type) continue
      const list = map.get(customerId) ?? []
      list.push({ type, value })
      map.set(customerId, list)
    }
    if (chunk.length < IDENT_PAGE) break
    from += IDENT_PAGE
  }
  return map
}

function attachIdentifiers(
  rows: Record<string, unknown>[],
  byCustomer: Map<string, Array<{ type: string; value: string }>>,
): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    customer_identifiers: byCustomer.get(String(row.id ?? "")) ?? [],
  }))
}

async function loadOwnedCustomerRowsViaApi(ownerUserId: string, accessToken: string): Promise<OwnedCustomerLoadResult> {
  const res = await fetch("/api/customers-hub", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ownerUserId }),
  })
  const json = (await res.json().catch(() => ({}))) as { rows?: unknown; error?: string }
  if (!res.ok) throw new Error(json.error || `Could not load customers (${res.status})`)
  const rows = Array.isArray(json.rows) ? (json.rows as Record<string, unknown>[]) : []
  return { rows, hint: "" }
}

/**
 * Load every customer owned by this account without a nested identifiers embed
 * (that join times out on large shops: Postgres 57014).
 */
export async function loadOwnedCustomerRows(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<OwnedCustomerLoadResult> {
  const owner = ownerUserId.trim()
  if (!owner) return { rows: [], hint: "" }

  const viaApi = async (): Promise<OwnedCustomerLoadResult> => {
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token?.trim() || ""
    if (!token) throw new Error("Could not load customers. Sign in again and retry.")
    return loadOwnedCustomerRowsViaApi(owner, token)
  }

  const run = async (): Promise<OwnedCustomerLoadResult> => {
    let select = CUSTOMER_HUB_SELECT_FULL
    let hint = ""
    const rows: Record<string, unknown>[] = []
    let from = 0
    while (from < MAX_ROWS) {
      let { data, error } = await pageCustomers(client, owner, select, from)
      while (error) {
        if (isAuthSessionError(error)) throw error
        if (isStatementTimeoutError(error)) return viaApi()
        const next = pickNextSelect(select, error)
        if (!next || next === select) throw new Error(formatAppError(error))
        select = next
        hint = hintForSelect(select)
        ;({ data, error } = await pageCustomers(client, owner, select, from))
      }
      const chunk = data ?? []
      rows.push(...chunk)
      if (chunk.length < PAGE) break
      from += PAGE
    }
    try {
      const idents = await loadIdentifiersByOwner(client, owner)
      return { rows: attachIdentifiers(rows, idents), hint }
    } catch (err) {
      if (isStatementTimeoutError(err)) return { rows: attachIdentifiers(rows, new Map()), hint }
      throw err
    }
  }

  try {
    return await run()
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      try {
        return await viaApi()
      } catch {
        throw new Error(formatAppError(err))
      }
    }
    if (!isAuthSessionError(err)) throw err instanceof Error ? err : new Error(formatAppError(err))
    const refreshed = await forceRefreshAccessToken(client)
    if (!refreshed) throw sessionExpiredError()
    try {
      return await run()
    } catch (retryErr) {
      if (isStatementTimeoutError(retryErr)) return viaApi()
      throw retryErr instanceof Error ? retryErr : new Error(formatAppError(retryErr))
    }
  }
}

/** Page customer_id values for hub bucketing. Timeouts return whatever was collected. */
export async function pageOwnerScopedCustomerIds(
  client: SupabaseClient,
  table: string,
  ownerUserId: string,
  isNullColumns: string[] = [],
): Promise<string[]> {
  const ids: string[] = []
  let from = 0
  while (from < MAX_ROWS) {
    let query = client.from(table).select("customer_id").eq("user_id", ownerUserId)
    for (const col of isNullColumns) query = query.is(col, null)
    const { data, error } = await query.range(from, from + RELATED_PAGE - 1)
    if (error) break
    const chunk = asRows(data) ?? []
    for (const row of chunk) {
      if (typeof row.customer_id === "string" && row.customer_id) ids.push(row.customer_id)
    }
    if (chunk.length < RELATED_PAGE) break
    from += RELATED_PAGE
  }
  return ids
}
