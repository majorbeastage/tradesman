import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  firstEnv,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"
import { notifyAdminOps } from "./_adminOpsNotify.js"

type Json = Record<string, unknown>

function bodyRecord(req: VercelRequest): Json {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8")) as Json
    } catch {
      return {}
    }
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Json
    } catch {
      return {}
    }
  }
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Json) : {}
}

async function userFromRequest(req: VercelRequest): Promise<{ id: string } | null> {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  return error || !data.user?.id ? null : { id: data.user.id }
}

async function sendClientApprovalEmail(params: {
  email: string
  clientName: string
  campaignName: string
  budgetCents: number
  details: string
}) {
  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) return { ok: false, disabled: true }
  const origin = firstEnv("PUBLIC_APP_ORIGIN", "VITE_PUBLIC_APP_ORIGIN") || "https://www.tradesman-us.com"
  const amount = `$${(Math.max(0, params.budgetCents) / 100).toFixed(2)}`
  const text = [
    `Hello ${params.clientName || "Tradesman client"},`,
    "",
    `Tradesman Systems prepared the campaign “${params.campaignName}” for your approval.`,
    `Proposed campaign budget: ${amount}`,
    params.details ? `Campaign details: ${params.details}` : "",
    "",
    "Sign in to Tradesman and open Growth → Campaigns to approve or decline the request before it can launch:",
    origin,
    "",
    "Campaign spend does not guarantee a specific number of leads, calls, bookings, or customers. Results vary due to factors outside Tradesman Systems’ control.",
    "Tradesman Systems charges $3.95 through $100 of campaign spend, then $3.95 plus 2% of the amount above $100.",
  ]
    .filter(Boolean)
    .join("\n")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [params.email],
      subject: `Campaign approval requested: ${params.campaignName}`,
      text,
    }),
  })
  return { ok: response.ok, disabled: false }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const actor = await userFromRequest(req)
    if (!actor) return res.status(401).json({ error: "Unauthorized" })
    const body = bodyRecord(req)
    const action = String(body.action ?? "")
    const campaignId = String(body.campaignId ?? "")
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return res.status(400).json({ error: "Valid campaignId required." })

    const service = createServiceSupabase()
    const { data: campaign, error: campaignError } = await service
      .from("ad_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle()
    if (campaignError || !campaign) return res.status(404).json({ error: "Campaign not found." })

    if (action === "request") {
      const { data: actorProfile } = await service.from("profiles").select("role").eq("id", actor.id).maybeSingle()
      if (actorProfile?.role !== "admin") return res.status(403).json({ error: "Admin access required." })
      const { data: clientProfile } = await service
        .from("profiles")
        .select("display_name")
        .eq("id", campaign.profile_id)
        .maybeSingle()
      const { data: authUser } = await service.auth.admin.getUserById(campaign.profile_id)
      const email = authUser.user?.email?.trim() || ""
      if (!email) return res.status(409).json({ error: "Client account has no email address." })
      const now = new Date().toISOString()
      const metadata =
        campaign.metadata && typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata)
          ? { ...(campaign.metadata as Json) }
          : {}
      metadata.client_approval = {
        status: "pending",
        requested_at: now,
        requested_by: actor.id,
      }
      const { error: updateError } = await service
        .from("ad_campaigns")
        .update({ status: "awaiting_client_approval", metadata, updated_at: now })
        .eq("id", campaign.id)
      if (updateError) throw updateError
      const emailResult = await sendClientApprovalEmail({
        email,
        clientName: String(clientProfile?.display_name ?? ""),
        campaignName: String(campaign.name),
        budgetCents: Number(campaign.requested_budget_cents || 0),
        details: String(campaign.request_details ?? ""),
      })
      return res.status(200).json({ ok: true, email: emailResult })
    }

    if (action === "respond") {
      if (campaign.profile_id !== actor.id) return res.status(403).json({ error: "This campaign belongs to another client." })
      if (campaign.status !== "awaiting_client_approval") {
        return res.status(409).json({ error: "This campaign is no longer waiting for approval." })
      }
      const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : ""
      if (!decision) return res.status(400).json({ error: "Decision must be approved or rejected." })
      const now = new Date().toISOString()
      const metadata =
        campaign.metadata && typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata)
          ? { ...(campaign.metadata as Json) }
          : {}
      metadata.client_approval = {
        ...((metadata.client_approval && typeof metadata.client_approval === "object"
          ? (metadata.client_approval as Json)
          : {}) as Json),
        status: decision,
        responded_at: now,
        responded_by: actor.id,
        note: String(body.note ?? "").trim().slice(0, 1000),
      }
      const nextStatus = decision === "approved" ? "approved" : "client_rejected"
      const { error: updateError } = await service
        .from("ad_campaigns")
        .update({ status: nextStatus, metadata, updated_at: now })
        .eq("id", campaign.id)
      if (updateError) throw updateError
      await notifyAdminOps({
        service,
        subject: `Client ${decision} campaign: ${campaign.name}`,
        text: `Campaign: ${campaign.name}\nClient profile: ${campaign.profile_id}\nDecision: ${decision}\nNote: ${String(body.note ?? "") || "—"}`,
        pushTitle: `Campaign ${decision}`,
        pushBody: `${campaign.name} was ${decision} by the client.`,
      })
      return res.status(200).json({ ok: true, status: nextStatus })
    }

    return res.status(400).json({ error: "Unknown action." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign approval request failed."
    console.error("[campaign-approval]", message)
    return res.status(500).json({ error: message })
  }
}
