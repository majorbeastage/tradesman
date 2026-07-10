import type { VercelRequest } from "@vercel/node"
import type { SupabaseClient } from "@supabase/supabase-js"

export type SiteTrafficRecordBody = {
  path?: string
  viewKey?: string
  referrer?: string
  visitorId?: string
}

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|bytespider|bingpreview|mediapartners/i

export function parseReferrerHost(referrer: string | null | undefined): string | null {
  const raw = String(referrer ?? "").trim()
  if (!raw) return null
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "").toLowerCase()
    return host || null
  } catch {
    return null
  }
}

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = String(ua ?? "").trim()
  if (!s) return false
  return BOT_RE.test(s)
}

export function requestCountry(req: VercelRequest): string | null {
  const h = req.headers
  const raw =
    (typeof h["x-vercel-ip-country"] === "string" ? h["x-vercel-ip-country"] : null) ||
    (typeof h["cf-ipcountry"] === "string" ? h["cf-ipcountry"] : null) ||
    null
  const c = raw?.trim().toUpperCase()
  return c && c !== "XX" ? c : null
}

export async function insertSiteTrafficEvent(
  supabase: SupabaseClient,
  req: VercelRequest,
  body: SiteTrafficRecordBody,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const path = String(body.path ?? "/").trim().slice(0, 500) || "/"
  const viewKey = String(body.viewKey ?? path).trim().slice(0, 120) || path
  const referrer = String(body.referrer ?? "").trim().slice(0, 2000) || null
  const visitorId = String(body.visitorId ?? "").trim().slice(0, 80) || null
  const userAgent =
    (typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "").slice(0, 500) || null

  if (isBotUserAgent(userAgent)) {
    return { ok: true }
  }

  const now = new Date()
  const { error } = await supabase.from("site_traffic_events").insert({
    path,
    view_key: viewKey,
    referrer,
    referrer_host: parseReferrerHost(referrer),
    user_agent: userAgent,
    country: requestCountry(req),
    hour_utc: now.getUTCHours(),
    day_utc: now.toISOString().slice(0, 10),
    visitor_id: visitorId,
    metadata: {},
  })

  if (error) {
    if (String(error.message || "").includes("site_traffic_events")) {
      return { ok: false, status: 503, error: "Run supabase/site-traffic-events.sql in Supabase." }
    }
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true }
}

export type SiteTrafficStats = {
  totalToday: number
  totalLast7Days: number
  totalLast30Days: number
  viewsByDay: Array<{ day: string; count: number }>
  viewsByHourUtc: Array<{ hour: number; count: number }>
  topReferrers: Array<{ host: string; count: number }>
  topPaths: Array<{ path: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  dataSince: string | null
}

function startOfUtcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

export async function loadSiteTrafficStats(supabase: SupabaseClient, days = 30): Promise<SiteTrafficStats> {
  const empty: SiteTrafficStats = {
    totalToday: 0,
    totalLast7Days: 0,
    totalLast30Days: 0,
    viewsByDay: [],
    viewsByHourUtc: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
    topReferrers: [],
    topPaths: [],
    topCountries: [],
    dataSince: null,
  }

  const now = new Date()
  const since = addUtcDays(now, -Math.max(1, Math.min(days, 90)))
  const sinceIso = since.toISOString()
  const today = startOfUtcDay(now)
  const day7 = startOfUtcDay(addUtcDays(now, -6))
  const day30 = startOfUtcDay(addUtcDays(now, -29))

  const { data, error } = await supabase
    .from("site_traffic_events")
    .select("occurred_at, day_utc, hour_utc, referrer_host, path, country")
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(20000)

  if (error) {
    if (String(error.message || "").includes("site_traffic_events")) return empty
    throw error
  }

  const rows = data ?? []
  if (rows.length === 0) return empty

  const byDay = new Map<string, number>()
  const byHour = new Map<number, number>()
  const byRef = new Map<string, number>()
  const byPath = new Map<string, number>()
  const byCountry = new Map<string, number>()
  let totalToday = 0
  let total7 = 0
  let total30 = 0
  let dataSince: string | null = null

  for (const row of rows) {
    const day = String((row as { day_utc?: string }).day_utc ?? "")
    const hour = Number((row as { hour_utc?: number }).hour_utc ?? 0)
    const ref = String((row as { referrer_host?: string | null }).referrer_host ?? "").trim() || "(direct / unknown)"
    const path = String((row as { path?: string }).path ?? "/")
    const country = String((row as { country?: string | null }).country ?? "").trim() || "—"
    const occurred = String((row as { occurred_at?: string }).occurred_at ?? "")

    if (occurred && (!dataSince || occurred < dataSince)) dataSince = occurred

    if (day === today) totalToday++
    if (day >= day7) total7++
    if (day >= day30) total30++

    byDay.set(day, (byDay.get(day) ?? 0) + 1)
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1)
    byRef.set(ref, (byRef.get(ref) ?? 0) + 1)
    byPath.set(path, (byPath.get(path) ?? 0) + 1)
    byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
  }

  const dayKeys: string[] = []
  for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
    dayKeys.push(startOfUtcDay(addUtcDays(now, -i)))
  }

  return {
    totalToday,
    totalLast7Days: total7,
    totalLast30Days: total30,
    viewsByDay: dayKeys.map((day) => ({ day, count: byDay.get(day) ?? 0 })),
    viewsByHourUtc: Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 })),
    topReferrers: [...byRef.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([host, count]) => ({ host, count })),
    topPaths: [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([path, count]) => ({ path, count })),
    topCountries: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([country, count]) => ({ country, count })),
    dataSince,
  }
}
