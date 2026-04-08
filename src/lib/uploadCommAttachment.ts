import { supabase } from "./supabase"

const BUCKET = "comm-attachments"

/**
 * Upload files to public comm-attachments bucket under the signed-in user's folder.
 * Returns public URLs for use with /api/outbound-messages (email attachments, MMS).
 */
export async function uploadFilesForOutbound(userId: string, files: File[], subfolder: string): Promise<string[]> {
  if (!supabase || !userId || !files.length) return []
  const safeSub = subfolder.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 64) || "misc"
  const urls: string[] = []
  for (const f of files) {
    const name = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
    const path = `${userId}/${safeSub}/${crypto.randomUUID()}-${name}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
      upsert: false,
      contentType: f.type || "application/octet-stream",
    })
    if (error) {
      console.error("[uploadCommAttachment]", error.message)
      continue
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    if (data?.publicUrl) urls.push(data.publicUrl)
  }
  return urls
}

export async function uploadEntityAttachmentFile(params: {
  userId: string
  quoteId?: string | null
  calendarEventId?: string | null
  file: File
}): Promise<{ public_url: string; storage_path: string } | null> {
  if (!supabase) return null
  const { userId, file, quoteId, calendarEventId } = params
  const prefix =
    quoteId != null && quoteId !== ""
      ? `${userId}/quotes/${quoteId}`
      : calendarEventId != null && calendarEventId !== ""
        ? `${userId}/calendar/${calendarEventId}`
        : null
  if (!prefix) return null
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
  const path = `${prefix}/${crypto.randomUUID()}-${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  })
  if (error) {
    console.error("[uploadEntityAttachment]", error.message)
    return null
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) return null
  return { public_url: data.publicUrl, storage_path: path }
}
