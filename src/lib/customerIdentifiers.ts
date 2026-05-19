import type { SupabaseClient } from "@supabase/supabase-js"

export type CustomerIdentifierRow = { type: string; value: string; is_primary?: boolean }

export function customerPhoneFromIdentifiers(
  identifiers: CustomerIdentifierRow[] | null | undefined,
): string {
  return identifiers?.find((i) => i.type === "phone")?.value?.trim() ?? ""
}

export function customerEmailFromIdentifiers(
  identifiers: CustomerIdentifierRow[] | null | undefined,
): string {
  return identifiers?.find((i) => i.type === "email")?.value?.trim() ?? ""
}

/** Phone and email for list cells and search (not the “Phone call” / “Email” preference label). */
export function formatCustomerContactLine(identifiers: CustomerIdentifierRow[] | null | undefined): string {
  const phone = customerPhoneFromIdentifiers(identifiers)
  const email = customerEmailFromIdentifiers(identifiers)
  if (phone && email) return `${phone} · ${email}`
  return phone || email || "—"
}

export function normalizeCustomerEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * When reusing an existing customer (e.g. lead matched by phone), add any new phone/email/name
 * identifiers that are not already stored for that customer.
 */
export async function ensureCustomerIdentifiers(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  opts: { phone?: string; email?: string; name?: string },
): Promise<void> {
  const phone = opts.phone?.trim() ?? ""
  const email = opts.email?.trim() ? normalizeCustomerEmail(opts.email) : ""
  const name = opts.name?.trim() ?? ""
  if (!phone && !email && !name) return

  const { data: existing, error: loadErr } = await supabase
    .from("customer_identifiers")
    .select("type, value")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .in("type", ["phone", "email", "name"])

  if (loadErr) throw loadErr

  const rows = (existing ?? []) as { type: string; value: string }[]
  const hasPhone = phone && rows.some((r) => r.type === "phone" && r.value.trim() === phone)
  const hasEmail = email && rows.some((r) => r.type === "email" && normalizeCustomerEmail(r.value) === email)
  const hasName = name && rows.some((r) => r.type === "name" && r.value.trim() === name)

  const toInsert: Array<{ type: string; value: string; is_primary: boolean }> = []
  if (phone && !hasPhone) toInsert.push({ type: "phone", value: phone, is_primary: rows.every((r) => r.type !== "phone") })
  if (email && !hasEmail) toInsert.push({ type: "email", value: email, is_primary: rows.length === 0 && toInsert.length === 0 })
  if (name && !hasName) toInsert.push({ type: "name", value: name, is_primary: false })

  if (toInsert.length === 0) return

  const { error: insErr } = await supabase.from("customer_identifiers").insert(
    toInsert.map((i) => ({
      user_id: userId,
      customer_id: customerId,
      type: i.type,
      value: i.value,
      is_primary: i.is_primary,
      verified: false,
    })),
  )
  if (insErr) throw insErr
}
