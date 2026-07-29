export const GOOGLE_RESERVE_METADATA_KEY = "google_reserve"

export type GoogleReserveFeedStatus =
  | "not_configured"
  | "awaiting_partner_approval"
  | "sandbox"
  | "ready_for_feed"
  | "active"
  | "paused"
  | "error"

export type GoogleReserveSettings = {
  enabled: boolean
  /** Profile user id whose Tradesman calendar supplies booking inventory. */
  calendarOwnerUserId: string
  calendarLabel: string
  /** Google Business Profile Place ID for the location represented by this calendar. */
  gbpPlaceId: string
  /** Merchant identifier Tradesman will use in future Actions Center feeds. */
  partnerMerchantId: string
  feedStatus: GoogleReserveFeedStatus
  /** Manual Phase A audit field; Phase B will update this after successful feed syncs. */
  lastSyncAt: string
  notes: string
  updatedAt: string
  updatedBy: string
}

export const GOOGLE_RESERVE_FEED_STATUS_OPTIONS: Array<{
  id: GoogleReserveFeedStatus
  label: string
}> = [
  { id: "not_configured", label: "Not configured" },
  { id: "awaiting_partner_approval", label: "Awaiting Actions Center partner approval" },
  { id: "sandbox", label: "Sandbox / testing" },
  { id: "ready_for_feed", label: "Approved — feed setup pending" },
  { id: "active", label: "Active (feed connected)" },
  { id: "paused", label: "Paused" },
  { id: "error", label: "Feed error" },
]

export const EMPTY_GOOGLE_RESERVE_SETTINGS: GoogleReserveSettings = {
  enabled: false,
  calendarOwnerUserId: "",
  calendarLabel: "Office Manager — Google Reserve",
  gbpPlaceId: "",
  partnerMerchantId: "",
  feedStatus: "not_configured",
  lastSyncAt: "",
  notes: "",
  updatedAt: "",
  updatedBy: "",
}

const FEED_STATUSES = new Set<GoogleReserveFeedStatus>(
  GOOGLE_RESERVE_FEED_STATUS_OPTIONS.map((option) => option.id),
)

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function parseGoogleReserveSettings(metadata: unknown): GoogleReserveSettings {
  const raw = objectRecord(objectRecord(metadata)[GOOGLE_RESERVE_METADATA_KEY])
  const rawStatus = String(raw.feedStatus ?? "not_configured") as GoogleReserveFeedStatus
  return {
    enabled: raw.enabled === true,
    calendarOwnerUserId: String(raw.calendarOwnerUserId ?? ""),
    calendarLabel: String(raw.calendarLabel ?? EMPTY_GOOGLE_RESERVE_SETTINGS.calendarLabel),
    gbpPlaceId: String(raw.gbpPlaceId ?? ""),
    partnerMerchantId: String(raw.partnerMerchantId ?? ""),
    feedStatus: FEED_STATUSES.has(rawStatus) ? rawStatus : "not_configured",
    lastSyncAt: String(raw.lastSyncAt ?? ""),
    notes: String(raw.notes ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
    updatedBy: String(raw.updatedBy ?? ""),
  }
}

export function mergeGoogleReserveSettings(
  metadata: unknown,
  settings: GoogleReserveSettings,
): Record<string, unknown> {
  return {
    ...objectRecord(metadata),
    [GOOGLE_RESERVE_METADATA_KEY]: { ...settings },
  }
}
