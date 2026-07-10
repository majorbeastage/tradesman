import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureCustomerIdentifiers, normalizeCustomerEmail } from "./customerIdentifiers"
import {
  classifyInboundEmailContact,
  mergeCustomerHubMetadata,
} from "./customerContactKind"
import {
  buildConsentAuditNote,
  mapManualMethodToSource,
  persistCustomerSmsConsent,
  validateManualSmsConsentSourceInput,
  type ManualSmsConsentSourceInput,
} from "./customerSmsConsent"
import { geocodeAddressToLatLng } from "./jobSiteLocation"
import { requiresManualSmsOptInRecord, type CommEventLite } from "./smsFirstOutboundCompliance"

async function loadCustomerCommEventsLite(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<CommEventLite[]> {
  const { data } = await supabase
    .from("communication_events")
    .select("event_type, direction, created_at")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true })
    .limit(300)
  return (data as CommEventLite[] | null) ?? []
}

export type CreateCustomerInput = {
  name?: string
  phone?: string
  email?: string
  serviceAddress?: string
  /** Required when `phone` is set — records express SMS opt-in on the customer. */
  smsConsent?: boolean
  businessName?: string
  /** Required when `phone` + `smsConsent` (manual entry). */
  smsConsentSource?: ManualSmsConsentSourceInput
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

  let manualSmsOptInRequired = Boolean(phone)
  if (phone && existingId) {
    const events = await loadCustomerCommEventsLite(supabase, userId, existingId)
    manualSmsOptInRequired = requiresManualSmsOptInRecord(events)
  }

  if (phone && manualSmsOptInRequired && !input.smsConsent) {
    throw new Error("SMS opt-in is required when adding a phone number. Confirm the customer agreed to receive texts.")
  }
  if (phone && manualSmsOptInRequired && input.smsConsent) {
    const srcErr = validateManualSmsConsentSourceInput(
      input.smsConsentSource ?? { method: "", consentUrl: "", consentNote: "" },
    )
    if (srcErr) throw new Error(srcErr)
  }

  async function maybeRecordSmsConsent(
    customerId: string,
    existingMetadata?: unknown,
    optInRequired = true,
  ) {
    if (!phone || !optInRequired || !input.smsConsent || !input.smsConsentSource?.method) return
    const biz = input.businessName?.trim() || "Your business"
    const method = input.smsConsentSource.method
    try {
      await persistCustomerSmsConsent(supabase, customerId, existingMetadata, {
        source: mapManualMethodToSource(method),
        businessName: biz,
        consentMethod: method,
        consentUrl: input.smsConsentSource.consentUrl,
        consentNote: buildConsentAuditNote(input.smsConsentSource),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes("metadata")) {
        throw new Error(
          "SMS opt-in could not be saved: run supabase/customers-metadata.sql in the Supabase SQL editor, then try again.",
        )
      }
      throw e
    }
  }

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
    const { data: row } = await supabase
      .from("customers")
      .select("display_name, metadata")
      .eq("id", customerId)
      .maybeSingle()
    await maybeRecordSmsConsent(customerId, row?.metadata, manualSmsOptInRequired)
    return {
      customerId,
      reusedExisting: true,
      displayName: (row?.display_name as string | null)?.trim() || name || phone || email,
    }
  }

  const displayName = name || (phone ? `Unknown (${phone})` : email ? `Unknown (${email})` : "New customer")
  const emailNorm = email ? normalizeCustomerEmail(email) : ""
  const emailClassification = emailNorm ? classifyInboundEmailContact(emailNorm) : null
  const customerMetadata = emailClassification
    ? mergeCustomerHubMetadata(null, {
        hubKind: emailClassification.hubKind,
        orgGroupKey: emailClassification.orgGroupKey,
      })
    : undefined

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
      display_name: emailClassification?.displayName?.trim() ? emailClassification.displayName : displayName,
      notes: null,
      service_address: serviceAddress || null,
      service_lat: lat,
      service_lng: lng,
      ...(customerMetadata ? { metadata: customerMetadata } : {}),
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

  await maybeRecordSmsConsent(customerId)

  return { customerId, reusedExisting: false, displayName }
}
