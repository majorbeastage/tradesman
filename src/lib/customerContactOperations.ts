import type { SupabaseClient } from "@supabase/supabase-js"
import {
  CUSTOMER_CONTACT_SEPARATED_META_KEY,
  CUSTOMER_ORG_GROUP_META_KEY,
  CUSTOMER_SPLIT_FROM_META_KEY,
  mergeCustomerHubMetadata,
  normalizeCustomerEmail,
  parseEmailAddress,
  parseSplitContactPhones,
  parseSplitOrgEmails,
} from "./customerContactKind"
import {
  customerEmailFromIdentifiers,
  customerEmailsFromIdentifiers,
  customerPhoneFromIdentifiers,
  customerPhonesFromIdentifiers,
  formatCustomerContactLine,
  normalizeCustomerEmail as normalizeEmailIdent,
} from "./customerIdentifiers"

export type CustomerMergeCandidate = {
  id: string
  display_name: string
  contactLine: string
}

export type SeparateContactsInput = {
  displayName?: string
  phones?: string[]
  emails?: string[]
}

function metaRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
}

function deriveSplitDisplayName(fallback: string | undefined, emails: string[], phones: string[]): string {
  if (fallback?.trim()) return fallback.trim()
  const email = emails[0]?.trim()
  if (email) {
    const parsed = parseEmailAddress(email)
    const localPart = parsed?.local ?? email
    if (localPart.includes(".")) {
      return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    }
    return localPart.charAt(0).toUpperCase() + localPart.slice(1)
  }
  const phone = phones[0]?.trim()
  if (phone) return `Contact (${phone})`
  return "New contact"
}

async function loadCustomerIdentifiers(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<{ id: string; type: string; value: string; is_primary?: boolean }[]> {
  const { data, error } = await supabase
    .from("customer_identifiers")
    .select("id, type, value, is_primary")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
  if (error) throw error
  return (data ?? []) as { id: string; type: string; value: string; is_primary?: boolean }[]
}

/**
 * Move selected phones/emails to a new customer. Updates split metadata so org grouping
 * and inbound routing do not re-converge these contacts.
 */
export async function separateCustomerContacts(
  supabase: SupabaseClient,
  userId: string,
  sourceCustomerId: string,
  input: SeparateContactsInput,
): Promise<{ newCustomerId: string }> {
  const phonesToMove = [...new Set((input.phones ?? []).map((p) => p.trim()).filter(Boolean))]
  const emailsToMove = [...new Set((input.emails ?? []).map((e) => normalizeEmailIdent(e)).filter(Boolean))]
  if (phonesToMove.length === 0 && emailsToMove.length === 0) {
    throw new Error("Select at least one phone or email to move.")
  }

  const { data: source, error: sourceErr } = await supabase
    .from("customers")
    .select("id, display_name, metadata")
    .eq("id", sourceCustomerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (sourceErr) throw sourceErr
  if (!source) throw new Error("Customer not found.")

  const idents = await loadCustomerIdentifiers(supabase, userId, sourceCustomerId)
  const sourcePhones = customerPhonesFromIdentifiers(idents)
  const sourceEmails = customerEmailsFromIdentifiers(idents)

  for (const p of phonesToMove) {
    if (!sourcePhones.includes(p)) throw new Error(`Phone not on this customer: ${p}`)
  }
  for (const e of emailsToMove) {
    if (!sourceEmails.includes(e)) throw new Error(`Email not on this customer: ${e}`)
  }

  const remainingPhones = sourcePhones.filter((p) => !phonesToMove.includes(p))
  const remainingEmails = sourceEmails.filter((e) => !emailsToMove.includes(e))
  if (remainingPhones.length === 0 && remainingEmails.length === 0) {
    throw new Error("Leave at least one phone or email on this customer.")
  }

  const sourceMeta = metaRecord(source.metadata)
  const splitEmails = [...new Set([...parseSplitOrgEmails(sourceMeta), ...emailsToMove])]
  const splitPhones = [...new Set([...parseSplitContactPhones(sourceMeta), ...phonesToMove])]

  const displayName = deriveSplitDisplayName(input.displayName ?? source.display_name ?? undefined, emailsToMove, phonesToMove)

  const { data: created, error: createErr } = await supabase
    .from("customers")
    .insert({
      user_id: userId,
      display_name: displayName,
      notes: null,
      metadata: {
        [CUSTOMER_SPLIT_FROM_META_KEY]: sourceCustomerId,
        split_from_org_key:
          typeof sourceMeta[CUSTOMER_ORG_GROUP_META_KEY] === "string" ? sourceMeta[CUSTOMER_ORG_GROUP_META_KEY] : null,
        [CUSTOMER_CONTACT_SEPARATED_META_KEY]: true,
      },
    })
    .select("id")
    .single()
  if (createErr) throw createErr
  const newCustomerId = String(created.id)

  for (const ident of idents) {
    const type = String(ident.type ?? "").toLowerCase()
    const value =
      type === "email" || type === "additional_email" ? normalizeEmailIdent(ident.value) : String(ident.value ?? "").trim()
    const move =
      (type === "phone" || type === "additional_phone") && phonesToMove.includes(value)
        ? true
        : (type === "email" || type === "additional_email") && emailsToMove.includes(value)
    if (!move) continue

    const { error: delErr } = await supabase.from("customer_identifiers").delete().eq("id", ident.id)
    if (delErr) throw delErr

    const { error: insErr } = await supabase.from("customer_identifiers").insert({
      user_id: userId,
      customer_id: newCustomerId,
      type: type === "additional_phone" ? "phone" : type === "additional_email" ? "email" : type,
      value,
      is_primary: false,
      verified: false,
    })
    if (insErr) throw insErr
  }

  // Set primary flags on new customer
  const newIdents = await loadCustomerIdentifiers(supabase, userId, newCustomerId)
  const firstPhone = newIdents.find((i) => i.type === "phone")
  const firstEmail = newIdents.find((i) => i.type === "email")
  if (firstPhone) {
    await supabase.from("customer_identifiers").update({ is_primary: true }).eq("id", firstPhone.id)
  }
  if (firstEmail) {
    await supabase.from("customer_identifiers").update({ is_primary: true }).eq("id", firstEmail.id)
  }

  const { error: metaErr } = await supabase
    .from("customers")
    .update({
      metadata: mergeCustomerHubMetadata(sourceMeta, {
        splitOrgEmails: splitEmails,
        splitContactPhones: splitPhones,
      }),
    })
    .eq("id", sourceCustomerId)
    .eq("user_id", userId)
  if (metaErr) throw metaErr

  void supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: sourceCustomerId,
    event_type: "note",
    direction: "outbound",
    subject: "Contacts separated",
    body: `Moved ${[...phonesToMove, ...emailsToMove].join(", ")} to a new customer profile.`,
    unread: false,
    metadata: { source: "contact_separate", new_customer_id: newCustomerId },
  })

  void supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: newCustomerId,
    event_type: "note",
    direction: "outbound",
    subject: "Contact profile created",
    body: `Split from customer ${source.display_name ?? sourceCustomerId}. Methods: ${[...phonesToMove, ...emailsToMove].join(", ")}.`,
    unread: false,
    metadata: { source: "contact_separate", from_customer_id: sourceCustomerId },
  })

  return { newCustomerId }
}

export async function loadCustomerMergeCandidates(
  supabase: SupabaseClient,
  userId: string,
  excludeCustomerId: string,
): Promise<CustomerMergeCandidate[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, display_name, customer_identifiers ( type, value )")
    .eq("user_id", userId)
    .neq("id", excludeCustomerId)
    .order("display_name", { ascending: true })
    .limit(300)
  if (error) throw error
  return (data ?? []).map((row) => {
    const r = row as {
      id: string
      display_name?: string | null
      customer_identifiers?: { type: string; value: string }[] | null
    }
    return {
      id: String(r.id),
      display_name: String(r.display_name ?? "").trim() || "Customer",
      contactLine: formatCustomerContactLine(r.customer_identifiers),
    }
  })
}

const CUSTOMER_ID_TABLES = [
  "communication_events",
  "calendar_events",
  "quotes",
  "conversations",
  "leads",
  "payment_requests",
] as const

function mergeMetadataArrays(existing: unknown, incoming: unknown): unknown[] {
  const a = Array.isArray(existing) ? existing : []
  const b = Array.isArray(incoming) ? incoming : []
  return [...b, ...a]
}

/** Merge source customer into target (current profile). Source row is deleted after reassignment. */
export async function mergeCustomerIntoTarget(
  supabase: SupabaseClient,
  userId: string,
  targetCustomerId: string,
  sourceCustomerId: string,
): Promise<void> {
  if (targetCustomerId === sourceCustomerId) throw new Error("Choose a different customer to merge.")

  const [{ data: target, error: targetErr }, { data: source, error: sourceErr }] = await Promise.all([
    supabase.from("customers").select("id, display_name, metadata, notes, notes_past").eq("id", targetCustomerId).eq("user_id", userId).maybeSingle(),
    supabase.from("customers").select("id, display_name, metadata, notes, notes_past").eq("id", sourceCustomerId).eq("user_id", userId).maybeSingle(),
  ])
  if (targetErr) throw targetErr
  if (sourceErr) throw sourceErr
  if (!target || !source) throw new Error("Customer not found.")

  const [targetIdents, sourceIdents] = await Promise.all([
    loadCustomerIdentifiers(supabase, userId, targetCustomerId),
    loadCustomerIdentifiers(supabase, userId, sourceCustomerId),
  ])

  const targetKeys = new Set(targetIdents.map((i) => `${String(i.type).toLowerCase()}:${String(i.value).trim().toLowerCase()}`))

  for (const ident of sourceIdents) {
    const key = `${String(ident.type).toLowerCase()}:${String(ident.value).trim().toLowerCase()}`
    if (targetKeys.has(key)) {
      await supabase.from("customer_identifiers").delete().eq("id", ident.id)
      continue
    }
    const { error } = await supabase.from("customer_identifiers").update({ customer_id: targetCustomerId }).eq("id", ident.id)
    if (error) throw error
    targetKeys.add(key)
  }

  for (const table of CUSTOMER_ID_TABLES) {
    const { error } = await supabase
      .from(table)
      .update({ customer_id: targetCustomerId })
      .eq("user_id", userId)
      .eq("customer_id", sourceCustomerId)
    if (error && !String(error.message || "").toLowerCase().includes("does not exist")) {
      throw error
    }
  }

  const targetMeta = metaRecord(target.metadata)
  const sourceMeta = metaRecord(source.metadata)
  const mergedMeta: Record<string, unknown> = {
    ...targetMeta,
    custom_receipts: mergeMetadataArrays(targetMeta.custom_receipts, sourceMeta.custom_receipts).slice(0, 40),
    insurance_coi_records: mergeMetadataArrays(targetMeta.insurance_coi_records, sourceMeta.insurance_coi_records).slice(0, 40),
    split_org_emails: [
      ...new Set([...parseSplitOrgEmails(targetMeta), ...parseSplitOrgEmails(sourceMeta)]),
    ],
    split_contact_phones: [
      ...new Set([...parseSplitContactPhones(targetMeta), ...parseSplitContactPhones(sourceMeta)]),
    ],
  }

  const notesPast = mergeMetadataArrays(target.notes_past, source.notes_past)
  const notesParts = [target.notes, source.notes].filter((n) => typeof n === "string" && n.trim())
  const mergedNotes = notesParts.length > 1 ? notesParts.join("\n\n---\n\n") : notesParts[0] ?? target.notes

  const { error: updErr } = await supabase
    .from("customers")
    .update({
      metadata: mergedMeta,
      notes: mergedNotes ?? null,
      notes_past: notesPast.length ? notesPast : target.notes_past ?? null,
    })
    .eq("id", targetCustomerId)
    .eq("user_id", userId)
  if (updErr) throw updErr

  const { error: delErr } = await supabase.from("customers").delete().eq("id", sourceCustomerId).eq("user_id", userId)
  if (delErr) throw delErr

  const sourceLabel = String(source.display_name ?? "").trim() || customerPhoneFromIdentifiers(sourceIdents) || customerEmailFromIdentifiers(sourceIdents) || sourceCustomerId.slice(0, 8)
  void supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: targetCustomerId,
    event_type: "note",
    direction: "outbound",
    subject: "Customer records merged",
    body: `Merged profile "${sourceLabel}" into this customer. Quotes, messages, and calendar jobs were reassigned.`,
    unread: false,
    metadata: { source: "contact_merge", merged_customer_id: sourceCustomerId },
  })
}

/** Permanently delete a customer profile and its identifiers from the account. */
export async function deleteCustomerFile(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<void> {
  const { error: identErr } = await supabase
    .from("customer_identifiers")
    .delete()
    .eq("user_id", userId)
    .eq("customer_id", customerId)
  if (identErr) throw identErr

  const { error: delErr } = await supabase.from("customers").delete().eq("id", customerId).eq("user_id", userId)
  if (delErr) throw delErr
}

/** @deprecated Use separateCustomerContacts — kept for per-email split buttons. */
export async function splitEmailToSeparateCustomer(
  supabase: SupabaseClient,
  userId: string,
  sourceCustomerId: string,
  rawEmail: string,
): Promise<{ newCustomerId: string }> {
  const email = normalizeCustomerEmail(rawEmail)
  if (!email) throw new Error("Email is required.")
  return separateCustomerContacts(supabase, userId, sourceCustomerId, { emails: [email] })
}
