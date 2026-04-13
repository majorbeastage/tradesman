/** Mirrors src/types/notificationPreferences.ts — quotes channel prefs in profiles.metadata.tabNotifications */

export const NOTIFICATION_METADATA_KEY = "tabNotifications"

export type StatusChannelPrefs = {
  onStatusChange?: boolean
  statuses?: string[]
}

export type QuotesTabPrefs = {
  push?: StatusChannelPrefs
  email?: StatusChannelPrefs
  sms?: StatusChannelPrefs
}

export function normStatus(s: string): string {
  return s.trim().toLowerCase()
}

export function parseQuotesTabPrefs(metadata: Record<string, unknown> | null): QuotesTabPrefs | null {
  if (!metadata || typeof metadata !== "object") return null
  const inner = metadata[NOTIFICATION_METADATA_KEY] as Record<string, unknown> | undefined
  if (!inner || typeof inner !== "object") return null
  const quotes = inner.quotes as QuotesTabPrefs | undefined
  if (!quotes || typeof quotes !== "object") return null
  return quotes
}

export function shouldNotifyChannel(
  channel: StatusChannelPrefs | undefined,
  newStatus: string,
): boolean {
  if (!channel?.onStatusChange) return false
  const ns = normStatus(newStatus)
  const statuses = Array.isArray(channel.statuses) ? channel.statuses.map((x) => normStatus(String(x))) : []
  return statuses.includes(ns)
}
