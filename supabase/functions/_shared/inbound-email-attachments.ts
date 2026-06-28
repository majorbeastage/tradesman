import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export const COMM_ATTACHMENTS_BUCKET = "comm-attachments"

export async function uploadBytesToCommAttachments(
  supabase: SupabaseClient,
  params: {
    storagePath: string
    body: ArrayBuffer
    contentType: string
    logTag?: string
  },
): Promise<string | null> {
  const tag = params.logTag ?? "comm-storage"
  const safePath = params.storagePath.replace(/[^a-zA-Z0-9/_\-.]/g, "").replace(/\/+/g, "/")
  if (!safePath) {
    console.error(`[${tag}] empty storage path`)
    return null
  }
  try {
    const { error } = await supabase.storage.from(COMM_ATTACHMENTS_BUCKET).upload(safePath, params.body, {
      upsert: true,
      contentType: params.contentType || "application/octet-stream",
    })
    if (error) {
      console.error(`[${tag}] upload`, error.message)
      return null
    }
    const { data } = supabase.storage.from(COMM_ATTACHMENTS_BUCKET).getPublicUrl(safePath)
    return data.publicUrl
  } catch (e) {
    console.error(`[${tag}]`, e instanceof Error ? e.message : e)
    return null
  }
}

export async function insertCommunicationAttachmentRow(
  supabase: SupabaseClient,
  row: {
    user_id: string
    communication_event_id: string
    storage_path: string
    public_url: string
    content_type?: string | null
    file_name?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from("communication_attachments").insert({
    user_id: row.user_id,
    communication_event_id: row.communication_event_id,
    storage_path: row.storage_path,
    public_url: row.public_url,
    content_type: row.content_type ?? null,
    file_name: row.file_name ?? null,
  })
  if (error && !String(error.message || "").includes("communication_attachments")) {
    throw error
  }
}

/** Fetch Resend receiving attachments, mirror to comm-attachments + communication_attachments. */
export async function mirrorResendInboundEmailAttachments(
  supabase: SupabaseClient,
  params: {
    apiKey: string
    resendReceivedId: string
    userId: string
    eventId: string
    logTag?: string
  },
): Promise<void> {
  const tag = params.logTag ?? "resend-inbound-att"
  try {
    const attRes = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(params.resendReceivedId)}/attachments`,
      { headers: { Authorization: `Bearer ${params.apiKey}` } },
    )
    if (!attRes.ok) return
    const attJson = (await attRes.json()) as {
      data?: Array<{ id?: string; filename?: string; content_type?: string; download_url?: string }>
    }
    const items = Array.isArray(attJson.data) ? attJson.data : []
    for (let i = 0; i < items.length; i++) {
      const a = items[i]
      const dl = typeof a.download_url === "string" ? a.download_url : ""
      if (!dl) continue
      const dlRes = await fetch(dl)
      if (!dlRes.ok) continue
      const arrayBuffer = await dlRes.arrayBuffer()
      const contentType = dlRes.headers.get("content-type") || a.content_type || "application/octet-stream"
      const safeName = (a.filename || `attachment-${i}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
      const path = `inbound-email/${params.userId}/${params.eventId}/${i}-${safeName}`
      const publicUrl = await uploadBytesToCommAttachments(supabase, {
        storagePath: path,
        body: arrayBuffer,
        contentType,
        logTag: tag,
      })
      if (publicUrl) {
        await insertCommunicationAttachmentRow(supabase, {
          user_id: params.userId,
          communication_event_id: params.eventId,
          storage_path: path,
          public_url: publicUrl,
          content_type: contentType,
          file_name: a.filename || safeName,
        })
      }
    }
  } catch (e) {
    console.warn(`[${tag}]`, e instanceof Error ? e.message : e)
  }
}
