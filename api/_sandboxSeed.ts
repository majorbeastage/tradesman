import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ensureOpenLeadForInbound,
  getOrCreateCustomerByEmail,
  getOrCreateCustomerByPhone,
  insertCommunicationEventReturningId,
  logCommunicationEvent,
  normalizePhone,
} from "./_communications.js"
import { isSandboxProfileRow } from "./_sandboxEnvironment.js"
import { DEFAULT_SANDBOX_DEMO_TEAM } from "./_sandboxDemoTeam.js"
import {
  mergeSandboxPortalConfigRecord,
  SANDBOX_DASHBOARD_QUICK_LINKS,
  SANDBOX_PROFILE_ROLE,
} from "./_sandboxPortalConfig.js"
import {
  recordSmsConsentFromInboundCall,
  recordSmsConsentFromInboundSms,
} from "./_conversationAutoReply.js"

export const SANDBOX_ZIP = "99901"
export const SANDBOX_CITY = "Tradesman Demo"
export const SANDBOX_STATE = "TX"
export const SANDBOX_COMPANY = "Demo Plumbing Co."

const SEED_CUSTOMERS: { name: string; phone: string; email: string; notes?: string }[] = [
  { name: "James Wilson", phone: "+15550101001", email: "j.wilson@example.invalid", notes: "Repeat customer — annual water heater flush" },
  { name: "Sarah Chen", phone: "+15550101002", email: "s.chen@example.invalid", notes: "Kitchen sink leak — estimate sent" },
  { name: "Robert Martinez", phone: "+15550101003", email: "r.martinez@example.invalid" },
  { name: "Emily Johnson", phone: "+15550101004", email: "e.johnson@example.invalid", notes: "Requested same-day service" },
  { name: "Michael Brown", phone: "+15550101005", email: "m.brown@example.invalid" },
  { name: "Lisa Anderson", phone: "+15550101006", email: "l.anderson@example.invalid" },
  { name: "David Thompson", phone: "+15550101007", email: "d.thompson@example.invalid" },
  { name: "Jennifer Lee", phone: "+15550101008", email: "j.lee@example.invalid" },
  { name: "Chris Davis", phone: "+15550101009", email: "c.davis@example.invalid" },
  { name: "Amanda White", phone: "+15550101010", email: "a.white@example.invalid" },
  { name: "Kevin Garcia", phone: "+15550101011", email: "k.garcia@example.invalid" },
  { name: "Nicole Harris", phone: "+15550101012", email: "n.harris@example.invalid" },
]

export const LIVE_LEAD_SCENARIOS: {
  name: string
  phone: string
  email: string
  message: string
  channel: "web" | "sms" | "email" | "call"
  attribution?: string
}[] = [
  {
    name: "Maria Garcia",
    phone: "+15550102001",
    email: "maria.garcia@example.invalid",
    message: "Water heater is leaking — need someone today if possible.",
    channel: "web",
    attribution: "google_maps",
  },
  {
    name: "Tom Bradley",
    phone: "+15550102002",
    email: "tom.bradley@example.invalid",
    message: "Can you quote a bathroom remodel? We found you on Google.",
    channel: "web",
    attribution: "google_search",
  },
  {
    name: "Jessica Reed",
    phone: "+15550102003",
    email: "j.reed@example.invalid",
    message: "Do you service tankless units? Mine shows an error code.",
    channel: "sms",
    attribution: "website",
  },
  {
    name: "Daniel Kim",
    phone: "+15550102004",
    email: "d.kim@example.invalid",
    message: "Looking for a drain cleaning quote for our rental property.",
    channel: "email",
    attribution: "referral",
  },
  {
    name: "Patricia Moore",
    phone: "+15550102005",
    email: "p.moore@example.invalid",
    message: "Missed call — please call back about a garbage disposal install.",
    channel: "call",
    attribution: "phone_call",
  },
  {
    name: "Ryan Foster",
    phone: "+15550102006",
    email: "r.foster@example.invalid",
    message: "Saw your truck — do you offer emergency service on weekends?",
    channel: "web",
    attribution: "direct",
  },
  {
    name: "Angela Scott",
    phone: "+15550102007",
    email: "a.scott@example.invalid",
    message: "Need estimate for repiping a 1970s home.",
    channel: "sms",
    attribution: "facebook",
  },
  {
    name: "Brandon Lewis",
    phone: "+15550102008",
    email: "b.lewis@example.invalid",
    message: "Insurance adjuster asked for a plumber — slab leak suspected.",
    channel: "email",
    attribution: "referral",
  },
]

function slugForSandbox(userId: string): string {
  const short = userId.replace(/-/g, "").slice(0, 8).toLowerCase()
  return `demo-plumbing-${short}`
}

function daysFromNow(days: number, hour = 9): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString()
}

/** Keep sandbox demo customers separate in the Customers hub (no example.invalid org merge). */
async function repairSandboxDemoCustomerGrouping(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data } = await supabase.from("customers").select("id, metadata").eq("user_id", userId)
  for (const row of data ?? []) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    if (meta.sandbox_seed !== true && meta.sandbox_live !== true) continue
    if (meta.contact_separated === true) continue
    await supabase
      .from("customers")
      .update({
        metadata: { ...meta, contact_separated: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", userId)
  }
}

export type SeedSandboxResult = {
  ok: true
  customerCount: number
  leadCount: number
  eventCount: number
  embedSlug: string
  companyName: string
  profileRepaired?: boolean
}

/** Fix role/portal_config — sandbox always gets full corporate manager access. */
export async function ensureSandboxProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("role, metadata, portal_config")
    .eq("id", userId)
    .maybeSingle()
  if (!isSandboxProfileRow(prof as Parameters<typeof isSandboxProfileRow>[0])) return false

  const pc =
    prof?.portal_config && typeof prof.portal_config === "object" && !Array.isArray(prof.portal_config)
      ? (prof.portal_config as Record<string, unknown>)
      : {}
  const prevMeta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? { ...(prof.metadata as Record<string, unknown>) }
      : {}
  const role = String(prof?.role ?? "")
  const nextPortal = mergeSandboxPortalConfigRecord(pc)
  const needsQuickLinks = !prevMeta.dashboard_quick_links
  const needsDemoTeam = !prevMeta.sandbox_demo_team
  const needsRoleFix = role !== SANDBOX_PROFILE_ROLE
  const needsPortalFix =
    pc.sandbox_account !== true ||
    pc.corporate_package !== true ||
    pc.enable_operations_tab !== true ||
    (pc.tabs as Record<string, boolean> | undefined)?.settings !== true

  if (!needsRoleFix && !needsPortalFix && !needsQuickLinks && !needsDemoTeam) return false

  const nextMeta = {
    ...prevMeta,
    sandbox_account: true,
    demo_account: false,
    ...(needsQuickLinks ? { dashboard_quick_links: SANDBOX_DASHBOARD_QUICK_LINKS } : {}),
    ...(needsDemoTeam ? { sandbox_demo_team: DEFAULT_SANDBOX_DEMO_TEAM } : {}),
  }

  await supabase
    .from("profiles")
    .update({
      role: SANDBOX_PROFILE_ROLE,
      portal_config: nextPortal,
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
  return true
}

/** Idempotent seed — skips if sandbox_workspace_v1.seededAt already set unless force=true. */
export async function seedSandboxWorkspace(
  supabase: SupabaseClient,
  userId: string,
  opts?: { force?: boolean; companyName?: string },
): Promise<SeedSandboxResult> {
  const companyName = opts?.companyName?.trim() || SANDBOX_COMPANY
  const embedSlug = slugForSandbox(userId)

  const profileRepaired = await ensureSandboxProfile(supabase, userId)
  await repairSandboxDemoCustomerGrouping(supabase, userId)

  const { data: prof } = await supabase.from("profiles").select("metadata, display_name").eq("id", userId).maybeSingle()
  const prevMeta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? { ...(prof.metadata as Record<string, unknown>) }
      : {}
  const prevSandbox = prevMeta.sandbox_workspace_v1
  if (
    !opts?.force &&
    prevSandbox &&
    typeof prevSandbox === "object" &&
    !Array.isArray(prevSandbox) &&
    typeof (prevSandbox as Record<string, unknown>).seededAt === "string"
  ) {
    const slug =
      typeof (prevSandbox as Record<string, unknown>).embedLeadSlug === "string"
        ? String((prevSandbox as Record<string, unknown>).embedLeadSlug)
        : embedSlug
    const { count: custCount } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
    const { count: leadCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
    if ((custCount ?? 0) > 0) {
      return {
        ok: true,
        customerCount: custCount ?? 0,
        leadCount: leadCount ?? 0,
        eventCount: 0,
        embedSlug: slug,
        companyName,
        profileRepaired,
      }
    }
  }

  if (opts?.force) {
    try {
      await supabase.rpc("purge_trial_user_data", { p_user_id: userId })
    } catch {
      /* best effort */
    }
  }

  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    sandbox_account: true,
    sandbox_workspace_v1: {
      v: 1,
      companyName,
      seededAt: new Date().toISOString(),
      liveTrafficEnabled: true,
      liveTrafficIntervalMinutes: 3,
      embedLeadSlug: embedSlug,
    },
    service_address_zip: SANDBOX_ZIP,
    service_address_city: SANDBOX_CITY,
    service_address_state: SANDBOX_STATE,
  }

  await supabase
    .from("profiles")
    .update({
      display_name: prof?.display_name?.trim() ? prof.display_name : companyName,
      embed_lead_enabled: true,
      embed_lead_slug: embedSlug,
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)

  const customerIds: string[] = []
  for (const row of SEED_CUSTOMERS) {
    const { customerId } = await getOrCreateCustomerByPhone(supabase, userId, row.phone)
    customerIds.push(customerId)
    await supabase
      .from("customers")
      .update({
        display_name: row.name,
        notes: row.notes ?? null,
        metadata: {
          sandbox_seed: true,
          contact_separated: true,
          service_address: `${row.name.split(" ").pop()} St, ${SANDBOX_CITY}, ${SANDBOX_STATE} ${SANDBOX_ZIP}`,
        },
        last_activity_at: hoursFromNow(-Math.floor(Math.random() * 72)),
      })
      .eq("id", customerId)
      .eq("user_id", userId)
    await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: customerId,
        type: "email",
        value: row.email.toLowerCase(),
        is_primary: false,
        verified: false,
      }).then(({ error }) => {
        if (error && !String(error.message || "").includes("duplicate")) {
          console.warn("[sandbox-seed] email identifier", error.message)
        }
      })
  }

  let leadCount = 0
  const openLeadCustomers = customerIds.slice(0, 5)
  for (let i = 0; i < openLeadCustomers.length; i++) {
    const cid = openLeadCustomers[i]
    const cust = SEED_CUSTOMERS[i]
    const title = `Lead: ${cust.name} — ${i % 2 === 0 ? "Service request" : "Estimate follow-up"}`
    await ensureOpenLeadForInbound(
      supabase,
      userId,
      cid,
      title,
      cust.notes ?? "Seeded sandbox lead for training.",
    )
    leadCount++
  }

  let eventCount = 0
  for (let i = 0; i < Math.min(6, customerIds.length); i++) {
    const cid = customerIds[i]
    const cust = SEED_CUSTOMERS[i]
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: cid,
      event_type: i % 2 === 0 ? "sms" : "email",
      direction: "inbound",
      subject: i % 2 === 0 ? null : `Question about service — ${cust.name}`,
      body:
        i % 2 === 0
          ? `Hi, this is ${cust.name.split(" ")[0]}. Can someone call me back about scheduling?`
          : `Hello,\n\nI wanted to follow up on the estimate. When is your next opening?\n\nThanks,\n${cust.name}`,
      unread: i < 3,
      metadata: { sandbox_seed: true, simulated: true },
    })
    if (i % 2 === 0) {
      await recordSmsConsentFromInboundSms(supabase, userId, cid)
    }
    eventCount++
  }

  for (let i = 0; i < 3; i++) {
    const cid = customerIds[i]
    const start = daysFromNow(i + 1, 10 + i)
    const end = daysFromNow(i + 1, 12 + i)
    const { error } = await supabase.from("calendar_events").insert({
      user_id: userId,
      customer_id: cid,
      title: i === 0 ? "Water heater install" : i === 1 ? "Drain cleaning" : "Estimate — bathroom remodel",
      start_at: start,
      end_at: end,
      notes: "Sandbox scheduled job",
    })
    if (!error) eventCount++
  }

  return {
    ok: true,
    customerCount: customerIds.length,
    leadCount,
    eventCount,
    embedSlug,
    companyName,
    profileRepaired,
  }
}

export type InjectLeadResult = {
  ok: true
  customerId: string
  leadId: string
  scenario: string
  channel: string
}

export async function injectSandboxLead(
  supabase: SupabaseClient,
  userId: string,
  scenarioIndex?: number,
): Promise<InjectLeadResult> {
  const idx =
    typeof scenarioIndex === "number" && scenarioIndex >= 0 && scenarioIndex < LIVE_LEAD_SCENARIOS.length
      ? scenarioIndex
      : Math.floor(Math.random() * LIVE_LEAD_SCENARIOS.length)
  const scenario = LIVE_LEAD_SCENARIOS[idx]!

  const { customerId } = await getOrCreateCustomerByPhone(supabase, userId, scenario.phone)
  await supabase
    .from("customers")
    .update({
      display_name: scenario.name,
      last_activity_at: new Date().toISOString(),
      metadata: {
        sandbox_live: true,
        contact_separated: true,
        attribution_source: scenario.attribution ?? "unknown",
        service_address: `${100 + idx} Demo Lane, ${SANDBOX_CITY}, ${SANDBOX_STATE} ${SANDBOX_ZIP}`,
      },
    })
    .eq("id", customerId)
    .eq("user_id", userId)

  await supabase.from("customer_identifiers").insert({
    user_id: userId,
    customer_id: customerId,
    type: "email",
    value: scenario.email.toLowerCase(),
    is_primary: false,
    verified: false,
  }).then(({ error }) => {
    if (error && !String(error.message || "").includes("duplicate")) {
      console.warn("[sandbox-inject] email identifier", error.message)
    }
  })

  const title =
    scenario.channel === "call"
      ? `Missed call: ${scenario.name}`
      : scenario.channel === "web"
        ? `Web lead: ${scenario.name}`
        : `New inquiry: ${scenario.name}`

  const leadId = await ensureOpenLeadForInbound(supabase, userId, customerId, title, scenario.message)

  const leadMeta: Record<string, unknown> = {
    sandbox_live: true,
    attribution_source: scenario.attribution ?? "unknown",
    capture_channel: scenario.channel,
    injected_at: new Date().toISOString(),
  }
  if (scenario.channel === "web") {
    leadMeta.public_cta_sms_consent = { at: new Date().toISOString(), source: "sandbox_simulator" }
  }
  await supabase.from("leads").update({ metadata: leadMeta }).eq("id", leadId)

  if (scenario.channel === "sms") {
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: customerId,
      lead_id: leadId,
      event_type: "sms",
      direction: "inbound",
      body: scenario.message,
      unread: true,
      metadata: { sandbox_simulated: true, from: normalizePhone(scenario.phone) },
    })
    await recordSmsConsentFromInboundSms(supabase, userId, customerId)
  } else if (scenario.channel === "email") {
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: customerId,
      lead_id: leadId,
      event_type: "email",
      direction: "inbound",
      subject: `Service inquiry — ${scenario.name}`,
      body: scenario.message,
      unread: true,
      metadata: { sandbox_simulated: true, from: scenario.email },
    })
  } else if (scenario.channel === "call") {
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: customerId,
      lead_id: leadId,
      event_type: "call",
      direction: "inbound",
      body: "Missed call — customer did not leave voicemail.",
      unread: true,
      metadata: { sandbox_simulated: true, from: normalizePhone(scenario.phone), missed: true },
    })
    await recordSmsConsentFromInboundCall(supabase, userId, customerId)
  } else {
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: customerId,
      lead_id: leadId,
      event_type: "email",
      direction: "inbound",
      subject: `Web form: ${scenario.name}`,
      body: scenario.message,
      unread: true,
      metadata: { sandbox_simulated: true, source: "public_cta" },
    })
  }

  return {
    ok: true,
    customerId,
    leadId,
    scenario: scenario.name,
    channel: scenario.channel,
  }
}

export async function simulateSandboxOutboundEmail(
  supabase: SupabaseClient,
  params: {
    userId: string
    customerId?: string | null
    conversationId?: string | null
    leadId?: string | null
    to: string[]
    subject: string
    body: string
    bodyHtml?: string
    attachmentCount?: number
    attachmentNames?: string[]
  },
): Promise<{ ok: true; simulated: true; eventId: string | null; inboundReplyAt?: string }> {
  const eventId = await insertCommunicationEventReturningId(supabase, {
    user_id: params.userId,
    customer_id: params.customerId ?? null,
    conversation_id: params.conversationId ?? null,
    lead_id: params.leadId ?? null,
    event_type: "email",
    direction: "outbound",
    subject: params.subject,
    body: params.body,
    unread: false,
    metadata: {
      sandbox_simulated: true,
      to: params.to,
      body_html: params.bodyHtml ?? undefined,
      provider: "sandbox",
      attachment_count: params.attachmentCount ?? 0,
      attachment_names: params.attachmentNames ?? [],
    },
  })

  let inboundReplyAt: string | undefined
  if (params.customerId) {
    const replies = [
      "Thanks for reaching out! What times work for an estimate this week?",
      "Got it — we'll be home after 3pm most days.",
      "Sounds good. Can you send the estimate when ready?",
      "Yes, please schedule us for the first opening you have.",
    ]
    const reply = replies[Math.floor(Math.random() * replies.length)]!
    inboundReplyAt = new Date(Date.now() + 4000).toISOString()
    await logCommunicationEvent(supabase, {
      user_id: params.userId,
      customer_id: params.customerId,
      conversation_id: params.conversationId ?? null,
      lead_id: params.leadId ?? null,
      event_type: "email",
      direction: "inbound",
      subject: `Re: ${params.subject}`,
      body: reply,
      unread: true,
      metadata: {
        sandbox_simulated: true,
        simulated_delay_ms: 4000,
        in_reply_to: eventId,
      },
    })
  }

  return { ok: true, simulated: true, eventId, inboundReplyAt }
}

export async function simulateSandboxOutboundSms(
  supabase: SupabaseClient,
  params: {
    userId: string
    customerId?: string | null
    conversationId?: string | null
    leadId?: string | null
    to: string
    body: string
  },
): Promise<{ ok: true; simulated: true; eventId: string | null }> {
  const eventId = await insertCommunicationEventReturningId(supabase, {
    user_id: params.userId,
    customer_id: params.customerId ?? null,
    conversation_id: params.conversationId ?? null,
    lead_id: params.leadId ?? null,
    event_type: "sms",
    direction: "outbound",
    body: params.body,
    unread: false,
    metadata: { sandbox_simulated: true, to: params.to, provider: "sandbox" },
  })

  if (params.customerId) {
    const replies = ["Thanks!", "Ok sounds good", "👍", "Can you call me in 10 min?"]
    await logCommunicationEvent(supabase, {
      user_id: params.userId,
      customer_id: params.customerId,
      conversation_id: params.conversationId ?? null,
      lead_id: params.leadId ?? null,
      event_type: "sms",
      direction: "inbound",
      body: replies[Math.floor(Math.random() * replies.length)]!,
      unread: true,
      metadata: { sandbox_simulated: true, in_reply_to: eventId },
    })
  }

  return { ok: true, simulated: true, eventId }
}

export async function sandboxTrafficTick(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ injected: boolean; reason?: string; result?: InjectLeadResult }> {
  const { data: prof } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  const sw = meta.sandbox_workspace_v1
  if (!sw || typeof sw !== "object" || Array.isArray(sw)) {
    return { injected: false, reason: "not_sandbox" }
  }
  const doc = sw as Record<string, unknown>
  if (doc.liveTrafficEnabled !== true) {
    return { injected: false, reason: "live_traffic_off" }
  }
  const intervalMin = typeof doc.liveTrafficIntervalMinutes === "number" ? doc.liveTrafficIntervalMinutes : 3
  const lastAt = typeof doc.lastTrafficAt === "string" ? new Date(doc.lastTrafficAt).getTime() : 0
  const now = Date.now()
  if (lastAt && now - lastAt < intervalMin * 60_000) {
    return { injected: false, reason: "too_soon" }
  }

  const result = await injectSandboxLead(supabase, userId)
  const nextMeta = {
    ...meta,
    sandbox_workspace_v1: { ...doc, v: 1, lastTrafficAt: new Date().toISOString() },
  }
  await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
  return { injected: true, result }
}
