import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeCustomerEmail } from "./customerIdentifiers"
import {
  classifyInboundEmailContact,
  customerEmailMatchesHubKind,
  deriveOrgGroupKeyFromEmail,
  mergeCustomerHubMetadata,
  orgGroupKeysForEmail,
  parseSplitOrgEmails,
  type CustomerHubKind,
} from "./customerContactKind"

async function findCustomerIdByOrgGroupKeys(
  supabase: SupabaseClient,
  userId: string,
  orgGroupKeys: string[],
  hubKind: CustomerHubKind,
): Promise<string | null> {
  for (const orgGroupKey of orgGroupKeys) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .filter("metadata->>org_group_key", "eq", orgGroupKey)
      .filter("metadata->>customer_hub_kind", "eq", hubKind)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data?.id) return String(data.id)
  }
  return null
}

async function findCustomerIdByOrgEmailSibling(
  supabase: SupabaseClient,
  userId: string,
  normalizedEmail: string,
  hubKind: CustomerHubKind,
): Promise<string | null> {
  const orgRoot = deriveOrgGroupKeyFromEmail(normalizedEmail)
  if (!orgRoot) return null

  const { data, error } = await supabase
    .from("customer_identifiers")
    .select("customer_id, value, customers!inner(id, metadata, created_at)")
    .eq("user_id", userId)
    .eq("type", "email")

  if (error) throw error
  if (!data?.length) return null

  type Row = {
    customer_id: string
    value: string
    customers: { id: string; metadata: unknown; created_at: string } | Array<{ id: string; metadata: unknown; created_at: string }>
  }

  let best: { id: string; created_at: string } | null = null
  for (const row of data as Row[]) {
    const email = normalizeCustomerEmail(row.value)
    if (!email || email === normalizedEmail) continue
    if (deriveOrgGroupKeyFromEmail(email) !== orgRoot) continue
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers
    if (!cust) continue
    if (!customerEmailMatchesHubKind(email, cust.metadata, hubKind)) continue
    if (parseSplitOrgEmails(cust.metadata).includes(normalizedEmail)) continue
    const created = typeof cust.created_at === "string" ? cust.created_at : ""
    if (!best || created.localeCompare(best.created_at) < 0) {
      best = { id: String(row.customer_id), created_at: created }
    }
  }
  return best?.id ?? null
}

export async function applyCustomerHubClassification(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  email: string,
): Promise<void> {
  const normalizedEmail = normalizeCustomerEmail(email)
  if (!normalizedEmail) return
  const classification = classifyInboundEmailContact(normalizedEmail)
  const { data, error } = await supabase
    .from("customers")
    .select("metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) return
  const nextMeta = mergeCustomerHubMetadata(data.metadata, {
    hubKind: classification.hubKind,
    orgGroupKey: classification.orgGroupKey,
  })
  await supabase.from("customers").update({ metadata: nextMeta }).eq("id", customerId).eq("user_id", userId)
}

/** Find or create the Promotions hub customer for a system / noreply sender address. */
export async function ensurePromotionalCustomerForEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const normalizedEmail = normalizeCustomerEmail(email)
  if (!normalizedEmail) throw new Error("Email is required")

  const { data: existingIdentifier, error: identifierErr } = await supabase
    .from("customer_identifiers")
    .select("customer_id")
    .eq("user_id", userId)
    .eq("type", "email")
    .eq("value", normalizedEmail)
    .limit(1)
    .maybeSingle()
  if (identifierErr) throw identifierErr
  if (existingIdentifier?.customer_id) {
    const customerId = String(existingIdentifier.customer_id)
    await applyCustomerHubClassification(supabase, userId, customerId, normalizedEmail)
    return customerId
  }

  const classification = classifyInboundEmailContact(normalizedEmail)
  if (classification.orgGroupKey) {
    const keys = orgGroupKeysForEmail(normalizedEmail)
    const orgCustomerId =
      (await findCustomerIdByOrgGroupKeys(supabase, userId, keys, classification.hubKind)) ??
      (await findCustomerIdByOrgEmailSibling(supabase, userId, normalizedEmail, classification.hubKind))
    if (orgCustomerId) {
      const { data: primaryRow } = await supabase
        .from("customer_identifiers")
        .select("id")
        .eq("user_id", userId)
        .eq("customer_id", orgCustomerId)
        .eq("type", "email")
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle()
      await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: orgCustomerId,
        type: "email",
        value: normalizedEmail,
        is_primary: !primaryRow?.id,
        verified: false,
      })
      await applyCustomerHubClassification(supabase, userId, orgCustomerId, normalizedEmail)
      return orgCustomerId
    }
  }

  const metadata = mergeCustomerHubMetadata(null, {
    hubKind: classification.hubKind,
    orgGroupKey: classification.orgGroupKey,
  })
  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .insert({
      user_id: userId,
      display_name: classification.displayName,
      notes: null,
      metadata,
    })
    .select("id")
    .single()
  if (customerErr) throw customerErr

  const customerId = String(customer.id)
  await supabase.from("customer_identifiers").insert({
    user_id: userId,
    customer_id: customerId,
    type: "email",
    value: normalizedEmail,
    is_primary: true,
    verified: false,
  })
  return customerId
}

export async function setCustomerHubKind(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  hubKind: CustomerHubKind,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("customers")
    .select("metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) throw error ?? new Error("Customer not found")
  const nextMeta = mergeCustomerHubMetadata(data.metadata, { hubKind })
  const { error: upErr } = await supabase
    .from("customers")
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("user_id", userId)
  if (upErr) throw upErr
  return nextMeta
}

export async function reassignCommunicationEventToPromotions(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  fromEmail: string,
): Promise<{ customerId: string }> {
  const promoCustomerId = await ensurePromotionalCustomerForEmail(supabase, userId, fromEmail)
  const { error } = await supabase
    .from("communication_events")
    .update({ customer_id: promoCustomerId })
    .eq("id", eventId)
    .eq("user_id", userId)
  if (error) throw error
  return { customerId: promoCustomerId }
}
