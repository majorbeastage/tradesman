/** calendar_events.metadata keys for per-event site override (optional). */
export const JOB_SITE_ADDRESS_KEY = "job_site_address"
export const JOB_SITE_LAT_KEY = "job_site_lat"
export const JOB_SITE_LNG_KEY = "job_site_lng"

export type CustomerServiceLocation = {
  service_address?: string | null
  service_lat?: number | null
  service_lng?: number | null
}

export function parseMetadataNumber(meta: unknown, key: string): number | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const v = (meta as Record<string, unknown>)[key]
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseFloat(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function parseJobSiteFromEventMetadata(metadata: unknown): { address: string; lat: number | null; lng: number | null } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { address: "", lat: null, lng: null }
  }
  const m = metadata as Record<string, unknown>
  const address = typeof m[JOB_SITE_ADDRESS_KEY] === "string" ? m[JOB_SITE_ADDRESS_KEY].trim() : ""
  const lat = parseMetadataNumber(metadata, JOB_SITE_LAT_KEY)
  const lng = parseMetadataNumber(metadata, JOB_SITE_LNG_KEY)
  return { address, lat, lng }
}

export function coordsFromCustomer(c: CustomerServiceLocation | null | undefined): { lat: number; lng: number } | null {
  if (!c) return null
  const lat = typeof c.service_lat === "number" && Number.isFinite(c.service_lat) ? c.service_lat : null
  const lng = typeof c.service_lng === "number" && Number.isFinite(c.service_lng) ? c.service_lng : null
  if (lat == null || lng == null) return null
  return { lat, lng }
}

/** Prefer event-specific coords, then customer service coords. */
export function resolveJobMapCoords(args: {
  eventMetadata: unknown
  customer: CustomerServiceLocation | null | undefined
}): { lat: number; lng: number; source: "event" | "customer" } | null {
  const fromMeta = parseJobSiteFromEventMetadata(args.eventMetadata)
  if (fromMeta.lat != null && fromMeta.lng != null) return { lat: fromMeta.lat, lng: fromMeta.lng, source: "event" }
  const fromCust = coordsFromCustomer(args.customer)
  if (fromCust) return { ...fromCust, source: "customer" }
  return null
}

export function mergeJobSiteIntoMetadata(
  prevMeta: unknown,
  patch: { job_site_address: string; job_site_lat: string; job_site_lng: string },
): Record<string, unknown> {
  const prev =
    prevMeta && typeof prevMeta === "object" && !Array.isArray(prevMeta) ? { ...(prevMeta as Record<string, unknown>) } : {}
  const addr = patch.job_site_address.trim()
  const latStr = patch.job_site_lat.trim()
  const lngStr = patch.job_site_lng.trim()
  const latN = latStr ? Number.parseFloat(latStr) : Number.NaN
  const lngN = lngStr ? Number.parseFloat(lngStr) : Number.NaN
  if (addr) prev[JOB_SITE_ADDRESS_KEY] = addr
  else delete prev[JOB_SITE_ADDRESS_KEY]
  if (Number.isFinite(latN)) prev[JOB_SITE_LAT_KEY] = latN
  else delete prev[JOB_SITE_LAT_KEY]
  if (Number.isFinite(lngN)) prev[JOB_SITE_LNG_KEY] = lngN
  else delete prev[JOB_SITE_LNG_KEY]
  return prev
}

const NOMINATIM_HEADERS: Record<string, string> = {
  Accept: "application/json",
  /** Prefer English labels when the browser locale would otherwise return local script (e.g. Cyrillic street names). */
  "Accept-Language": "en-US,en",
  "User-Agent": "TradesmanApp/1.0 (team map; contact: support@tradesman-us.com)",
}

export function addressLooksCyrillic(s: string): boolean {
  return /[\u0400-\u04FF]/.test(s)
}

/** Nominatim forward geocode (browser). Respect usage policy: debounce + single user agent string. */
export async function geocodeAddressToLatLng(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim()
  if (!q || typeof fetch !== "function") return null
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "json")
  url.searchParams.set("limit", "1")
  url.searchParams.set("q", q)
  const res = await fetch(url.toString(), {
    headers: NOMINATIM_HEADERS,
  })
  if (!res.ok) return null
  const data = (await res.json()) as Array<{ lat?: string; lon?: string }>
  const row = data?.[0]
  if (!row?.lat || !row?.lon) return null
  const lat = Number.parseFloat(row.lat)
  const lng = Number.parseFloat(row.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** English-preferring reverse geocode for map popups when stored addresses are in a local script. */
export async function reverseGeocodeLatLngToAddressEn(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof fetch !== "function") return null
  const url = new URL("https://nominatim.openstreetmap.org/reverse")
  url.searchParams.set("format", "json")
  url.searchParams.set("lat", String(lat))
  url.searchParams.set("lon", String(lng))
  const res = await fetch(url.toString(), { headers: NOMINATIM_HEADERS })
  if (!res.ok) return null
  const j = (await res.json()) as { display_name?: string }
  const d = typeof j?.display_name === "string" ? j.display_name.trim() : ""
  return d || null
}
