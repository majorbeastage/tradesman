import { createHmac } from "crypto"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  firstEnv,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"

type Json = Record<string, unknown>

const META_KEY = "meta_business_v1"
/** Pages / Instagram Graph surface (latest as of Jul 2026). */
const DEFAULT_GRAPH_VERSION = "v26.0"
/** Marketing API surface — pin until Meta documents Marketing on Graph v26. */
const DEFAULT_MARKETING_VERSION = "v25.0"

type MetaConnection = {
  v: 1
  adAccountId?: string
  adAccountName?: string
  pageId?: string
  pageName?: string
  instagramAccountId?: string
  instagramUsername?: string
  connectedAt?: string
  connectedBy?: string
  lastSyncedAt?: string
  publishedPosts?: Json[]
}

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

async function actorFromRequest(req: VercelRequest): Promise<string | null> {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user?.id ?? null
}

function pinVersion(raw: string, fallback: string): string {
  return /^v\d+\.\d+$/.test(raw) ? raw : fallback
}

function metaConfig() {
  const accessToken = firstEnv("META_SYSTEM_USER_TOKEN").trim()
  const appSecret = firstEnv("META_APP_SECRET").trim()
  const appId = firstEnv("META_APP_ID").trim()
  const businessId = firstEnv("META_BUSINESS_ID").trim()
  const graphVersion = pinVersion(firstEnv("META_GRAPH_API_VERSION").trim(), DEFAULT_GRAPH_VERSION)
  const marketingVersion = pinVersion(firstEnv("META_MARKETING_API_VERSION").trim(), DEFAULT_MARKETING_VERSION)
  return { accessToken, appSecret, appId, businessId, graphVersion, marketingVersion }
}

function cleanId(value: unknown, field: string): string {
  const id = String(value ?? "").replace(/^act_/, "").trim()
  if (!/^\d{5,30}$/.test(id)) throw new Error(`Valid Meta ${field} is required.`)
  return id
}

function appSecretProof(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex")
}

async function metaRequest<T extends Json = Json>(
  path: string,
  options: { method?: "GET" | "POST"; params?: Json; api?: "graph" | "marketing" } = {},
): Promise<T> {
  const config = metaConfig()
  if (!config.accessToken || !config.appSecret || !config.appId) {
    throw new Error("Meta is not configured. Add META_APP_ID, META_APP_SECRET, and META_SYSTEM_USER_TOKEN in Vercel.")
  }
  const method = options.method ?? "GET"
  const version = options.api === "marketing" ? config.marketingVersion : config.graphVersion
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\/+/, "")}`)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value == null || value === "") continue
    params.set(key, typeof value === "string" ? value : JSON.stringify(value))
  }
  params.set("access_token", config.accessToken)
  params.set("appsecret_proof", appSecretProof(config.accessToken, config.appSecret))
  const response =
    method === "GET"
      ? await fetch(`${url.toString()}?${params.toString()}`)
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_subcode?: number } }
  if (!response.ok || payload.error) {
    const detail = payload.error?.message || `Meta request failed (${response.status}).`
    throw new Error(`${detail}${payload.error?.code ? ` [Meta ${payload.error.code}]` : ""}`)
  }
  return payload
}

function metadataRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Json) } : {}
}

function connectionFromMetadata(metadata: unknown): MetaConnection {
  const root = metadataRecord(metadata)
  const raw = metadataRecord(root[META_KEY])
  return {
    v: 1,
    adAccountId: typeof raw.adAccountId === "string" ? raw.adAccountId : undefined,
    adAccountName: typeof raw.adAccountName === "string" ? raw.adAccountName : undefined,
    pageId: typeof raw.pageId === "string" ? raw.pageId : undefined,
    pageName: typeof raw.pageName === "string" ? raw.pageName : undefined,
    instagramAccountId: typeof raw.instagramAccountId === "string" ? raw.instagramAccountId : undefined,
    instagramUsername: typeof raw.instagramUsername === "string" ? raw.instagramUsername : undefined,
    connectedAt: typeof raw.connectedAt === "string" ? raw.connectedAt : undefined,
    connectedBy: typeof raw.connectedBy === "string" ? raw.connectedBy : undefined,
    lastSyncedAt: typeof raw.lastSyncedAt === "string" ? raw.lastSyncedAt : undefined,
    publishedPosts: Array.isArray(raw.publishedPosts) ? (raw.publishedPosts as Json[]) : [],
  }
}

async function readProfile(service: SupabaseClient, profileId: string) {
  const { data, error } = await service.from("profiles").select("id, display_name, metadata").eq("id", profileId).maybeSingle()
  if (error || !data) throw new Error("Client profile not found.")
  return data
}

async function saveConnection(service: SupabaseClient, profileId: string, connection: MetaConnection) {
  const profile = await readProfile(service, profileId)
  const metadata = metadataRecord(profile.metadata)
  metadata[META_KEY] = connection
  const { error } = await service.from("profiles").update({ metadata }).eq("id", profileId)
  if (error) throw error
}

async function listBusinessAssets() {
  const config = metaConfig()
  if (!config.businessId) throw new Error("Add META_BUSINESS_ID in Vercel before discovering business assets.")
  const businessId = cleanId(config.businessId, "Business Portfolio ID")
  const accountFields = "id,account_id,name,account_status,currency,timezone_name"
  const pageFields = "id,name,instagram_business_account{id,username,name}"
  const [ownedAccounts, clientAccounts, ownedPages, clientPages] = await Promise.all([
    metaRequest<{ data?: Json[] }>(`${businessId}/owned_ad_accounts`, { params: { fields: accountFields, limit: 200 } }),
    metaRequest<{ data?: Json[] }>(`${businessId}/client_ad_accounts`, { params: { fields: accountFields, limit: 200 } }),
    metaRequest<{ data?: Json[] }>(`${businessId}/owned_pages`, { params: { fields: pageFields, limit: 200 } }),
    metaRequest<{ data?: Json[] }>(`${businessId}/client_pages`, { params: { fields: pageFields, limit: 200 } }),
  ])
  const dedupe = (rows: Json[]) => [...new Map(rows.map((row) => [String(row.id), row])).values()]
  return {
    adAccounts: dedupe([...(ownedAccounts.data ?? []), ...(clientAccounts.data ?? [])]),
    pages: dedupe([...(ownedPages.data ?? []), ...(clientPages.data ?? [])]),
  }
}

function remoteStatus(value: unknown): "active" | "paused" | "completed" {
  const status = String(value ?? "").toUpperCase()
  if (status === "ACTIVE") return "active"
  if (status === "COMPLETED" || status === "ARCHIVED" || status === "DELETED") return "completed"
  return "paused"
}

function insightSpendCents(campaign: Json): number {
  const insights = metadataRecord(campaign.insights)
  const first = Array.isArray(insights.data) ? metadataRecord(insights.data[0]) : {}
  const spend = Number(first.spend)
  return Number.isFinite(spend) ? Math.max(0, Math.round(spend * 100)) : 0
}

async function listCampaigns(connection: MetaConnection) {
  const accountId = cleanId(connection.adAccountId, "ad account ID")
  const fields = [
    "id",
    "name",
    "status",
    "effective_status",
    "objective",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "stop_time",
    "updated_time",
    "insights.date_preset(maximum){spend,impressions,clicks,reach,actions}",
  ].join(",")
  const result = await metaRequest<{ data?: Json[] }>(`act_${accountId}/campaigns`, {
    api: "marketing",
    params: { fields, limit: 200 },
  })
  return result.data ?? []
}

async function syncCampaigns(service: SupabaseClient, profileId: string, actorId: string, connection: MetaConnection) {
  const remote = await listCampaigns(connection)
  const { data: localRows, error } = await service.from("ad_campaigns").select("*").eq("profile_id", profileId)
  if (error) throw error
  const locals = (localRows ?? []) as Json[]
  let imported = 0
  let updated = 0
  for (const campaign of remote) {
    const remoteId = String(campaign.id ?? "")
    const local = locals.find((row) => metadataRecord(row.metadata).metaCampaignId === remoteId)
    const spentCents = insightSpendCents(campaign)
    const metadata = {
      ...(local ? metadataRecord(local.metadata) : {}),
      metaCampaignId: remoteId,
      metaObjective: String(campaign.objective ?? ""),
      metaEffectiveStatus: String(campaign.effective_status ?? campaign.status ?? ""),
      metaLastSyncedAt: new Date().toISOString(),
      metaRaw: campaign,
    }
    if (local?.id) {
      const { error: updateError } = await service
        .from("ad_campaigns")
        .update({
          name: String(campaign.name ?? local.name ?? "Meta campaign"),
          status: remoteStatus(campaign.effective_status ?? campaign.status),
          spent_cents: spentCents,
          starts_on: campaign.start_time ? String(campaign.start_time).slice(0, 10) : local.starts_on,
          ends_on: campaign.stop_time ? String(campaign.stop_time).slice(0, 10) : local.ends_on,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", local.id)
      if (updateError) throw updateError
      updated++
    } else {
      const budgetCents = Math.max(Number(campaign.lifetime_budget ?? 0), Number(campaign.daily_budget ?? 0))
      const { error: insertError } = await service.from("ad_campaigns").insert({
        profile_id: profileId,
        created_by: actorId,
        name: String(campaign.name ?? "Meta campaign"),
        status: remoteStatus(campaign.effective_status ?? campaign.status),
        channels: ["meta"],
        request_details: "Imported from Meta Marketing API.",
        requested_budget_cents: Number.isFinite(budgetCents) ? budgetCents : 0,
        spent_cents: spentCents,
        starts_on: campaign.start_time ? String(campaign.start_time).slice(0, 10) : null,
        ends_on: campaign.stop_time ? String(campaign.stop_time).slice(0, 10) : null,
        metadata,
      })
      if (insertError) throw insertError
      imported++
    }
  }
  connection.lastSyncedAt = new Date().toISOString()
  await saveConnection(service, profileId, connection)
  return { campaigns: remote, imported, updated }
}

async function publishSocial(service: SupabaseClient, profileId: string, actorId: string, connection: MetaConnection, body: Json) {
  const channels = Array.isArray(body.channels) ? body.channels.map(String) : []
  const message = String(body.message ?? "").trim().slice(0, 5000)
  const mediaUrl = String(body.mediaUrl ?? "").trim()
  if (!message && !mediaUrl) throw new Error("Add post text or a public media URL.")
  if (channels.length === 0) throw new Error("Select Facebook and/or Instagram.")
  const results: Json[] = []

  if (channels.includes("facebook")) {
    try {
      const pageId = cleanId(connection.pageId, "Page ID")
      const result = mediaUrl
        ? await metaRequest(`${pageId}/photos`, { method: "POST", params: { url: mediaUrl, caption: message, published: true } })
        : await metaRequest(`${pageId}/feed`, { method: "POST", params: { message } })
      results.push({ channel: "facebook", id: String(result.id ?? result.post_id ?? ""), ok: true })
    } catch (error) {
      results.push({ channel: "facebook", ok: false, error: error instanceof Error ? error.message : "Facebook publish failed." })
    }
  }

  if (channels.includes("instagram")) {
    try {
      const igId = cleanId(connection.instagramAccountId, "Instagram account ID")
      if (!mediaUrl) throw new Error("Instagram publishing requires a publicly accessible image URL.")
      const container = await metaRequest(`${igId}/media`, {
        method: "POST",
        params: { image_url: mediaUrl, caption: message },
      })
      const creationId = cleanId(container.id, "Instagram media container ID")
      let ready = false
      for (let attempt = 0; attempt < 6; attempt++) {
        const status = await metaRequest(`${creationId}`, { params: { fields: "status_code,status" } })
        if (String(status.status_code).toUpperCase() === "FINISHED") {
          ready = true
          break
        }
        if (String(status.status_code).toUpperCase() === "ERROR") throw new Error(`Instagram rejected the media: ${String(status.status ?? "")}`)
        await new Promise((resolve) => setTimeout(resolve, 1_500))
      }
      if (!ready) throw new Error("Instagram is still processing the image. Try publishing again in a moment.")
      const published = await metaRequest(`${igId}/media_publish`, { method: "POST", params: { creation_id: creationId } })
      results.push({ channel: "instagram", id: String(published.id ?? ""), ok: true })
    } catch (error) {
      results.push({ channel: "instagram", ok: false, error: error instanceof Error ? error.message : "Instagram publish failed." })
    }
  }

  if (!results.some((result) => result.ok === true)) {
    throw new Error(results.map((result) => String(result.error ?? "")).filter(Boolean).join(" | ") || "Meta publishing failed.")
  }

  const history = connection.publishedPosts ?? []
  connection.publishedPosts = [
    ...history,
    { id: `meta-post-${Date.now()}`, createdAt: new Date().toISOString(), createdBy: actorId, message, mediaUrl, channels, results },
  ].slice(-50)
  await saveConnection(service, profileId, connection)
  return results
}

async function resolveGeoTargeting(targeting: Json): Promise<Json> {
  const cities = Array.isArray(targeting.cities) ? targeting.cities.map(String).filter(Boolean) : []
  const zipCodes = Array.isArray(targeting.zipCodes) ? targeting.zipCodes.map(String).filter(Boolean) : []
  const states = Array.isArray(targeting.states) ? targeting.states.map(String).filter(Boolean) : []
  const customLocations: Json[] = []
  const regions: Json[] = []
  const zips: Json[] = []
  for (const query of [...cities.slice(0, 20), ...states.slice(0, 20), ...zipCodes.slice(0, 50)]) {
    const result = await metaRequest<{ data?: Json[] }>("search", {
      api: "marketing",
      params: { type: "adgeolocation", location_types: ["city", "region", "zip"], q: query, country_code: "US", limit: 10 },
    })
    const exact = (result.data ?? []).find((row) => String(row.name ?? "").toLowerCase() === query.toLowerCase()) ?? result.data?.[0]
    if (!exact?.key) continue
    const type = String(exact.type ?? "").toLowerCase()
    if (type === "zip") zips.push({ key: String(exact.key) })
    else if (type === "region") regions.push({ key: String(exact.key) })
    else customLocations.push({ key: String(exact.key), radius: Math.max(15, Number(targeting.radiusMiles) || 15), distance_unit: "mile" })
  }
  return {
    geo_locations: {
      countries: customLocations.length || regions.length || zips.length ? undefined : ["US"],
      ...(customLocations.length ? { custom_locations: customLocations } : {}),
      ...(regions.length ? { regions } : {}),
      ...(zips.length ? { zips } : {}),
    },
    age_min: 18,
    age_max: 65,
  }
}

async function createMetaCampaign(service: SupabaseClient, profileId: string, localCampaignId: string, connection: MetaConnection, body: Json) {
  const { data: local, error } = await service
    .from("ad_campaigns")
    .select("*")
    .eq("id", localCampaignId)
    .eq("profile_id", profileId)
    .maybeSingle()
  if (error || !local) throw new Error("Local campaign not found.")
  if (local.status !== "approved") throw new Error("The client must approve this campaign before it can be created in Meta.")
  const accountId = cleanId(connection.adAccountId, "ad account ID")
  const pageId = cleanId(connection.pageId, "Page ID")
  const budgetCents = Math.max(100, Math.round(Number(body.budgetCents) || Number(local.requested_budget_cents) || 0))
  if (budgetCents > Number(local.requested_budget_cents || 0)) {
    throw new Error("Meta media budget cannot exceed the amount approved by the client.")
  }
  const linkUrl = String(body.linkUrl ?? "").trim()
  const imageUrl = String(body.imageUrl ?? "").trim()
  const headline = String(body.headline ?? local.name).trim().slice(0, 255)
  const primaryText = String(body.primaryText ?? local.request_details ?? "").trim().slice(0, 2000)
  if (!/^https:\/\//i.test(linkUrl) || !/^https:\/\//i.test(imageUrl)) {
    throw new Error("Campaign creation requires public HTTPS landing-page and image URLs.")
  }
  const specialCategories = Array.isArray(body.specialAdCategories) ? body.specialAdCategories.map(String) : []
  const campaign = await metaRequest(`act_${accountId}/campaigns`, {
    api: "marketing",
    method: "POST",
    params: {
      name: String(local.name),
      objective: String(body.objective || "OUTCOME_TRAFFIC"),
      status: "PAUSED",
      special_ad_categories: specialCategories,
      ...(specialCategories.length ? { special_ad_category_country: ["US"] } : {}),
    },
  })
  const campaignId = cleanId(campaign.id, "campaign ID")
  const targeting = await resolveGeoTargeting(metadataRecord(body.targeting))
  const adSet = await metaRequest(`act_${accountId}/adsets`, {
    api: "marketing",
    method: "POST",
    params: {
      name: `${String(local.name)} — Ad set`,
      campaign_id: campaignId,
      lifetime_budget: budgetCents,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LANDING_PAGE_VIEWS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting,
      start_time: body.startTime,
      end_time: body.endTime,
      status: "PAUSED",
    },
  })
  const adSetId = cleanId(adSet.id, "ad set ID")
  const creative = await metaRequest(`act_${accountId}/adcreatives`, {
    api: "marketing",
    method: "POST",
    params: {
      name: `${String(local.name)} — Creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          link: linkUrl,
          message: primaryText,
          name: headline,
          picture: imageUrl,
          call_to_action: { type: "LEARN_MORE", value: { link: linkUrl } },
        },
      },
    },
  })
  const creativeId = cleanId(creative.id, "creative ID")
  const ad = await metaRequest(`act_${accountId}/ads`, {
    api: "marketing",
    method: "POST",
    params: {
      name: `${String(local.name)} — Ad`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    },
  })
  const adId = cleanId(ad.id, "ad ID")
  const metadata = {
    ...metadataRecord(local.metadata),
    metaCampaignId: campaignId,
    metaAdSetId: adSetId,
    metaCreativeId: creativeId,
    metaAdId: adId,
    metaObjective: String(body.objective || "OUTCOME_TRAFFIC"),
    metaCreatedAt: new Date().toISOString(),
    metaEffectiveStatus: "PAUSED",
  }
  const { error: updateError } = await service
    .from("ad_campaigns")
    .update({ channels: [...new Set([...(local.channels ?? []), "meta"])], status: "paused", metadata, updated_at: new Date().toISOString() })
    .eq("id", local.id)
  if (updateError) throw updateError
  return { campaignId, adSetId, creativeId, adId, status: "PAUSED" }
}

async function setMetaCampaignStatus(service: SupabaseClient, profileId: string, localCampaignId: string, status: string) {
  const next = status === "ACTIVE" ? "ACTIVE" : "PAUSED"
  const { data: local, error } = await service
    .from("ad_campaigns")
    .select("*")
    .eq("id", localCampaignId)
    .eq("profile_id", profileId)
    .maybeSingle()
  if (error || !local) throw new Error("Local campaign not found.")
  if (next === "ACTIVE" && local.status !== "paused" && local.status !== "approved") {
    throw new Error("Only an approved or paused client campaign can be activated.")
  }
  const meta = metadataRecord(local.metadata)
  const ids = [meta.metaCampaignId, meta.metaAdSetId, meta.metaAdId].map((id) => cleanId(id, "campaign component ID"))
  for (const id of ids) await metaRequest(id, { api: "marketing", method: "POST", params: { status: next } })
  meta.metaEffectiveStatus = next
  meta.metaStatusChangedAt = new Date().toISOString()
  const { error: updateError } = await service
    .from("ad_campaigns")
    .update({ status: next === "ACTIVE" ? "active" : "paused", metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", local.id)
  if (updateError) throw updateError
  return { status: next }
}

export async function handleMetaBusiness(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST, OPTIONS").json({ error: "Method not allowed" })
    return
  }
  const actorId = await actorFromRequest(req)
  if (!actorId) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }
  const service = createServiceSupabase()
  const { data: actorProfile } = await service.from("profiles").select("role").eq("id", actorId).maybeSingle()
  if (actorProfile?.role !== "admin") {
    res.status(403).json({ error: "Admin access required." })
    return
  }
  const body = bodyRecord(req)
  const action = String(body.action ?? "")
  try {
    if (action === "status") {
      const config = metaConfig()
      const me = config.accessToken && config.appSecret && config.appId ? await metaRequest("me", { params: { fields: "id,name" } }) : null
      res.status(200).json({
        configured: Boolean(config.accessToken && config.appSecret && config.appId),
        businessIdConfigured: Boolean(config.businessId),
        version: config.graphVersion,
        marketingVersion: config.marketingVersion,
        systemUser: me,
      })
      return
    }
    if (action === "list_assets") {
      res.status(200).json(await listBusinessAssets())
      return
    }
    const profileId = String(body.profileId ?? "")
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("Valid profileId required.")
    const profile = await readProfile(service, profileId)
    const connection = connectionFromMetadata(profile.metadata)
    if (action === "get_connection") {
      res.status(200).json({ connection })
      return
    }
    if (action === "save_connection") {
      const next: MetaConnection = {
        ...connection,
        v: 1,
        adAccountId: cleanId(body.adAccountId, "ad account ID"),
        adAccountName: String(body.adAccountName ?? "").slice(0, 200),
        pageId: cleanId(body.pageId, "Page ID"),
        pageName: String(body.pageName ?? "").slice(0, 200),
        instagramAccountId: body.instagramAccountId ? cleanId(body.instagramAccountId, "Instagram account ID") : undefined,
        instagramUsername: String(body.instagramUsername ?? "").slice(0, 200),
        connectedAt: new Date().toISOString(),
        connectedBy: actorId,
      }
      await saveConnection(service, profileId, next)
      res.status(200).json({ ok: true, connection: next })
      return
    }
    if (action === "list_campaigns") {
      res.status(200).json({ campaigns: await listCampaigns(connection), connection })
      return
    }
    if (action === "sync_campaigns") {
      res.status(200).json(await syncCampaigns(service, profileId, actorId, connection))
      return
    }
    if (action === "publish") {
      res.status(200).json({ results: await publishSocial(service, profileId, actorId, connection, body) })
      return
    }
    if (action === "create_campaign") {
      const localCampaignId = String(body.localCampaignId ?? "")
      if (!/^[0-9a-f-]{36}$/i.test(localCampaignId)) throw new Error("Valid localCampaignId required.")
      res.status(200).json(await createMetaCampaign(service, profileId, localCampaignId, connection, body))
      return
    }
    if (action === "set_campaign_status") {
      const localCampaignId = String(body.localCampaignId ?? "")
      if (!/^[0-9a-f-]{36}$/i.test(localCampaignId)) throw new Error("Valid localCampaignId required.")
      res.status(200).json(await setMetaCampaignStatus(service, profileId, localCampaignId, String(body.status ?? "")))
      return
    }
    res.status(400).json({ error: "Unknown action." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta request failed."
    console.error("[meta-business]", action, message)
    res.status(500).json({ error: message })
  }
}
