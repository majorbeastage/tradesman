import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Server-side port of src/lib/userNotifications.ts emit for Vercel API routes.
 * Creates a desktop notification-center row when the owner has desktop delivery
 * enabled for `kind`. Best-effort — never throws.
 */

type ServerNotificationKind =
  | "new_lead"
  | "estimate_approved"
  | "calendar_upcoming"
  | "calendar_completed"
  | "workflow_step_completed"
  | "assigned_step_ready"

function desktopEnabled(metadata: unknown, kind: ServerNotificationKind): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return kind !== "workflow_step_completed"
  const raw = (metadata as Record<string, unknown>)["notification_prefs_v1"]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    // No saved prefs yet — default desktop on for everything except the noisy
    // "workflow step completed" (mirrors defaultNotificationPrefs on the client).
    return kind !== "workflow_step_completed"
  }
  const triggers = (raw as Record<string, unknown>).triggers
  if (!triggers || typeof triggers !== "object" || Array.isArray(triggers)) return false
  const t = (triggers as Record<string, unknown>)[kind]
  return !!t && typeof t === "object" && (t as Record<string, unknown>).desktop === true
}

function pageForKind(kind: ServerNotificationKind): string {
  switch (kind) {
    case "new_lead":
      return "leads"
    case "estimate_approved":
      return "quotes"
    case "calendar_upcoming":
    case "calendar_completed":
      return "calendar"
    default:
      return "customers"
  }
}

export async function emitUserNotificationServer(
  sb: SupabaseClient,
  input: {
    ownerUserId: string | null | undefined
    kind: ServerNotificationKind
    title: string
    body?: string | null
    customerId?: string | null
    quoteId?: string | null
    calendarEventId?: string | null
  },
): Promise<boolean> {
  try {
    if (!input.ownerUserId) return false
    const { data: profile } = await sb.from("profiles").select("metadata").eq("id", input.ownerUserId).maybeSingle()
    if (!desktopEnabled((profile as { metadata?: unknown } | null)?.metadata, input.kind)) return false

    const { error } = await sb.from("user_notifications").insert({
      user_id: input.ownerUserId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      customer_id: input.customerId ?? null,
      quote_id: input.quoteId ?? null,
      calendar_event_id: input.calendarEventId ?? null,
      metadata: { page: pageForKind(input.kind) },
    })
    if (error) {
      if (/user_notifications|does not exist|relation|schema cache/i.test(error.message)) return false
      console.warn("[userNotifications:server] insert", error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn("[userNotifications:server]", e instanceof Error ? e.message : e)
    return false
  }
}
