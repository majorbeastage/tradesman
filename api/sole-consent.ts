import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServiceSupabase, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"
import { SOLE_LEGAL_DOCUMENTS, SOLE_LEGAL_VERSION } from "../sole/documents.js"
import {
  assertAttributionPayload,
  businessActivationGaps,
  hashesForAcceptance,
  soleWholesaleFeeCents,
  spendPermissionGaps,
  type AcceptanceRef,
  type SpendAuthorization,
} from "../sole/enforcement.js"

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8")) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
}

async function resolveUser(req: VercelRequest, body: Record<string, unknown>): Promise<{ sb: SupabaseClient; userId: string }> {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  const supabaseUrl = pickSupabaseUrlForServer() || String(body.supabaseUrl ?? "").trim()
  const anonKey = pickSupabaseAnonKeyForServer() || String(body.supabaseAnonKey ?? "").trim()
  if (!token || !supabaseUrl || !anonKey) throw new Error("Unauthorized")
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user?.id) throw new Error("Unauthorized")
  try {
    return { sb: createServiceSupabase(), userId: data.user.id }
  } catch {
    return { sb: userClient, userId: data.user.id }
  }
}

function sqlMissing(message: string): boolean {
  return /sole_business_legal_acceptances|sole_advertising_authorizations|sole_attribution_events|does not exist|relation/i.test(message)
}

async function loadAcceptances(sb: SupabaseClient, profileId: string): Promise<AcceptanceRef[]> {
  const { data, error } = await sb
    .from("sole_business_legal_acceptances")
    .select("document_slug, document_version")
    .eq("profile_id", profileId)
    .eq("partner_slug", "tradesman")
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    documentSlug: String((row as { document_slug?: string }).document_slug ?? ""),
    documentVersion: String((row as { document_version?: string }).document_version ?? ""),
  }))
}

async function latestSpend(sb: SupabaseClient, profileId: string): Promise<SpendAuthorization | null> {
  const { data, error } = await sb
    .from("sole_advertising_authorizations")
    .select("platforms, budget_cents, cadence, automation_mode, status")
    .eq("profile_id", profileId)
    .eq("partner_slug", "tradesman")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as {
    platforms?: string[]
    budget_cents?: number
    cadence?: SpendAuthorization["cadence"]
    automation_mode?: SpendAuthorization["automationMode"]
    status?: string
  }
  return {
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    budgetCents: Number(row.budget_cents ?? 0),
    cadence: row.cadence === "weekly" || row.cadence === "one_time" ? row.cadence : "monthly",
    automationMode: row.automation_mode === "advisory" || row.automation_mode === "automatic" ? row.automation_mode : "manual",
    status: String(row.status ?? ""),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const action = String(req.query.__action ?? "status").trim()
  const body = bodyOf(req)
  try {
    if (action === "documents") {
      res.status(200).json({
        ok: true,
        version: SOLE_LEGAL_VERSION,
        counselReview: true,
        documents: SOLE_LEGAL_DOCUMENTS.map((d) => ({
          slug: d.slug,
          title: d.title,
          summary: d.summary,
          version: d.version,
          requiredForBusiness: d.requiredForBusiness,
          requiredForDeveloper: d.requiredForDeveloper,
          requiredBeforeSpend: d.requiredBeforeSpend,
          path: `/sole/legal/${d.slug}`,
        })),
      })
      return
    }

    const { sb, userId } = await resolveUser(req, body)
    const profileId = String(body.profileId ?? userId).trim()
    if (profileId !== userId) {
      res.status(403).json({ error: "You can record SOLE acceptance only for the signed-in business." })
      return
    }

    if (action === "status") {
      const accepted = await loadAcceptances(sb, profileId)
      const spend = await latestSpend(sb, profileId)
      res.status(200).json({
        ok: true,
        version: SOLE_LEGAL_VERSION,
        accepted,
        activationGaps: businessActivationGaps(accepted),
        spendGaps: spendPermissionGaps(accepted, spend),
        spend,
        chargesEnabled: false,
      })
      return
    }

    if (action === "accept") {
      if (body.authorityAffirmed !== true) {
        res.status(400).json({ error: "Confirm you are authorized to accept for this business." })
        return
      }
      const slugs = Array.isArray(body.slugs) ? body.slugs.map((s) => String(s).trim()).filter(Boolean) : []
      if (!slugs.length) {
        res.status(400).json({ error: "Choose each SOLE document to accept. Nothing is preselected." })
        return
      }
      const rows = hashesForAcceptance(slugs).map((item) => ({
        profile_id: profileId,
        user_id: userId,
        partner_slug: "tradesman",
        document_slug: item.slug,
        document_version: item.version,
        content_hash: item.contentHash,
        acceptance_method: "growth_unchecked_checkbox",
        authority_affirmed: true,
      }))
      const { error } = await sb.from("sole_business_legal_acceptances").upsert(rows, {
        onConflict: "profile_id,partner_slug,document_slug,document_version",
      })
      if (error) throw new Error(error.message)
      const accepted = await loadAcceptances(sb, profileId)
      res.status(200).json({ ok: true, accepted, activationGaps: businessActivationGaps(accepted), chargesEnabled: false })
      return
    }

    if (action === "authorize-spend") {
      const accepted = await loadAcceptances(sb, profileId)
      const activationGaps = businessActivationGaps(accepted)
      if (activationGaps.length) {
        res.status(403).json({ error: "Accept the current SOLE terms before authorizing spend.", activationGaps })
        return
      }
      if (body.billingDisclosureAccepted !== true) {
        res.status(400).json({ error: "Accept the billing disclosure for this spend authorization." })
        return
      }
      const platforms = Array.isArray(body.platforms) ? body.platforms.map((p) => String(p).trim()).filter(Boolean) : []
      const budgetCents = Math.round(Number(body.budgetCents))
      const cadence = body.cadence === "weekly" || body.cadence === "one_time" ? body.cadence : "monthly"
      const automationMode = "manual"
      if (!platforms.length || !Number.isFinite(budgetCents) || budgetCents <= 0) {
        res.status(400).json({ error: "Name at least one platform and a budget greater than zero." })
        return
      }
      if (body.automationMode === "automatic") {
        res.status(400).json({ error: "Automatic optimization is not enabled in this build. Choose manual and approve changes yourself." })
        return
      }
      const fee = soleWholesaleFeeCents(budgetCents)
      const disclosure = hashesForAcceptance(["billing-disclosure"])[0]
      const { error: disclosureErr } = await sb.from("sole_business_legal_acceptances").upsert(
        {
          profile_id: profileId,
          user_id: userId,
          partner_slug: "tradesman",
          document_slug: disclosure.slug,
          document_version: disclosure.version,
          content_hash: disclosure.contentHash,
          acceptance_method: "spend_authorization_checkbox",
          authority_affirmed: true,
        },
        { onConflict: "profile_id,partner_slug,document_slug,document_version" },
      )
      if (disclosureErr) throw new Error(disclosureErr.message)
      const { error } = await sb.from("sole_advertising_authorizations").insert({
        profile_id: profileId,
        user_id: userId,
        partner_slug: "tradesman",
        platforms,
        budget_cents: budgetCents,
        cadence,
        renewal_day: cadence === "monthly" ? Math.min(28, Math.max(1, Number(body.renewalDay) || 1)) : null,
        automation_mode: automationMode,
        sole_fee_cents: fee,
        partner_fee_cents: 0,
        status: "recorded_not_charged",
        disclosure_version: SOLE_LEGAL_VERSION,
        notes: "Recorded only. No card was charged and no advertisement was launched.",
      })
      if (error) throw new Error(error.message)
      res.status(200).json({
        ok: true,
        status: "recorded_not_charged",
        soleFeeCents: fee,
        chargesEnabled: false,
        message: "Authorization recorded. No payment was collected and no campaign was launched.",
      })
      return
    }

    if (action === "enqueue-event") {
      const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null
      if (!payload) {
        res.status(400).json({ error: "payload is required." })
        return
      }
      assertAttributionPayload(payload)
      const eventId = String(body.eventId ?? payload.eventId ?? "").trim()
      const eventType = String(body.eventType ?? payload.eventType ?? "").trim()
      if (!eventId || !eventType) {
        res.status(400).json({ error: "eventId and eventType are required." })
        return
      }
      const { error } = await sb.from("sole_attribution_events").upsert(
        {
          partner_slug: "tradesman",
          tenant_ref: profileId,
          event_id: eventId,
          event_type: eventType,
          occurred_at: new Date().toISOString(),
          payload,
          status: "queued",
        },
        { onConflict: "partner_slug,event_id" },
      )
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true, status: "queued" })
      return
    }

    res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/unauthorized/i.test(message)) {
      res.status(401).json({ error: message })
      return
    }
    if (/Unknown SOLE legal document/i.test(message)) {
      res.status(400).json({ error: message })
      return
    }
    if (sqlMissing(message)) {
      res.status(503).json({ error: "Run supabase/sole-foundation.sql in Supabase, then retry. Nothing was marked accepted." })
      return
    }
    res.status(500).json({ error: message })
  }
}
