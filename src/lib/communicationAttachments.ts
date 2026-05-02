import { supabase } from "./supabase"
import type { AttachmentStripItem } from "../components/AttachmentStrip"

/**
 * Load inbound communication file rows for timeline UIs (conversation, leads, quotes).
 */
export async function loadAttachmentsByCommunicationEventIds(eventIds: string[]): Promise<Record<string, AttachmentStripItem[]>> {
  const out: Record<string, AttachmentStripItem[]> = {}
  if (!supabase || eventIds.length === 0) return out
  const { data, error } = await supabase
    .from("communication_attachments")
    .select("id, communication_event_id, public_url, file_name, content_type")
    .in("communication_event_id", eventIds)
  if (error || !data?.length) return out
  for (const row of data as {
    id: string
    communication_event_id: string
    public_url: string
    file_name?: string | null
    content_type?: string | null
  }[]) {
    const eid = String(row.communication_event_id)
    if (!out[eid]) out[eid] = []
    out[eid].push({
      id: String(row.id),
      public_url: String(row.public_url),
      file_name: row.file_name,
      content_type: row.content_type,
    })
  }
  return out
}

export type EntityAttachmentRow = {
  id: string
  public_url: string
  storage_path: string
  file_name?: string | null
  content_type?: string | null
  created_at?: string | null
  metadata?: Record<string, unknown> | null
}

export function parseQuoteAttachmentMeta(meta: unknown): {
  note: string
  attachToCustomerCopy: boolean
  includeNote: boolean
} {
  if (!meta || typeof meta !== "object" || Array.isArray(meta))
    return { note: "", attachToCustomerCopy: false, includeNote: false }
  const m = meta as Record<string, unknown>
  const note = typeof m.note === "string" ? m.note : ""
  const attachToCustomerCopy = m.attach_to_customer_copy === true
  const includeNote = m.include_note === true
  return { note, attachToCustomerCopy, includeNote }
}

/** Whether an attachment is likely an image (thumbnail in lists instead of the file name). */
/** Quote/calendar files flagged “Attach this to customer’s copy” in metadata. */
export function entityAttachmentsForCustomerCopy(rows: EntityAttachmentRow[]): EntityAttachmentRow[] {
  return rows.filter((r) => parseQuoteAttachmentMeta(r.metadata).attachToCustomerCopy)
}

export function isProbablyImageAttachment(
  contentType: string | null | undefined,
  publicUrl: string,
  fileName?: string | null,
): boolean {
  const t = (contentType || "").toLowerCase()
  if (t.startsWith("image/")) return true
  const u = (publicUrl || "").toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(u)) return true
  const n = (fileName || "").toLowerCase()
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/.test(n)
}

export async function loadEntityAttachmentsForQuote(quoteId: string): Promise<EntityAttachmentRow[]> {
  if (!supabase || !quoteId) return []
  const { data, error } = await supabase
    .from("entity_attachments")
    .select("id, public_url, storage_path, file_name, content_type, created_at, metadata")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data as EntityAttachmentRow[]
}

export async function loadEntityAttachmentsForCalendarEvent(calendarEventId: string): Promise<EntityAttachmentRow[]> {
  if (!supabase || !calendarEventId) return []
  const { data, error } = await supabase
    .from("entity_attachments")
    .select("id, public_url, storage_path, file_name, content_type, created_at, metadata")
    .eq("calendar_event_id", calendarEventId)
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data as EntityAttachmentRow[]
}

export async function deleteEntityAttachmentRow(row: EntityAttachmentRow): Promise<boolean> {
  if (!supabase) return false
  const { error: delObj } = await supabase.storage.from("comm-attachments").remove([row.storage_path])
  if (delObj) console.warn("[entity_attachments] storage remove", delObj.message)
  const { error } = await supabase.from("entity_attachments").delete().eq("id", row.id)
  if (error) {
    console.error(error.message)
    return false
  }
  return true
}
