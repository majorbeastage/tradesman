import { randomUUID } from "crypto"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"
import { notifyAdminOps } from "./_adminOpsNotify.js"

type Json = Record<string, unknown>

const GROWTH_KEY = "growth_module_v1"
const PLATFORM_IDS = new Set(["website", "google", "facebook", "instagram", "linkedin", "yelp", "tiktok", "x", "youtube"])

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

async function actorFromRequest(req: VercelRequest): Promise<{ id: string; email: string } | null> {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  return error || !data.user?.id ? null : { id: data.user.id, email: data.user.email ?? "" }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(String).map((item) => item.trim().toLowerCase()).filter((item) => PLATFORM_IDS.has(item)))]
}

export async function handleBusinessProfileAccess(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST, OPTIONS").json({ error: "Method not allowed" })
    return
  }

  const actor = await actorFromRequest(req)
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  const body = bodyRecord(req)
  const action = String(body.action ?? "")
  const service = createServiceSupabase()
  const targetProfileId = action === "admin_confirm" ? String(body.profileId ?? "") : actor.id
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProfileId)) {
    res.status(400).json({ error: "Valid profileId required." })
    return
  }

  const { data: actorProfile } = await service.from("profiles").select("role").eq("id", actor.id).maybeSingle()
  if (action === "admin_confirm" && actorProfile?.role !== "admin") {
    res.status(403).json({ error: "Admin access required." })
    return
  }
  if (action !== "request_help" && action !== "granted_access" && action !== "admin_confirm") {
    res.status(400).json({ error: "Unknown action." })
    return
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("display_name, metadata")
    .eq("id", targetProfileId)
    .maybeSingle()
  if (profileError || !profile) {
    res.status(404).json({ error: "Client profile not found." })
    return
  }

  const metadata =
    profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? { ...(profile.metadata as Json) }
      : {}
  const growth =
    metadata[GROWTH_KEY] && typeof metadata[GROWTH_KEY] === "object" && !Array.isArray(metadata[GROWTH_KEY])
      ? { ...(metadata[GROWTH_KEY] as Json) }
      : { v: 1 }
  const updates = Array.isArray(growth.profileAccessUpdates)
    ? (growth.profileAccessUpdates.filter((item) => item && typeof item === "object") as Json[])
    : []
  const now = new Date().toISOString()

  if (action === "admin_confirm") {
    const updateId = String(body.updateId ?? "")
    const confirmedPlatforms = stringArray(body.platforms)
    const index = updates.findIndex((item) => item.id === updateId)
    if (index < 0) {
      res.status(404).json({ error: "Access update not found." })
      return
    }
    updates[index] = {
      ...updates[index],
      status: "admin_confirmed",
      adminConfirmedAt: now,
      adminConfirmedBy: actor.id,
      adminConfirmedPlatforms: confirmedPlatforms,
    }
  } else {
    const platforms = action === "granted_access" ? stringArray(body.platforms) : []
    if (action === "granted_access" && platforms.length === 0) {
      res.status(400).json({ error: "Select at least one outlet where access was granted." })
      return
    }
    updates.push({
      id: randomUUID(),
      kind: action,
      status: action === "request_help" ? "help_requested" : "access_granted",
      platforms,
      note: String(body.note ?? "").trim().slice(0, 1000),
      createdAt: now,
      createdBy: actor.id,
    })
  }

  growth.profileAccessUpdates = updates.slice(-25)
  growth.updatedAt = now
  metadata[GROWTH_KEY] = growth
  const { error: updateError } = await service.from("profiles").update({ metadata }).eq("id", targetProfileId)
  if (updateError) throw updateError

  if (action !== "admin_confirm") {
    const label = action === "request_help" ? "requested help with business profile access" : "granted business profile access"
    const platforms = stringArray(body.platforms)
    await notifyAdminOps({
      service,
      subject: `Business profile update: ${String(profile.display_name ?? actor.email ?? "Client")}`,
      text: [
        `Client: ${String(profile.display_name ?? "Unnamed client")}`,
        `Email: ${actor.email || "Unavailable"}`,
        `Profile ID: ${targetProfileId}`,
        `Update: ${label}`,
        platforms.length ? `Outlets: ${platforms.join(", ")}` : "",
        String(body.note ?? "").trim() ? `Note: ${String(body.note).trim().slice(0, 1000)}` : "",
        "",
        "Review this under Admin → Ads & campaigns → Business profile access updates.",
      ]
        .filter(Boolean)
        .join("\n"),
      pushTitle: "Business profile access update",
      pushBody: `${String(profile.display_name ?? "A client")} ${label}.`,
    })
  }

  res.status(200).json({ ok: true, profileAccessUpdates: growth.profileAccessUpdates })
}
