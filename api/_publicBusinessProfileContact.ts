import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  createServiceSupabase,
  ensureOpenLeadForInbound,
  getOrCreateCustomerByEmail,
  normalizePhone,
} from "./_communications.js"
import { findBusinessProfileOwnerBySlug } from "./_publicBusinessProfile.js"

function pickString(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = body[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

export async function handlePublicBusinessProfileContact(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS")
    res.status(405).json({ ok: false, error: "POST only" })
    return
  }

  let body: Record<string, unknown> = {}
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    res.status(400).json({ ok: false, error: "Invalid JSON body" })
    return
  }

  const honeypot = pickString(body, "website", "url", "hp")
  if (honeypot) {
    res.status(200).json({ ok: true })
    return
  }

  const slug = pickString(body, "slug").toLowerCase().replace(/[^a-z0-9-]/g, "")
  const name = pickString(body, "name", "customerName").slice(0, 200)
  const email = pickString(body, "email").toLowerCase().slice(0, 320)
  const phone = normalizePhone(pickString(body, "phone", "phoneNumber"))
  const address = pickString(body, "address", "street").slice(0, 300)
  const zip = pickString(body, "zip", "zipCode", "postalCode").slice(0, 20)
  const preferredRaw = pickString(body, "preferredContact", "preferred_contact").toLowerCase()
  const preferredContact =
    preferredRaw === "sms" || preferredRaw === "text" ? "sms" : preferredRaw === "phone" || preferredRaw === "call" ? "phone" : "email"
  const smsOptIn = body.smsOptIn === true || body.sms_opt_in === true || pickString(body, "smsOptIn").toLowerCase() === "true"

  if (!slug || slug.length < 3) {
    res.status(400).json({ ok: false, error: "Invalid business link." })
    return
  }
  if (!name) {
    res.status(400).json({ ok: false, error: "Name is required." })
    return
  }
  if (!email) {
    res.status(400).json({ ok: false, error: "Email is required." })
    return
  }
  if (preferredContact === "sms" && !smsOptIn) {
    res.status(400).json({
      ok: false,
      error: "SMS opt-in consent is required when text message is your preferred contact method.",
    })
    return
  }

  let supabase: ReturnType<typeof createServiceSupabase>
  try {
    supabase = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const owner = await findBusinessProfileOwnerBySlug(supabase, slug)
  if (!owner) {
    res.status(404).json({ ok: false, error: "Business profile not found or contact form is not enabled." })
    return
  }
  if (!owner.settings.showContactForm) {
    res.status(404).json({ ok: false, error: "This business has not enabled the contact form." })
    return
  }

  const userId = owner.profile.id
  let customerId: string
  try {
    const byEmail = await getOrCreateCustomerByEmail(supabase, userId, email)
    customerId = byEmail.customerId
    await supabase.from("customers").update({ display_name: name }).eq("id", customerId).eq("user_id", userId)
    if (phone) {
      const { error: phoneErr } = await supabase.from("customer_identifiers").upsert(
        {
          user_id: userId,
          customer_id: customerId,
          type: "phone",
          value: phone,
          is_primary: false,
          verified: false,
        },
        { onConflict: "customer_id,type,value", ignoreDuplicates: true },
      )
      if (phoneErr && !/duplicate/i.test(phoneErr.message)) {
        console.warn("[public-business-profile-contact] phone identifier", phoneErr.message)
      }
    }
    const serviceAddress = [address, zip].filter(Boolean).join(address && zip ? ", " : "")
    if (serviceAddress) {
      await supabase
        .from("customers")
        .update({ service_address: serviceAddress.slice(0, 500) })
        .eq("id", customerId)
        .eq("user_id", userId)
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Could not save contact." })
    return
  }

  const preferredLabel =
    preferredContact === "sms" ? "Text message (SMS)" : preferredContact === "phone" ? "Phone call" : "Email"
  const description = [
    `Submitted from public business profile (${slug}).`,
    `Preferred contact: ${preferredLabel}`,
    phone ? `Phone: ${phone}` : null,
    `Email: ${email}`,
    address ? `Address: ${address}` : null,
    zip ? `ZIP: ${zip}` : null,
    preferredContact === "sms" && smsOptIn ? "SMS opt-in: yes" : null,
  ]
    .filter(Boolean)
    .join("\n")

  try {
    await ensureOpenLeadForInbound(supabase, userId, customerId, `Web profile: ${name.slice(0, 60)}`, description)
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Could not create lead." })
    return
  }

  if (preferredContact === "sms" && smsOptIn && phone) {
    const { data: custRow } = await supabase.from("customers").select("metadata").eq("id", customerId).maybeSingle()
    const prev =
      custRow?.metadata && typeof custRow.metadata === "object" && !Array.isArray(custRow.metadata)
        ? { ...(custRow.metadata as Record<string, unknown>) }
        : {}
    prev.business_profile_sms_consent = {
      at: new Date().toISOString(),
      slug,
      source: "business_public_profile",
    }
    await supabase.from("customers").update({ metadata: prev }).eq("id", customerId)
  }

  res.status(200).json({ ok: true })
}
