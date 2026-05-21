import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureCustomerIdentifiers, normalizeCustomerEmail } from "./customerIdentifiers"
import { geocodeAddressToLatLng } from "./jobSiteLocation"

export type CreateCustomerInput = {
  name?: string
  phone?: string
  email?: string
  serviceAddress?: string
}

export type CreateCustomerResult = {
  customerId: string
  reusedExisting: boolean
  displayName: string
}

export async function findCustomerIdByPhoneOrEmail(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  email: string,
): Promise<string | null> {
  if (phone) {
    const { data: byPhone } = await supabase
      .from("customer_identifiers")
      .select("customer_id")
      .eq("user_id", userId)
      .eq("type", "phone")
      .eq("value", phone)
      .limit(1)
      .maybeSingle()
    if (byPhone?.customer_id) return byPhone.customer_id as string
  }
  if (email) {
    const emailNorm = normalizeCustomerEmail(email)
    const { data: byEmail } = await supabase
      .from("customer_identifiers")
      .select("customer_id")
      .eq("user_id", userId)
      .eq("type", "email")
      .eq("value", emailNorm)
      .limit(1)
      .maybeSingle()
    if (byEmail?.customer_id) return byEmail.customer_id as string
  }
  return null
}

/**
 * Create a customer (or reuse by phone/email). Inserts identifiers and optional service address.
 */
export async function createCustomerRecord(
  supabase: SupabaseClient,
  userId: string,
  input: CreateCustomerInput,
): Promise<CreateCustomerResult> {
  const phone = input.phone?.trim() ?? ""
  const email = input.email?.trim() ?? ""
  const name = input.name?.trim() ?? ""
  const serviceAddress = input.serviceAddress?.trim() ?? ""

  if (!phone && !email && !name) {
    throw new Error("Enter at least a name, phone, or email.")
  }

  const existingId = await findCustomerIdByPhoneOrEmail(supabase, userId, phone, email)

  if (existingId) {
    const customerId = existingId
    await ensureCustomerIdentifiers(supabase, userId, customerId, { phone, email, name })
    if (serviceAddress) {
      let lat: number | null = null
      let lng: number | null = null
      try {
        const coords = await geocodeAddressToLatLng(serviceAddress)
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
      } catch {
        /* optional geocode */
      }
      await supabase
        .from("customers")
        .update({
          service_address: serviceAddress,
          ...(lat != null && lng != null ? { service_lat: lat, service_lng: lng } : {}),
        })
        .eq("id", customerId)
    }
    const { data: row } = await supabase.from("customers").select("display_name").eq("id", customerId).maybeSingle()
    return {
      customerId,
      reusedExisting: true,
      displayName: (row?.display_name as string | null)?.trim() || name || phone || email,
    }
  }

  const displayName = name || (phone ? `Unknown (${phone})` : email ? `Unknown (${email})` : "New customer")
  const nowIso = new Date().toISOString()

  let lat: number | null = null
  let lng: number | null = null
  if (serviceAddress) {
    try {
      const coords = await geocodeAddressToLatLng(serviceAddress)
      if (coords) {
        lat = coords.lat
        lng = coords.lng
      }
    } catch {
      /* optional */
    }
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .insert({
      user_id: userId,
      display_name: displayName,
      notes: null,
      service_address: serviceAddress || null,
      service_lat: lat,
      service_lng: lng,
      last_activity_at: nowIso,
    })
    .select("id")
    .single()

  if (customerErr) throw customerErr
  const customerId = customer.id as string

  const identifiers: Array<{ type: string; value: string; is_primary: boolean }> = []
  if (phone) identifiers.push({ type: "phone", value: phone, is_primary: true })
  if (email) identifiers.push({ type: "email", value: normalizeCustomerEmail(email), is_primary: identifiers.length === 0 })
  if (name) identifiers.push({ type: "name", value: name, is_primary: false })

  if (identifiers.length > 0) {
    const { error: identErr } = await supabase.from("customer_identifiers").insert(
      identifiers.map((i) => ({
        user_id: userId,
        customer_id: customerId,
        type: i.type,
        value: i.value,
        is_primary: i.is_primary,
        verified: false,
      })),
    )
    if (identErr) throw identErr
  }

  return { customerId, reusedExisting: false, displayName }
}
