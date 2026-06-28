import type { SupabaseClient } from "@supabase/supabase-js"
import { evaluateAndPersistCustomerFit, evaluateAndPersistLeadFit } from "./_leadFitClassification.js"
import { gatherAndApplyCustomerContactFromHistory } from "./_customerContactGathering.js"

const SMS_CONSENT_META_KEY = "sms_consent"

const SMS_CONSENT_AFFIRMATIVE =
  /\b(yes|yeah|yep|sure|ok(?:ay)?|i agree|absolutely|affirmative|correct|that'?s fine|go ahead)\b/i
const SMS_CONSENT_TOPIC =
  /\b(text|sms|text message|text messages|texting|receive (?:text|sms)|opt[- ]?in)\b/i
const SMS_CONSENT_EXPLICIT =
  /\b(agree to receive|consent to receive|opt in to|approve.*text|approve.*sms|yes.*text messages|yes.*sms messages)\b/i

function extractAddressFromText(text: string): string | null {
  const m = text.match(
    /\b(\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4},\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/,
  )
  return m?.[1]?.trim() ?? null
}

/** Rules-first SMS opt-in detection from inbound email/SMS/call transcript text. */
export function detectSmsConsentInText(text: string): { detected: boolean; snippet: string } {
  const body = text.trim()
  if (!body) return { detected: false, snippet: "" }
  const lower = body.toLowerCase()
  if (SMS_CONSENT_EXPLICIT.test(lower)) {
    return { detected: true, snippet: body.slice(0, 500) }
  }
  if (SMS_CONSENT_AFFIRMATIVE.test(lower) && SMS_CONSENT_TOPIC.test(lower)) {
    return { detected: true, snippet: body.slice(0, 500) }
  }
  return { detected: false, snippet: "" }
}

async function applySmsConsentIfDetected(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  text: string,
  source: string,
): Promise<boolean> {
  const hit = detectSmsConsentInText(text)
  if (!hit.detected) return false

  const { data: cust } = await supabase
    .from("customers")
    .select("metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  const meta =
    cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
      ? { ...(cust.metadata as Record<string, unknown>) }
      : {}
  if (meta[SMS_CONSENT_META_KEY] && typeof meta[SMS_CONSENT_META_KEY] === "object") return false

  const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle()
  const businessName = (prof as { display_name?: string | null } | null)?.display_name?.trim() || "Your business"

  meta[SMS_CONSENT_META_KEY] = {
    at: new Date().toISOString(),
    source,
    consent_method: source.includes("call") || source.includes("attendant") ? "phone_call" : source,
    consent_note: `Customer expressed SMS opt-in in inbound message: ${hit.snippet.slice(0, 280)}`,
    disclosure_snapshot: `The customer agrees to receive text messages from ${businessName} regarding quotes, appointments, scheduling, job updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.`,
    detected_by: "inbound_engagement_rules",
  }
  await supabase.from("customers").update({ metadata: meta }).eq("id", customerId).eq("user_id", userId)
  return true
}

function mergeCustomerNotes(prevNotes: string | null | undefined, line: string): string {
  const prev = typeof prevNotes === "string" ? prevNotes.trim() : ""
  if (!line.trim()) return prev
  if (prev.includes(line.slice(0, 80))) return prev
  return prev ? `${prev}\n\n${line}` : line
}

/**
 * After inbound contact: parse address + notes, detect SMS opt-in, run lead/customer fit when new info arrives.
 * Used by live call screening, SMS, email, and sandbox simulation.
 */
export async function enrichInboundCustomerEngagement(
  supabase: SupabaseClient,
  opts: {
    userId: string
    customerId: string
    leadId?: string | null
    inboundBody: string
    transcriptText?: string | null
    channel: "sms" | "email" | "call" | "voicemail"
    sourceTag?: string
  },
): Promise<void> {
  const body = opts.inboundBody.trim()
  const transcript = (opts.transcriptText ?? "").trim()
  const combined = [body, transcript].filter(Boolean).join("\n\n")
  if (!combined.trim()) return

  const consentSource =
    opts.sourceTag ??
    (opts.channel === "call" || opts.channel === "voicemail" ? "auto_attendant_or_call" : `inbound_${opts.channel}`)

  await applySmsConsentIfDetected(supabase, opts.userId, opts.customerId, combined, consentSource)

  const gatherResult = await gatherAndApplyCustomerContactFromHistory(supabase, opts.userId, opts.customerId, {
    supplementalText: combined,
    source: `inbound_${opts.channel}`,
  }).catch((e) => {
    console.warn("[inbound-enrich] contact gather", e instanceof Error ? e.message : e)
    return null
  })

  const { data: cust } = await supabase
    .from("customers")
    .select("display_name, service_address, metadata, notes, fit_evaluated_at")
    .eq("id", opts.customerId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  const hadAddressBeforeNotes = Boolean((cust?.service_address as string | null | undefined)?.trim())
  const addressNewlyCaptured =
    gatherResult?.updatedFields.includes("service address") ||
    Boolean(!hadAddressBeforeNotes && extractAddressFromText(combined))

  if (cust) {
    const meta =
      cust.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
        ? { ...(cust.metadata as Record<string, unknown>) }
        : {}
    const patch: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
      metadata: {
        ...meta,
        last_inbound_channel: opts.channel,
        last_inbound_at: new Date().toISOString(),
      },
    }
    const noteLine = `[${opts.channel.toUpperCase()} ${new Date().toLocaleDateString()}] ${combined.slice(0, 600)}`
    patch.notes = mergeCustomerNotes(cust.notes as string | null, noteLine)
    await supabase.from("customers").update(patch).eq("id", opts.customerId).eq("user_id", opts.userId)

    if (!cust.fit_evaluated_at || addressNewlyCaptured) {
      await evaluateAndPersistCustomerFit(supabase, opts.customerId, {
        force: addressNewlyCaptured,
      }).catch((e) => console.warn("[inbound-enrich] customer fit", e instanceof Error ? e.message : e))
    }
  }

  if (opts.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("description, fit_evaluated_at")
      .eq("id", opts.leadId)
      .maybeSingle()
    const prevDesc = (lead?.description ?? "").trim()
    const mergedDesc =
      prevDesc && !prevDesc.includes(combined.slice(0, 80)) ? `${prevDesc}\n\n${combined}` : combined || prevDesc
    await supabase
      .from("leads")
      .update({
        description: mergedDesc.slice(0, 8000),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", opts.leadId)

    const leadNeedsFit = !lead?.fit_evaluated_at || addressNewlyCaptured
    if (leadNeedsFit) {
      await evaluateAndPersistLeadFit(supabase, opts.leadId, {
        supplementalText: combined.slice(0, 4000),
        force: addressNewlyCaptured,
      }).catch((e) => console.warn("[inbound-enrich] lead fit", e instanceof Error ? e.message : e))
    }
  }
}
