/**
 * Mirror ops signup/demo alerts into the admin account's Customers tab (communication_events).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, getOrCreateCustomerByEmail, logCommunicationEvent } from "./_communications.js"

export type AdminOpsCustomerEventKind =
  | "signup_submitted"
  | "signup_verified"
  | "demo_request"
  | "demo_provisioned"
  | "support_ticket"

async function resolveAdminOpsCustomerOwnerUserId(service: SupabaseClient): Promise<string | null> {
  const forced = firstEnv("ADMIN_OPS_CUSTOMERS_USER_ID").trim()
  if (forced) return forced

  const preferEmail = "admin@tradesman-us.com"
  const { data: byEmail, error: emailErr } = await service
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .ilike("email", preferEmail)
    .limit(1)
    .maybeSingle()
  if (emailErr) console.warn("[admin-ops-customer-event] admin lookup", emailErr.message)
  if (byEmail?.id) return String(byEmail.id)

  const { data: admins, error: adminErr } = await service
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
  if (adminErr) console.warn("[admin-ops-customer-event] admin fallback", adminErr.message)
  return admins?.[0]?.id ? String(admins[0].id) : null
}

export async function recordAdminOpsCustomerEvent(
  service: SupabaseClient,
  params: {
    kind: AdminOpsCustomerEventKind
    externalId: string
    email: string
    displayName?: string | null
    subject: string
    body: string
    signupUserId?: string | null
    ticketId?: string | null
    phone?: string | null
  },
): Promise<{ ok: boolean; skipped?: boolean; customerId?: string; adminUserId?: string; error?: string }> {
  const email = params.email.trim().toLowerCase()
  if (!email.includes("@")) return { ok: false, error: "email required" }

  const adminUserId = await resolveAdminOpsCustomerOwnerUserId(service)
  if (!adminUserId) return { ok: false, error: "no admin profile for ops customers" }

  const { data: existing } = await service
    .from("communication_events")
    .select("id")
    .eq("user_id", adminUserId)
    .eq("external_id", params.externalId)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return { ok: true, skipped: true, adminUserId }

  try {
    const { customerId, previousCustomer } = await getOrCreateCustomerByEmail(service, adminUserId, email)
    const displayName = params.displayName?.trim()
    if (displayName) {
      await service
        .from("customers")
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", customerId)
        .eq("user_id", adminUserId)
    }

    await logCommunicationEvent(service, {
      user_id: adminUserId,
      customer_id: customerId,
      event_type: "email",
      direction: "inbound",
      external_id: params.externalId,
      subject: params.subject,
      body: params.body,
      unread: true,
      previous_customer: previousCustomer,
      metadata: {
        source: "ops_signup_alert",
        ops_kind: params.kind,
        signup_user_id: params.signupUserId ?? null,
        ticket_id: params.ticketId ?? null,
        contact_phone: params.phone ?? null,
      },
    })

    return { ok: true, customerId, adminUserId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[admin-ops-customer-event]", params.kind, msg)
    return { ok: false, error: msg }
  }
}
