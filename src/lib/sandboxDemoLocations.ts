/** Demo GPS pins for sandbox team personas — stored on profile metadata, not auth.users. */

import type { SandboxDemoTeamMember } from "./sandboxDemoTeam"

export type SandboxDemoLocation = {
  lat: number
  lng: number
  updated_at: string
  label?: string
}

export type SandboxDemoLocationsV1 = Record<string, SandboxDemoLocation>

export const SANDBOX_DEMO_LOCATIONS_META_KEY = "sandbox_demo_locations_v1"

/** Spread around Tradesman Demo, TX (99901) for map training. */
const DEFAULT_DEMO_COORDS: Record<string, { lat: number; lng: number }> = {
  "sandbox-demo-office-maria": { lat: 32.7767, lng: -96.797 },
  "sandbox-demo-field-jake": { lat: 32.802, lng: -96.769 },
  "sandbox-demo-field-sam": { lat: 32.755, lng: -96.82 },
  "sandbox-demo-internal-lee": { lat: 32.79, lng: -96.81 },
}

export function buildDefaultSandboxDemoLocations(team: SandboxDemoTeamMember[]): SandboxDemoLocationsV1 {
  const now = new Date().toISOString()
  const out: SandboxDemoLocationsV1 = {}
  for (const m of team) {
    const c = DEFAULT_DEMO_COORDS[m.id] ?? { lat: 32.7767 + Math.random() * 0.04 - 0.02, lng: -96.797 + Math.random() * 0.04 - 0.02 }
    out[m.id] = { lat: c.lat, lng: c.lng, updated_at: now, label: m.label }
  }
  return out
}

export function parseSandboxDemoLocations(raw: unknown): SandboxDemoLocationsV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: SandboxDemoLocationsV1 = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.startsWith("sandbox-demo-") || !v || typeof v !== "object" || Array.isArray(v)) continue
    const o = v as Record<string, unknown>
    const lat = typeof o.lat === "number" ? o.lat : NaN
    const lng = typeof o.lng === "number" ? o.lng : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out[k] = {
      lat,
      lng,
      updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
      label: typeof o.label === "string" ? o.label : undefined,
    }
  }
  return out
}

export function mergeSandboxDemoLocationsMetadata(
  prev: Record<string, unknown>,
  locations: SandboxDemoLocationsV1,
): Record<string, unknown> {
  return { ...prev, [SANDBOX_DEMO_LOCATIONS_META_KEY]: locations }
}
