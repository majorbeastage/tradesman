import type { SupabaseClient } from "@supabase/supabase-js"
import {
  CUSTOMER_ORG_GROUP_META_KEY,
  mergeCustomerHubMetadata,
  normalizeCustomerEmail,
  parseEmailAddress,
  parseSplitOrgEmails,
} from "./customerContactKind"

/**
 * Move one email identifier from an org-grouped customer to its own customer record.
 * Future inbound mail to that address matches the new customer by exact identifier.
 */
export async function splitEmailToSeparateCustomer(
  supabase: SupabaseClient,
  userId: string,
  sourceCustomerId: string,
  rawEmail: string,
): Promise<{ newCustomerId: string }> {
  const email = normalizeCustomerEmail(rawEmail)
  if (!email) throw new Error("Email is required.")

  const { data: source, error: sourceErr } = await supabase
    .from("customers")
    .select("id, display_name, metadata")
    .eq("id", sourceCustomerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (sourceErr) throw sourceErr
  if (!source) throw new Error("Customer not found.")

  const { data: ident, error: identErr } = await supabase
    .from("customer_identifiers")
    .select("id, value, is_primary")
    .eq("user_id", userId)
    .eq("customer_id", sourceCustomerId)
    .eq("type", "email")
    .eq("value", email)
    .maybeSingle()
  if (identErr) throw identErr
  if (!ident?.id) throw new Error("That email is not on this customer.")

  const parsed = parseEmailAddress(email)
  const localPart = parsed?.local ?? email
  const displayName = localPart.includes(".")
    ? localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : localPart.charAt(0).toUpperCase() + localPart.slice(1)

  const sourceMeta =
    source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
      ? (source.metadata as Record<string, unknown>)
      : {}
  const splitList = [...new Set([...parseSplitOrgEmails(sourceMeta), email])]

  const { data: created, error: createErr } = await supabase
    .from("customers")
    .insert({
      user_id: userId,
      display_name: displayName || email,
      notes: null,
      metadata: {
        split_from_customer_id: sourceCustomerId,
        split_from_org_key:
          typeof sourceMeta[CUSTOMER_ORG_GROUP_META_KEY] === "string" ? sourceMeta[CUSTOMER_ORG_GROUP_META_KEY] : null,
      },
    })
    .select("id")
    .single()
  if (createErr) throw createErr
  const newCustomerId = String(created.id)

  const { error: delErr } = await supabase.from("customer_identifiers").delete().eq("id", ident.id)
  if (delErr) throw delErr

  const { error: insErr } = await supabase.from("customer_identifiers").insert({
    user_id: userId,
    customer_id: newCustomerId,
    type: "email",
    value: email,
    is_primary: true,
    verified: false,
  })
  if (insErr) throw insErr

  const { error: metaErr } = await supabase
    .from("customers")
    .update({
      metadata: mergeCustomerHubMetadata(sourceMeta, { splitOrgEmails: splitList }),
    })
    .eq("id", sourceCustomerId)
    .eq("user_id", userId)
  if (metaErr) throw metaErr

  return { newCustomerId }
}
