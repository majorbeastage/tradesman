import type { SupabaseClient } from "@supabase/supabase-js"
import { forceRefreshAccessToken } from "./authPlatformApi"
import { formatAppError, isAuthSessionError, sessionExpiredError } from "./formatAppError"

const PAGE = 100
const MAX_ROWS = 20_000

export const CUSTOMER_HUB_SELECT_FULL = `
        id,
        display_name,
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
        metadata,
        customer_identifiers (
          type,
          value
        )
      `

export const CUSTOMER_HUB_SELECT_NO_FIT = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        communication_urgency,
        last_activity_at,
        metadata,
        customer_identifiers (
          type,
          value
        )
      `

export const CUSTOMER_HUB_SELECT_NO_URGENCY = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        last_activity_at,
        metadata,
        customer_identifiers (
          type,
          value
        )
      `

export const CUSTOMER_HUB_SELECT_LEGACY = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        customer_identifiers (
          type,
          value
        )
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

/**
 * Load every customer owned by this account without a giant `.in(id, …)` URL
 * (that request fails once a live shop has a few hundred customers).
 */
export async function loadOwnedCustomerRows(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<OwnedCustomerLoadResult> {
  const owner = ownerUserId.trim()
  if (!owner) return { rows: [], hint: "" }

  const run = async (): Promise<OwnedCustomerLoadResult> => {
    let select = CUSTOMER_HUB_SELECT_FULL
    let hint = ""
    const rows: Record<string, unknown>[] = []
    let from = 0
    while (from < MAX_ROWS) {
      let { data, error } = await pageCustomers(client, owner, select, from)
      while (error) {
        if (isAuthSessionError(error)) throw error
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
    return { rows, hint }
  }

  try {
    return await run()
  } catch (err) {
    if (!isAuthSessionError(err)) throw err instanceof Error ? err : new Error(formatAppError(err))
    const refreshed = await forceRefreshAccessToken(client)
    if (!refreshed) throw sessionExpiredError()
    return await run()
  }
}
