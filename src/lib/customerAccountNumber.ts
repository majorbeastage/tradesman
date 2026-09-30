import type { SupabaseClient } from "@supabase/supabase-js"
import { bumpDocumentNumberMeta, formatDocumentNumber, parseDocumentNumberSettings } from "./documentNumberFormat"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

export function readCustomerAccountNumber(metadata: unknown): string {
  const meta = asMeta(metadata)
  return typeof meta.account_number === "string" ? meta.account_number.trim() : ""
}

/** Assign the next account number when numbering is on and this customer does not have one yet. */
export async function ensureCustomerAccountNumber(
  client: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<string | null> {
  const cid = customerId.trim()
  const uid = userId.trim()
  if (!cid || !uid) return null
  const { data: prof, error: profErr } = await client.from("profiles").select("metadata").eq("id", uid).maybeSingle()
  if (profErr) throw profErr
  const profileMeta = asMeta(prof?.metadata)
  const settings = parseDocumentNumberSettings(profileMeta, "account")
  if (settings.enabled !== true) return null

  const { data: cust, error: custErr } = await client.from("customers").select("metadata").eq("id", cid).maybeSingle()
  if (custErr) throw custErr
  const customerMeta = asMeta(cust?.metadata)
  const existing = readCustomerAccountNumber(customerMeta)
  if (existing) return existing

  const number = formatDocumentNumber(settings)
  const { error: custUpErr } = await client
    .from("customers")
    .update({ metadata: { ...customerMeta, account_number: number } })
    .eq("id", cid)
  if (custUpErr) throw custUpErr
  const bumped = bumpDocumentNumberMeta(profileMeta, "account", settings.nextSequence)
  const { error: profUpErr } = await client.from("profiles").update({ metadata: bumped }).eq("id", uid)
  if (profUpErr) throw profUpErr
  return number
}
