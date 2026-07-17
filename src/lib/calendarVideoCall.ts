/** Scheduled internal video call attached to a calendar event (stored in metadata). */

export const CALENDAR_VIDEO_CALL_KEY = "video_call_v1"

export type CalendarVideoCall = {
  /** Stable room id every invitee joins (WebRTC conference). */
  roomId: string
  /** true = video, false = audio-only huddle. */
  video: boolean
  /** Internal teammate user ids invited to the call. */
  inviteeUserIds: string[]
}

export function readCalendarVideoCall(metadata: unknown): CalendarVideoCall | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const v = (metadata as Record<string, unknown>)[CALENDAR_VIDEO_CALL_KEY]
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const roomId = typeof o.roomId === "string" ? o.roomId.trim() : ""
  if (!roomId) return null
  const inviteeUserIds = Array.isArray(o.inviteeUserIds)
    ? o.inviteeUserIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  return { roomId, video: o.video !== false, inviteeUserIds }
}

export function mergeCalendarVideoCall(metadata: unknown, call: CalendarVideoCall | null): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  if (call && call.roomId.trim()) {
    base[CALENDAR_VIDEO_CALL_KEY] = {
      roomId: call.roomId.trim(),
      video: call.video !== false,
      inviteeUserIds: [...new Set(call.inviteeUserIds.filter((x) => x && x.trim()))],
    }
  } else {
    delete base[CALENDAR_VIDEO_CALL_KEY]
  }
  return base
}

export function newVideoCallRoomId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `vc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}
