import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 500
const MAX_ROWS = 20_000

const CUSTOMER_SELECT = `
  id,
  display_name,
  created_at,
  updated_at,
  service_address,
  service_lat,
  service_lng,
  best_contact_method,
  job_pipeline_status,
  communication_urgency,
  last_activity_at,
  fit_classification,
  fit_confidence,
  fit_reason,
  fit_source,
  fit_manually_overridden,
  fit_evaluated_at,
  metadata
`

function bearerToken(req: VercelRequest): string {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
}

function bodyOwnerId(req: VercelRequest): string {
  const raw = req.body
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw) && !Buffer.isBuffer(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const fromBody = typeof rec.ownerUserId === "string" ? rec.ownerUserId.trim() : ""
  const fromQuery = typeof req.query.ownerUserId === "string" ? req.query.ownerUserId.trim() : ""
  return fromBody || fromQuery
}

async function actorMayReadOwner(service: ReturnType<typeof createServiceSupabase>, actorId: string, ownerId: string): Promise<boolean> {
  if (actorId === ownerId) return true
  const { data: actor } = await service.from("profiles").select("role").eq("id", actorId).maybeSingle()
  const role = typeof actor?.role === "string" ? actor.role.trim() : ""
  if (role === "admin") return true
  const { data: om } = await service
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", actorId)
    .eq("user_id", ownerId)
    .maybeSingle()
  if (om?.user_id) return true
  const { data: member } = await service
    .from("office_manager_clients")
    .select("office_manager_id")
    .eq("user_id", actorId)
    .eq("office_manager_id", ownerId)
    .maybeSingle()
  if (member?.office_manager_id) return true
  const { data: invite } = await service
    .from("team_member_invites")
    .select("account_owner_id")
    .eq("shell_profile_id", actorId)
    .eq("account_owner_id", ownerId)
    .in("status", ["accepted", "shell", "pending"])
    .maybeSingle()
  return Boolean(invite?.account_owner_id)
}

async function pageAll(
  service: ReturnType<typeof createServiceSupabase>,
  table: string,
  select: string,
  ownerId: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  while (from < MAX_ROWS) {
    const to = from + PAGE - 1
    const { data, error } = await service.from(table).select(select).eq("user_id", ownerId).range(from, to)
    if (error) throw error
    const chunk = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return rows
}

export async function handleCustomersHub(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST, OPTIONS").json({ error: "Method not allowed" })
    return
  }
  const token = bearerToken(req)
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }
  const ownerId = bodyOwnerId(req)
  if (!UUID_RE.test(ownerId)) {
    res.status(400).json({ error: "ownerUserId required" })
    return
  }
  const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: authErr } = await userClient.auth.getUser(token)
  const actorId = userData.user?.id?.trim() || ""
  if (authErr || !actorId) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }
  const service = createServiceSupabase()
  const allowed = await actorMayReadOwner(service, actorId, ownerId)
  if (!allowed) {
    res.status(403).json({ error: "Not allowed to load this account's customers" })
    return
  }

  const [customers, identifiers] = await Promise.all([
    pageAll(service, "customers", CUSTOMER_SELECT, ownerId),
    pageAll(service, "customer_identifiers", "customer_id, type, value", ownerId),
  ])
  const byCustomer = new Map<string, Array<{ type: string; value: string }>>()
  for (const row of identifiers) {
    const customerId = typeof row.customer_id === "string" ? row.customer_id : ""
    const type = typeof row.type === "string" ? row.type : ""
    const value = typeof row.value === "string" ? row.value : ""
    if (!customerId || !type) continue
    const list = byCustomer.get(customerId) ?? []
    list.push({ type, value })
    byCustomer.set(customerId, list)
  }
  const rows = customers.map((row) => ({
    ...row,
    customer_identifiers: byCustomer.get(String(row.id ?? "")) ?? [],
  }))
  res.status(200).json({ rows })
}
